import { secp256k1 } from '@noble/curves/secp256k1.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { randomBytes } from '@noble/hashes/utils.js'
import { poseidon1 } from 'poseidon-lite'
import {
  DOMAIN,
  META_ADDRESS_BYTES,
  META_ADDRESS_PREFIX,
  META_PRIVATE_KEY_PREFIX,
  SNARK_FIELD,
  VIEWING_KEY_PREFIX,
} from './constants'
import { bigIntToBytes32, bytesToBigInt, fromHex, reduce, toHex, utf8, type Hex } from './utils'

const CURVE_ORDER = secp256k1.Point.Fn.ORDER

/**
 * A Stealthy identity. Two independent keys give a real scan/spend split:
 *  - the secp256k1 viewing key finds incoming notes (and can be handed to an auditor);
 *  - the Poseidon spending key is the only thing that can produce a withdrawal proof.
 */
export interface StealthKeys {
  viewPriv: Uint8Array // 32 bytes, secp256k1 scalar
  viewPub: Uint8Array // 33 bytes, compressed point
  spendPriv: bigint // BN254 field element
  spendPub: bigint // Poseidon(spendPriv)
}

/** Read-only key: detects incoming payments, cannot spend them. */
export interface ViewingKey {
  viewPriv: Uint8Array
  spendPub: bigint
}

export interface MetaAddress {
  viewPub: Uint8Array
  spendPub: bigint
}

export function spendPubFromPriv(spendPriv: bigint): bigint {
  return poseidon1([spendPriv])
}

function keysFromSeed(seed: Uint8Array): StealthKeys {
  if (seed.length < 32) throw new Error('Key seed must be at least 32 bytes')
  const salt = utf8.encode(DOMAIN.keySalt)
  const viewScalar = reduce(hkdf(sha256, seed, salt, utf8.encode(DOMAIN.viewKey), 64), CURVE_ORDER - 1n) + 1n
  const spendPriv = reduce(hkdf(sha256, seed, salt, utf8.encode(DOMAIN.spendKey), 64), SNARK_FIELD - 1n) + 1n
  const viewPriv = bigIntToBytes32(viewScalar)
  return {
    viewPriv,
    viewPub: secp256k1.getPublicKey(viewPriv, true),
    spendPriv,
    spendPub: spendPubFromPriv(spendPriv),
  }
}

/**
 * Deterministically derive keys from a wallet signature over KEY_DERIVATION_MESSAGE.
 * Users never back up a separate secret: re-signing the same message restores the keys.
 * Requires a wallet with deterministic (RFC 6979) signatures, which covers
 * MetaMask, Rabby, Coinbase Wallet and hardware wallets.
 */
export function keysFromSignature(signature: Hex): StealthKeys {
  const bytes = fromHex(signature)
  if (bytes.length !== 65) throw new Error('Expected a 65-byte ECDSA signature')
  return keysFromSeed(bytes)
}

export function generateKeys(): StealthKeys {
  return keysFromSeed(randomBytes(32))
}

export function toMetaAddress(keys: Pick<StealthKeys, 'viewPub' | 'spendPub'>): MetaAddress {
  return { viewPub: keys.viewPub, spendPub: keys.spendPub }
}

/** 65 raw bytes as stored on-chain by StealthKeyRegistry. */
export function encodeMetaAddress(meta: MetaAddress): Hex {
  const out = new Uint8Array(META_ADDRESS_BYTES)
  out.set(meta.viewPub, 0)
  out.set(bigIntToBytes32(meta.spendPub), 33)
  return toHex(out)
}

/** Accepts raw hex (`0x…`) or the human form `st:arb:0x…`, and validates both halves. */
export function decodeMetaAddress(input: string): MetaAddress {
  const raw = input.trim().startsWith(META_ADDRESS_PREFIX) ? input.trim().slice(META_ADDRESS_PREFIX.length) : input.trim()
  const bytes = fromHex(raw)
  if (bytes.length !== META_ADDRESS_BYTES) throw new Error('A meta-address is 65 bytes')
  const viewPub = bytes.slice(0, 33)
  secp256k1.Point.fromBytes(viewPub) // throws if not a valid curve point
  const spendPub = bytesToBigInt(bytes.slice(33))
  if (spendPub === 0n || spendPub >= SNARK_FIELD) throw new Error('Spending key is not a BN254 field element')
  return { viewPub, spendPub }
}

export function formatMetaAddress(meta: MetaAddress): string {
  return `${META_ADDRESS_PREFIX}${encodeMetaAddress(meta)}`
}

export function isMetaAddress(input: string): boolean {
  try {
    decodeMetaAddress(input)
    return true
  } catch {
    return false
  }
}

export function toViewingKey(keys: StealthKeys): ViewingKey {
  return { viewPriv: keys.viewPriv, spendPub: keys.spendPub }
}

export function encodeViewingKey(key: ViewingKey): string {
  const out = new Uint8Array(64)
  out.set(key.viewPriv, 0)
  out.set(bigIntToBytes32(key.spendPub), 32)
  return `${VIEWING_KEY_PREFIX}${toHex(out)}`
}

export function decodeViewingKey(input: string): ViewingKey {
  const trimmed = input.trim()
  if (!trimmed.startsWith(VIEWING_KEY_PREFIX)) throw new Error(`Viewing keys start with "${VIEWING_KEY_PREFIX}"`)
  const bytes = fromHex(trimmed.slice(VIEWING_KEY_PREFIX.length))
  if (bytes.length !== 64) throw new Error('A viewing key is 64 bytes')
  const viewPriv = bytes.slice(0, 32)
  const scalar = bytesToBigInt(viewPriv)
  if (scalar === 0n || scalar >= CURVE_ORDER) throw new Error('Invalid viewing scalar')
  const spendPub = bytesToBigInt(bytes.slice(32))
  if (spendPub === 0n || spendPub >= SNARK_FIELD) throw new Error('Invalid spending public key')
  return { viewPriv, spendPub }
}

/**
 * The full private key as one string: 32-byte viewing scalar ‖ 32-byte spending key.
 * It can claim payments, so it is shown only on request and never leaves the browser.
 */
export function encodeMetaPrivateKey(keys: Pick<StealthKeys, 'viewPriv' | 'spendPriv'>): string {
  const out = new Uint8Array(64)
  out.set(keys.viewPriv, 0)
  out.set(bigIntToBytes32(keys.spendPriv), 32)
  return `${META_PRIVATE_KEY_PREFIX}${toHex(out)}`
}

/** Parses a meta private key and rebuilds the matching public keys. */
export function decodeMetaPrivateKey(input: string): StealthKeys {
  const trimmed = input.trim()
  if (!trimmed.startsWith(META_PRIVATE_KEY_PREFIX)) throw new Error(`Meta private keys start with "${META_PRIVATE_KEY_PREFIX}"`)
  const bytes = fromHex(trimmed.slice(META_PRIVATE_KEY_PREFIX.length))
  if (bytes.length !== 64) throw new Error('A meta private key is 64 bytes')
  const viewPriv = bytes.slice(0, 32)
  const scalar = bytesToBigInt(viewPriv)
  if (scalar === 0n || scalar >= CURVE_ORDER) throw new Error('Invalid viewing scalar')
  const spendPriv = bytesToBigInt(bytes.slice(32))
  if (spendPriv === 0n || spendPriv >= SNARK_FIELD) throw new Error('Invalid spending key')
  return { viewPriv, viewPub: secp256k1.getPublicKey(viewPriv, true), spendPriv, spendPub: spendPubFromPriv(spendPriv) }
}
