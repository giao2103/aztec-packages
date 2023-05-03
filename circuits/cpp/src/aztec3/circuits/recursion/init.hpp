#pragma once
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include <aztec3/utils/types/native_types.hpp>

#include <barretenberg/stdlib/recursion/verifier/program_settings.hpp>
#include <barretenberg/stdlib/recursion/verifier/verifier.hpp>

namespace aztec3::circuits::recursion {
// Composer
using Composer = plonk::UltraComposer;

// Generic types:
using CT = aztec3::utils::types::CircuitTypes<Composer>;
using NT = aztec3::utils::types::NativeTypes;
using aztec3::utils::types::to_ct;

// Recursion types and methods
using plonk::stdlib::recursion::verify_proof;
using transcript::Manifest;

}  // namespace aztec3::circuits::recursion