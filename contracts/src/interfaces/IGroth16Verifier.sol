// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface of the snarkjs-generated verifier for the `stealth_withdraw` circuit.
/// @dev Public signals, in order: commitment, recipient, relayer, fee.
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals
    ) external view returns (bool);
}
