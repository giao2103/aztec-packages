/* Autogenerated file, do not edit! */

/* eslint-disable */
import {
  AztecAddress,
  Contract,
  ContractFunctionInteraction,
  ContractMethod,
  DeployMethod,
  Wallet,
} from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { Fr, Point } from '@aztec/foundation/fields';
import { AztecRPC } from '@aztec/types';

import { ChildContractAbi } from '../artifacts/index.js';

/**
 * Type-safe interface for contract Child;
 */
export class ChildContract extends Contract {
  constructor(
    /** The deployed contract's address. */
    address: AztecAddress,
    /** The wallet. */
    wallet: Wallet,
  ) {
    super(address, ChildContractAbi, wallet);
  }

  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  public static deploy(rpc: AztecRPC) {
    return new DeployMethod(Point.ZERO, rpc, ChildContractAbi, Array.from(arguments).slice(1));
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified public key to derive the address.
   */
  public static deployWithPublicKey(rpc: AztecRPC, publicKey: Point) {
    return new DeployMethod(publicKey, rpc, ChildContractAbi, Array.from(arguments).slice(2));
  }

  /**
   * Returns this contract's ABI.
   */
  public static get abi(): ContractAbi {
    return ChildContractAbi;
  }

  /** Type-safe wrappers for the public methods exposed by the contract. */
  public methods!: {
    /** pubStoreValue(new_value: field) */
    pubStoreValue: ((new_value: Fr | bigint | number | { toField: () => Fr }) => ContractFunctionInteraction) &
      Pick<ContractMethod, 'selector'>;

    /** pubValue(base_value: field) */
    pubValue: ((base_value: Fr | bigint | number | { toField: () => Fr }) => ContractFunctionInteraction) &
      Pick<ContractMethod, 'selector'>;

    /** value(input: field) */
    value: ((input: Fr | bigint | number | { toField: () => Fr }) => ContractFunctionInteraction) &
      Pick<ContractMethod, 'selector'>;
  };
}
