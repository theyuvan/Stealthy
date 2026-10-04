// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {IGroth16Verifier} from "../src/interfaces/IGroth16Verifier.sol";
import {StealthKeyRegistry} from "../src/StealthKeyRegistry.sol";
import {StealthPool} from "../src/StealthPool.sol";

/// @notice Deploys verifier + registry + pool and allowlists the chain's stablecoins and ETH.
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia  --account deployer --broadcast --verify
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --account deployer --broadcast
/// Writes deployments/<chainId>.json, which the frontend reads.
contract Deploy is Script {
    // Paxos Global Dollar (USDG) — docs.paxos.com/guides/stablecoin/usdg/testnet
    address internal constant USDG_ARBITRUM_SEPOLIA = 0xFFC95faa3d63Cde504a05B567C600B78C0b41892;
    address internal constant USDG_ROBINHOOD_TESTNET = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    // Circle USDC — developers.circle.com/stablecoins/usdc-contract-addresses
    address internal constant USDC_ARBITRUM_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;
    address internal constant USDC_ARBITRUM_ONE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    function _tokens() internal view returns (address usdg, address usdc) {
        if (block.chainid == 421614) return (USDG_ARBITRUM_SEPOLIA, USDC_ARBITRUM_SEPOLIA);
        if (block.chainid == 46630) return (USDG_ROBINHOOD_TESTNET, address(0));
        if (block.chainid == 42161) return (vm.envOr("USDG_ADDRESS", address(0)), USDC_ARBITRUM_ONE);
        return (vm.envOr("USDG_ADDRESS", address(0)), vm.envOr("USDC_ADDRESS", address(0)));
    }

    /// @dev On Arbitrum chains block.number is the L1 block, and the ArbSys precompile is absent
    ///      from Foundry's local simulation, so ask the RPC for the L2 block eth_getLogs expects.
    function _l2BlockNumber() internal returns (uint256 n) {
        bytes memory raw = vm.rpc("eth_blockNumber", "[]");
        for (uint256 i; i < raw.length; ++i) {
            n = (n << 8) | uint8(raw[i]);
        }
    }

    function run() external {
        (address usdg, address usdc) = _tokens();
        address owner = vm.envOr("POOL_OWNER", msg.sender);

        uint256 count = 1 + (usdg != address(0) ? 1 : 0) + (usdc != address(0) ? 1 : 0);
        address[] memory allowed = new address[](count);
        uint256 i;
        allowed[i++] = address(0); // native ETH
        if (usdg != address(0)) allowed[i++] = usdg;
        if (usdc != address(0)) allowed[i++] = usdc;

        uint256 startBlock = _l2BlockNumber();
        vm.startBroadcast();
        Groth16Verifier verifier = new Groth16Verifier();
        StealthKeyRegistry registry = new StealthKeyRegistry();
        StealthPool pool = new StealthPool(IGroth16Verifier(address(verifier)), owner, allowed);
        vm.stopBroadcast();

        console.log("Groth16Verifier   ", address(verifier));
        console.log("StealthKeyRegistry", address(registry));
        console.log("StealthPool       ", address(pool));

        // Dry runs (no --broadcast) must never overwrite the addresses of a real deployment.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "startBlock", startBlock);
        vm.serializeAddress(k, "verifier", address(verifier));
        vm.serializeAddress(k, "registry", address(registry));
        vm.serializeAddress(k, "usdg", usdg);
        vm.serializeAddress(k, "usdc", usdc);
        string memory json = vm.serializeAddress(k, "pool", address(pool));
        string memory defaultOut = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, vm.envOr("DEPLOYMENT_OUT", defaultOut));
    }
}
