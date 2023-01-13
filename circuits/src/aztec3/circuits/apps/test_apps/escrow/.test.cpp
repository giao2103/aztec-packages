#include "index.hpp"
#include "contract.hpp"

// #include <aztec3/circuits/abis/call_context.hpp>
// #include <aztec3/circuits/abis/function_signature.hpp>

// #include <aztec3/circuits/apps/function_execution_context.hpp>

#include <gtest/gtest.h>
#include <common/test.hpp>
// #include <common/serialize.hpp>
// #include <stdlib/types/turbo.hpp>
// #include <numeric/random/engine.hpp>

namespace aztec3::circuits::apps::test_apps::escrow {

class escrow_tests : public ::testing::Test {
  protected:
    FunctionExecutionContext get_test_exec_ctx()
    {
        C composer;
        DB db;

        const NT::address contract_address = 12345;
        const NT::fr msg_sender_private_key = 123456789;
        const NT::address msg_sender = NT::fr(
            uint256_t(0x01071e9a23e0f7edULL, 0x5d77b35d1830fa3eULL, 0xc6ba3660bb1f0c0bULL, 0x2ef9f7f09867fd6eULL));

        const FunctionSignature<NT> function_signature{
            .function_encoding = 1, // TODO: deduce this from the contract, somehow.
            .is_private = true,
            .is_constructor = false,
        };

        const CallContext<NT> call_context{
            .msg_sender = msg_sender,
            .storage_contract_address = contract_address,
            .tx_origin = msg_sender,
            .is_delegate_call = false,
            .is_static_call = false,
            .is_contract_deployment = false,
            .reference_block_num = 0,
        };

        NativeOracle oracle =
            NativeOracle(db, contract_address, function_signature, call_context, msg_sender_private_key);
        OracleWrapper oracle_wrapper = OracleWrapper(composer, oracle);

        FunctionExecutionContext exec_ctx(composer, oracle_wrapper);

        return exec_ctx;
    };
};

TEST_F(escrow_tests, test_deposit)
{
    auto exec_ctx = get_test_exec_ctx();
    auto& composer = exec_ctx.composer;

    auto amount = NT::fr(5);
    auto asset_id = NT::fr(1);
    auto memo = NT::fr(999);

    auto result = deposit(exec_ctx, amount, asset_id, memo);
    info("result: ", result);

    info("computed witness: ", composer.computed_witness);
    info("witness: ", composer.witness);
    // info("constant variables: ", composer.constant_variables);
    // info("variables: ", composer.variables);
    info("failed?: ", composer.failed);
    info("err: ", composer.err);
    info("n: ", composer.n);
}

TEST_F(escrow_tests, test_transfer)
{
    auto exec_ctx = get_test_exec_ctx();
    auto& composer = exec_ctx.composer;

    auto amount = NT::fr(5);
    auto to = NT::address(657756);
    auto asset_id = NT::fr(1);
    auto memo = NT::fr(999);
    auto reveal_msg_sender_to_recipient = true;
    auto fee = NT::fr(2);

    transfer(exec_ctx, amount, to, asset_id, memo, reveal_msg_sender_to_recipient, fee);

    info("computed witness: ", composer.computed_witness);
    info("witness: ", composer.witness);
    // info("constant variables: ", composer.constant_variables);
    // info("variables: ", composer.variables);
    info("failed?: ", composer.failed);
    info("err: ", composer.err);
    info("n: ", composer.n);
}

TEST_F(escrow_tests, test_withdraw)
{
    auto exec_ctx = get_test_exec_ctx();
    auto& composer = exec_ctx.composer;

    auto amount = NT::fr(5);
    auto asset_id = NT::fr(1);
    auto memo = NT::fr(999);
    auto l1_withdrawal_address = NT::fr(657756);
    auto fee = NT::fr(2);

    withdraw(exec_ctx, amount, asset_id, memo, l1_withdrawal_address, fee);

    info("computed witness: ", composer.computed_witness);
    info("witness: ", composer.witness);
    // info("constant variables: ", composer.constant_variables);
    // info("variables: ", composer.variables);
    info("failed?: ", composer.failed);
    info("err: ", composer.err);
    info("n: ", composer.n);
}

} // namespace aztec3::circuits::apps::test_apps::escrow