// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StealthKeyRegistry} from "../src/StealthKeyRegistry.sol";

contract StealthKeyRegistryTest is Test {
    StealthKeyRegistry internal registry;
    uint256 internal scheme;

    bytes32 internal constant VIEW_X = hex"b8a4f1d2c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0";
    bytes32 internal constant SPEND = hex"0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9";
    bytes internal META = abi.encodePacked(bytes1(0x02), VIEW_X, SPEND);

    function setUp() public {
        registry = new StealthKeyRegistry();
        scheme = registry.SCHEME_ID();
    }

    function test_RegisterKeys() public {
        address alice = makeAddr("alice");
        vm.expectEmit(address(registry));
        emit StealthKeyRegistry.StealthMetaAddressSet(alice, scheme, META);
        vm.prank(alice);
        registry.registerKeys(scheme, META);
        assertEq(registry.stealthMetaAddressOf(alice, scheme), META);
    }

    function test_RegisterKeys_Rotate() public {
        bytes memory rotated = abi.encodePacked(bytes1(0x03), VIEW_X, SPEND);
        registry.registerKeys(scheme, META);
        registry.registerKeys(scheme, rotated);
        assertEq(registry.stealthMetaAddressOf(address(this), scheme), rotated);
    }

    function test_RevertWhen_WrongLength() public {
        vm.expectRevert(StealthKeyRegistry.InvalidMetaAddress.selector);
        registry.registerKeys(scheme, hex"02b8a4");
    }

    function test_RevertWhen_UncompressedPrefix() public {
        vm.expectRevert(StealthKeyRegistry.InvalidMetaAddress.selector);
        registry.registerKeys(scheme, abi.encodePacked(bytes1(0x04), VIEW_X, SPEND));
    }

    function test_RevertWhen_SpendKeyOutsideField() public {
        bytes memory bad = abi.encodePacked(bytes1(0x02), VIEW_X, bytes32(type(uint256).max));
        vm.expectRevert(StealthKeyRegistry.InvalidMetaAddress.selector);
        registry.registerKeys(scheme, bad);
    }

    function test_RevertWhen_UnsupportedScheme() public {
        vm.expectRevert(StealthKeyRegistry.UnsupportedScheme.selector);
        registry.registerKeys(1, META);
    }

    function _sign(uint256 key, uint256 nonce) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(registry.ERC6538REGISTRY_ENTRY_TYPE_HASH(), scheme, keccak256(META), nonce));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash)));
        return abi.encodePacked(r, s, v);
    }

    function test_RegisterKeysOnBehalf() public {
        (address alice, uint256 key) = makeAddrAndKey("alice");
        bytes memory sig = _sign(key, 0);

        vm.prank(makeAddr("relayer"));
        registry.registerKeysOnBehalf(alice, scheme, sig, META);
        assertEq(registry.stealthMetaAddressOf(alice, scheme), META);
        assertEq(registry.nonceOf(alice), 1);

        vm.expectRevert(StealthKeyRegistry.InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, scheme, sig, META); // replay
    }

    function test_RevertWhen_OnBehalfWrongSigner() public {
        (address alice,) = makeAddrAndKey("alice");
        (, uint256 mallory) = makeAddrAndKey("mallory");
        bytes memory sig = _sign(mallory, 0);
        vm.expectRevert(StealthKeyRegistry.InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, scheme, sig, META);
    }

    function test_IncrementNonceInvalidatesSignature() public {
        (address alice, uint256 key) = makeAddrAndKey("alice");
        bytes memory sig = _sign(key, 0);
        vm.prank(alice);
        registry.incrementNonce();
        vm.expectRevert(StealthKeyRegistry.InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, scheme, sig, META);
    }
}
