import { secp256k1 } from '@noble/curves/secp256k1.js'
import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { concatBytes } from '@noble/hashes/utils.js'
import { poseidon2 } from 'poseidon-lite'
import { DOMAIN, SNARK_FIELD } from './constants'
import type { MetaAddress } from './keys'
import { reduce, utf8 } from './utils'

type Point = ReturnType<typeof secp256k1.Point.fromBytes>

/** Values both sender and recipient can compute from the ECDH shared point. */
export interface SharedValues {
  viewTag: number // 1 byte, lets scanners skip ~255/256 notes without hashing into the field
  sharedSecret: bigint // BN254 field element, private input of the withdrawal circuit
}

export interface StealthNote extends SharedValues {
  commitment: bigint
  ephemeralPubKey: Uint8Array // 33 bytes, published with the deposit
}

export function computeCommitment(spendPub: bigint, sharedSecret: bigint): bigint {
  return poseidon2([spendPub, sharedSecret])
}

function tagged(domain: string, point: Point): Uint8Array {
  return concatBytes(utf8.encode(domain), point.toBytes(true))
}

export function deriveSharedValues(sharedPoint: Point): SharedValues {
  return {
    viewTag: sha256(tagged(DOMAIN.viewTag, sharedPoint))[0],
    sharedSecret: reduce(sha512(tagged(DOMAIN.secret, sharedPoint)), SNARK_FIELD),
  }
}

/**
 * Sender side. A fresh ephemeral key r gives R = r·G and the shared point S = r·viewPub.
 * The note commitment is Poseidon(spendPub, H(S)): unlinkable to the recipient for
 * everyone except the recipient (who can recompute S = viewPriv·R).
 */
export function createNote(meta: MetaAddress, ephemeralPriv: Uint8Array = secp256k1.utils.randomSecretKey()): StealthNote {
  const viewPub = secp256k1.Point.fromBytes(meta.viewPub)
  const r = secp256k1.Point.Fn.fromBytes(ephemeralPriv)
  const shared = deriveSharedValues(viewPub.multiply(r))
  return {
    ...shared,
    commitment: computeCommitment(meta.spendPub, shared.sharedSecret),
    ephemeralPubKey: secp256k1.getPublicKey(ephemeralPriv, true),
  }
}

/** Recipient side: recompute the shared values for a published ephemeral key. */
export function sharedValuesFor(viewPriv: Uint8Array, ephemeralPubKey: Uint8Array): SharedValues {
  const R = secp256k1.Point.fromBytes(ephemeralPubKey)
  return deriveSharedValues(R.multiply(secp256k1.Point.Fn.fromBytes(viewPriv)))
}
