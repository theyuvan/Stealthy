// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title StealthKeyRegistry
/// @notice Maps an address to its Stealthy meta-address so senders can pay "0xAlice" privately.
/// @dev Follows the ERC-6538 interface (schemeId-keyed registry, EIP-712 registration on behalf,
///      nonce invalidation). Registering links a public wallet to a *meta-address*, never to any
///      individual payment: every payment still lands on a fresh, unlinkable commitment.
contract StealthKeyRegistry is EIP712 {
    /// @notice Stealthy scheme: 33-byte secp256k1 viewing key || 32-byte Poseidon spending key.
    uint256 public constant SCHEME_ID = 1001;
    uint256 public constant META_ADDRESS_LENGTH = 65;

    bytes32 public constant ERC6538REGISTRY_ENTRY_TYPE_HASH =
        keccak256("Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)");

    /// @dev BN254 scalar field order; the spending key is a Poseidon output and must be below it.
    uint256 private constant SNARK_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    mapping(address registrant => mapping(uint256 schemeId => bytes)) public stealthMetaAddressOf;
    mapping(address registrant => uint256) public nonceOf;

    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    error InvalidMetaAddress();
    error UnsupportedScheme();
    error InvalidSignature();

    constructor() EIP712("ERC6538Registry", "1.0") {}

    /// @notice Register (or rotate) the caller's meta-address.
    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        _register(msg.sender, schemeId, stealthMetaAddress);
    }

    /// @notice Register on behalf of `registrant` with an EIP-712 or ERC-1271 signature,
    ///         e.g. so a relayer can onboard a user who holds no ETH yet.
    function registerKeysOnBehalf(
        address registrant,
        uint256 schemeId,
        bytes calldata signature,
        bytes calldata stealthMetaAddress
    ) external {
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ERC6538REGISTRY_ENTRY_TYPE_HASH, schemeId, keccak256(stealthMetaAddress), nonceOf[registrant]++
                )
            )
        );
        if (!SignatureChecker.isValidSignatureNow(registrant, digest, signature)) revert InvalidSignature();
        _register(registrant, schemeId, stealthMetaAddress);
    }

    /// @notice Invalidate any outstanding registerKeysOnBehalf signature.
    function incrementNonce() external {
        emit NonceIncremented(msg.sender, ++nonceOf[msg.sender]);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _register(address registrant, uint256 schemeId, bytes calldata meta) private {
        if (schemeId != SCHEME_ID) revert UnsupportedScheme();
        if (meta.length != META_ADDRESS_LENGTH) revert InvalidMetaAddress();
        // Compressed secp256k1 point prefix.
        if (meta[0] != 0x02 && meta[0] != 0x03) revert InvalidMetaAddress();
        uint256 spendPub = uint256(bytes32(meta[33:65]));
        if (spendPub == 0 || spendPub >= SNARK_FIELD) revert InvalidMetaAddress();

        stealthMetaAddressOf[registrant][schemeId] = meta;
        emit StealthMetaAddressSet(registrant, schemeId, meta);
    }
}
