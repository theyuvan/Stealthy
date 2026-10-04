/** Order of the BN254 scalar field — every circuit signal must be below this. */
export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

/** Stealth scheme identifier used with the ERC-6538 style key registry. */
export const SCHEME_ID = 1001n

/** Raw meta-address: 33-byte compressed secp256k1 viewing key ‖ 32-byte Poseidon spending key. */
export const META_ADDRESS_BYTES = 65
export const META_ADDRESS_PREFIX = 'st:arb:'
export const VIEWING_KEY_PREFIX = 'svk:'
/** Full private key (viewing + spending). Grants spend rights: never share it. */
export const META_PRIVATE_KEY_PREFIX = 'spk:'

/**
 * Message signed by the user's wallet to derive their Stealthy keys.
 * Chain-agnostic on purpose: the same keys receive on Arbitrum and Robinhood Chain.
 * Changing a single byte here changes every user's keys.
 */
export const KEY_DERIVATION_MESSAGE = [
  'Stealthy',
  '',
  'Sign this message to derive your private Stealthy keys.',
  'The signature is processed only in your browser and is never sent anywhere.',
  'Only sign this message on the Stealthy app.',
  '',
  'Version: 1',
].join('\n')

export const DOMAIN = {
  keySalt: 'Stealthy/v1/keys',
  viewKey: 'Stealthy/v1/view-key',
  spendKey: 'Stealthy/v1/spend-key',
  viewTag: 'Stealthy/v1/view-tag',
  secret: 'Stealthy/v1/shared-secret',
} as const
