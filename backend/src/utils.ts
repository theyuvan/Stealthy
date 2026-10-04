import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

export type Hex = `0x${string}`

export function toHex(bytes: Uint8Array): Hex {
  return `0x${bytesToHex(bytes)}`
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new Error('Invalid hex string')
  return hexToBytes(clean)
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt(`0x${bytesToHex(bytes)}`)
}

export function bigIntToBytes32(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 256n) throw new Error('Value does not fit in 32 bytes')
  return hexToBytes(value.toString(16).padStart(64, '0'))
}

export function bigIntToHex32(value: bigint): Hex {
  return toHex(bigIntToBytes32(value))
}

/** Uniform-enough reduction: callers pass ≥ 64 bytes so the modulo bias is < 2^-250. */
export function reduce(bytes: Uint8Array, modulus: bigint): bigint {
  return bytesToBigInt(bytes) % modulus
}

export const utf8 = new TextEncoder()
export const utf8Decoder = new TextDecoder()
