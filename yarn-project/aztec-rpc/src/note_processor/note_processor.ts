import { AztecAddress, CircuitsWasm } from '@aztec/circuits.js';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { AztecNode, KeyStore, L2BlockContext, L2BlockL2Logs, NoteSpendingInfo, PublicKey } from '@aztec/types';
import { Database, NoteSpendingInfoDao, TxDao } from '../database/index.js';
import { getAcirSimulator } from '../simulator/index.js';
import { siloNullifier } from '@aztec/circuits.js/abis';

/**
 * Contains all the decrypted data in this array so that we can later batch insert it all into the database.
 */
interface ProcessedData {
  /**
   * Holds L2 block data and associated context.
   */
  blockContext: L2BlockContext;
  /**
   * Indices of transactions in the block that emitted encrypted log which the user could decrypt.
   */
  userPertainingTxIndices: number[];
  /**
   * A collection of data access objects for note spending info.
   */
  noteSpendingInfoDaos: NoteSpendingInfoDao[];
}

/**
 * NoteProcessor is responsible for decrypting logs and converting them to notes via their originating contracts
 * before storing them against their owner.
 */
export class NoteProcessor {
  /**
   * The latest L2 block number that the note processor has synchronized to.
   */
  private syncedToBlock = 0;

  constructor(
    /**
     * The public counterpart to the private key to be used in note decryption.
     */
    public readonly publicKey: PublicKey,
    private address: AztecAddress, // TODO: Remove once owner addreses are emitted by contracts
    private keyStore: KeyStore,
    private db: Database,
    private node: AztecNode,
    private log = createDebugLogger('aztec:aztec_note_processor'),
  ) {}

  /**
   * Check if the NoteProcessor is synchronised with the remote block height.
   * The function queries the remote block height from the AztecNode and compares it with the syncedToBlock value in the NoteProcessor.
   * If the values are equal, then the NoteProcessor is considered to be synchronised, otherwise not.
   *
   * @returns A boolean indicating whether the NoteProcessor is synchronised with the remote block height or not.
   */
  public async isSynchronised() {
    const remoteBlockHeight = await this.node.getBlockHeight();
    return this.syncedToBlock === remoteBlockHeight;
  }

  /**
   * Process the given L2 block contexts and encrypted logs to update the note processor.
   * It synchronizes the user's account by decrypting the encrypted logs and processing
   * the transactions and auxiliary data associated with them.
   * Throws an error if the number of block contexts and encrypted logs do not match.
   *
   * @param l2BlockContexts - An array of L2 block contexts to be processed.
   * @param encryptedL2BlockLogs - An array of encrypted logs associated with the L2 block contexts.
   * @returns A promise that resolves once the processing is completed.
   */
  public async process(l2BlockContexts: L2BlockContext[], encryptedL2BlockLogs: L2BlockL2Logs[]): Promise<void> {
    if (l2BlockContexts.length !== encryptedL2BlockLogs.length) {
      throw new Error(
        `Number of blocks and EncryptedLogs is not equal. Received ${l2BlockContexts.length} blocks, ${encryptedL2BlockLogs.length} encrypted logs.`,
      );
    }
    if (!l2BlockContexts.length) {
      return;
    }

    const blocksAndNoteSpendingInfo: ProcessedData[] = [];

    // Iterate over both blocks and encrypted logs.
    for (let blockIndex = 0; blockIndex < encryptedL2BlockLogs.length; ++blockIndex) {
      const { txLogs } = encryptedL2BlockLogs[blockIndex];
      let logIndexWithinBlock = 0;
      const dataStartIndexForBlock =
        l2BlockContexts[blockIndex].block.startPrivateDataTreeSnapshot.nextAvailableLeafIndex;

      // We are using set for `userPertainingTxIndices` to avoid duplicates. This would happen in case there were
      // multiple encrypted logs in a tx pertaining to a user.
      const userPertainingTxIndices: Set<number> = new Set();
      const noteSpendingInfoDaos: NoteSpendingInfoDao[] = [];
      const privateKey = await this.keyStore.getAccountPrivateKey(this.publicKey);
      const curve = await Grumpkin.new();

      // Iterate over all the encrypted logs and try decrypting them. If successful, store the note spending info.
      for (let indexOfTxInABlock = 0; indexOfTxInABlock < txLogs.length; ++indexOfTxInABlock) {
        // Note: Each tx generates a `TxL2Logs` object and for this reason we can rely on its index corresponding
        //       to the index of a tx in a block.
        const txFunctionLogs = txLogs[indexOfTxInABlock].functionLogs;
        for (const functionLogs of txFunctionLogs) {
          for (const logs of functionLogs.logs) {
            const noteSpendingInfo = NoteSpendingInfo.fromEncryptedBuffer(logs, privateKey, curve);
            if (noteSpendingInfo) {
              // We have successfully decrypted the data.
              userPertainingTxIndices.add(indexOfTxInABlock);
              noteSpendingInfoDaos.push({
                ...noteSpendingInfo,
                nullifier: await this.computeSiloedNullifier(noteSpendingInfo),
                index: BigInt(dataStartIndexForBlock + logIndexWithinBlock),
                publicKey: this.publicKey,
              });
            }
            logIndexWithinBlock += 1;
          }
        }
      }

      blocksAndNoteSpendingInfo.push({
        blockContext: l2BlockContexts[blockIndex],
        userPertainingTxIndices: [...userPertainingTxIndices], // Convert set to array.
        noteSpendingInfoDaos,
      });
    }

    await this.processBlocksAndNoteSpendingInfo(blocksAndNoteSpendingInfo);

    this.syncedToBlock = l2BlockContexts[l2BlockContexts.length - 1].block.number;
    this.log(`Synched block ${this.syncedToBlock}`);
  }

