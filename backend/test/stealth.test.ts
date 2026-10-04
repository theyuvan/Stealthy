import { secp256k1 } from '@noble/curves/secp256k1.js'
import { describe, expect, it } from 'vitest'
import {
  SNARK_FIELD,
  computeCommitment,
  createNote,
  decodeMetaAddress,
  decodeMetaPrivateKey,
  decodeViewingKey,
  encodeMetaPrivateKey,
  encodeMetaAddress,
  encodeViewingKey,
  formatMetaAddress,
  generateKeys,
  keysFromSignature,
  NoteStatus,
  scanNotes,
  sharedValuesFor,
  spendPubFromPriv,
  toHex,
  toMetaAddress,
  toViewingKey,
  type OnchainNote,
} from '../src'

const signature = `0x${'ab'.repeat(64)}1b` as const

function onchain(note: ReturnType<typeof createNote>, index = 0): OnchainNote {
  return {
    index,
    commitment: note.commitment,
    token: '0x0000000000000000000000000000000000000000',
    amount: 1_000_000n,
    ephemeralPubKey: toHex(note.ephemeralPubKey),
    viewTag: note.viewTag,
    status: NoteStatus.Pending,
    createdAt: 0,
  }
}

describe('key derivation', () => {
  it('is deterministic for a wallet signature', () => {
    const a = keysFromSignature(signature)
    const b = keysFromSignature(signature)
    expect(toHex(a.viewPriv)).toBe(toHex(b.viewPriv))
    expect(a.spendPriv).toBe(b.spendPriv)
  })

  it('produces independent view and spend keys in range', () => {
    const keys = keysFromSignature(signature)
    expect(keys.spendPriv > 0n && keys.spendPriv < SNARK_FIELD).toBe(true)
    expect(keys.spendPub).toBe(spendPubFromPriv(keys.spendPriv))
    expect(keys.viewPub).toEqual(secp256k1.getPublicKey(keys.viewPriv, true))
    expect(keysFromSignature(`0x${'cd'.repeat(64)}1c`).spendPriv).not.toBe(keys.spendPriv)
  })

  it('rejects malformed signatures', () => {
    expect(() => keysFromSignature('0x1234')).toThrow()
  })
})

describe('meta-address and viewing key encoding', () => {
  it('round-trips raw and prefixed forms', () => {
    const meta = toMetaAddress(generateKeys())
    const raw = encodeMetaAddress(meta)
    expect(raw).toHaveLength(2 + 65 * 2)
    for (const form of [raw, formatMetaAddress(meta)]) {
      const decoded = decodeMetaAddress(form)
      expect(decoded.spendPub).toBe(meta.spendPub)
      expect(decoded.viewPub).toEqual(meta.viewPub)
    }
  })

  it('rejects invalid points and out-of-field spend keys', () => {
    const meta = toMetaAddress(generateKeys())
    const raw = encodeMetaAddress(meta)
    expect(() => decodeMetaAddress(`0x05${raw.slice(4)}`)).toThrow()
    expect(() => decodeMetaAddress(`${raw.slice(0, 68)}${'ff'.repeat(32)}`)).toThrow()
    expect(() => decodeMetaAddress(raw.slice(0, -2))).toThrow()
  })

  it('round-trips viewing keys', () => {
    const keys = generateKeys()
    const decoded = decodeViewingKey(encodeViewingKey(toViewingKey(keys)))
    expect(decoded.spendPub).toBe(keys.spendPub)
    expect(toHex(decoded.viewPriv)).toBe(toHex(keys.viewPriv))
  })
})

describe('stealth notes', () => {
  it('sender and recipient derive the same shared values', () => {
    const keys = generateKeys()
    const note = createNote(toMetaAddress(keys))
    const shared = sharedValuesFor(keys.viewPriv, note.ephemeralPubKey)
    expect(shared.sharedSecret).toBe(note.sharedSecret)
    expect(shared.viewTag).toBe(note.viewTag)
    expect(computeCommitment(keys.spendPub, shared.sharedSecret)).toBe(note.commitment)
  })

  it('never reuses a commitment across payments to the same recipient', () => {
    const meta = toMetaAddress(generateKeys())
    const seen = new Set(Array.from({ length: 20 }, () => createNote(meta).commitment))
    expect(seen.size).toBe(20)
  })

  it('scanning finds exactly the recipient notes', () => {
    const alice = generateKeys()
    const bob = generateKeys()
    const notes = [
      createNote(toMetaAddress(alice)),
      createNote(toMetaAddress(bob)),
      createNote(toMetaAddress(alice)),
      createNote(toMetaAddress(bob)),
    ].map((n, i) => onchain(n, i))

    expect(scanNotes(toViewingKey(alice), notes).map((n) => n.index)).toEqual([0, 2])
    expect(scanNotes(toViewingKey(bob), notes).map((n) => n.index)).toEqual([1, 3])
  })

  it('an auditor with only the viewing key sees the same notes', () => {
    const alice = generateKeys()
    const notes = [onchain(createNote(toMetaAddress(alice)))]
    const auditor = decodeViewingKey(encodeViewingKey(toViewingKey(alice)))
    expect(scanNotes(auditor, notes)).toHaveLength(1)
  })

  it('ignores notes with a garbage ephemeral key', () => {
    const alice = generateKeys()
    const bad = { ...onchain(createNote(toMetaAddress(alice))), ephemeralPubKey: `0x02${'00'.repeat(32)}` as const }
    expect(scanNotes(toViewingKey(alice), [bad])).toHaveLength(0)
  })
})

describe('meta private key', () => {
  it('round-trips and rebuilds the public keys', () => {
    const keys = generateKeys()
    const encoded = encodeMetaPrivateKey(keys)
    expect(encoded.startsWith('spk:0x')).toBe(true)
    const decoded = decodeMetaPrivateKey(encoded)
    expect(decoded.spendPriv).toBe(keys.spendPriv)
    expect(decoded.spendPub).toBe(keys.spendPub)
    expect(toHex(decoded.viewPub)).toBe(toHex(keys.viewPub))
  })

  it('finds and opens the same notes as the original keys', () => {
    const keys = generateKeys()
    const restored = decodeMetaPrivateKey(encodeMetaPrivateKey(keys))
    const notes = [onchain(createNote(toMetaAddress(keys)))]
    expect(scanNotes(toViewingKey(restored), notes)).toHaveLength(1)
  })

  it('rejects viewing keys and malformed input', () => {
    const keys = generateKeys()
    expect(() => decodeMetaPrivateKey(encodeViewingKey(toViewingKey(keys)))).toThrow()
    expect(() => decodeMetaPrivateKey('spk:0x1234')).toThrow()
  })
})