  /**
   * Compute the nullifier for a given transaction auxiliary data.
   * The nullifier is calculated using the private key of the account,
   * contract address, and note preimage associated with the noteSpendingInfo.
   * This method assists in identifying spent commitments in the private state.
   *
   * @param noteSpendingInfo - An instance of NoteSpendingInfo containing transaction details.
   * @returns A Fr instance representing the computed nullifier.
   */
  private async computeSiloedNullifier({ contractAddress, storageSlot, notePreimage }: NoteSpendingInfo) {
    const simulator = getAcirSimulator(this.db, this.node, this.node, this.node, this.keyStore);
    const nullifier = await simulator.computeNullifier(contractAddress, storageSlot, notePreimage.items);
    return siloNullifier(await CircuitsWasm.get(), contractAddress, nullifier);
  }

  /**
   * Process the given blocks and their associated transaction auxiliary data.
   * This function updates the database with information about new transactions,
   * user-pertaining transaction indices, and auxiliary data. It also removes nullified
   * transaction auxiliary data from the database. This function keeps track of new nullifiers
   * and ensures all other transactions are updated with newly settled block information.
   *
   * @param blocksAndNoteSpendingInfo - Array of objects containing L2BlockContexts, user-pertaining transaction indices, and NoteSpendingInfoDaos.
   */
  private async processBlocksAndNoteSpendingInfo(blocksAndNoteSpendingInfo: ProcessedData[]) {
    const noteSpendingInfoDaosBatch: NoteSpendingInfoDao[] = [];
    const txDaos: TxDao[] = [];
    let newNullifiers: Fr[] = [];

    for (let i = 0; i < blocksAndNoteSpendingInfo.length; ++i) {
      const { blockContext, userPertainingTxIndices, noteSpendingInfoDaos } = blocksAndNoteSpendingInfo[i];

      // Process all the user pertaining txs.
      userPertainingTxIndices.map((txIndex, j) => {
        const txHash = blockContext.getTxHash(txIndex);
        this.log(`Processing tx ${txHash!.toString()} from block ${blockContext.block.number}`);
        const { newContractData } = blockContext.block.getTx(txIndex);
        const isContractDeployment = !newContractData[0].contractAddress.isZero();
        const noteSpendingInfo = noteSpendingInfoDaos[j];
        const contractAddress = isContractDeployment ? noteSpendingInfo.contractAddress : undefined;
        txDaos.push({
          txHash,
          blockHash: blockContext.getBlockHash(),
          blockNumber: blockContext.block.number,
          origin: this.address,
          contractAddress,
          error: '',
        });
      });
      noteSpendingInfoDaosBatch.push(...noteSpendingInfoDaos);

      newNullifiers = newNullifiers.concat(blockContext.block.newNullifiers);
    }
    if (noteSpendingInfoDaosBatch.length) {
      await this.db.addNoteSpendingInfoBatch(noteSpendingInfoDaosBatch);
      noteSpendingInfoDaosBatch.forEach(noteSpendingInfo => {
        this.log(`Added note spending info with nullifier ${noteSpendingInfo.nullifier.toString()}}`);
      });
    }
    if (txDaos.length) await this.db.addTxs(txDaos);
    const removedNoteSpendingInfo = await this.db.removeNullifiedNoteSpendingInfo(newNullifiers, this.publicKey);
    removedNoteSpendingInfo.forEach(noteSpendingInfo => {
      this.log(`Removed note spending info with nullifier ${noteSpendingInfo.nullifier.toString()}}`);
    });
  }
}