import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
// @ts-expect-error snarkjs ships no types
import * as snarkjs from 'snarkjs'
import { afterAll, describe, expect, it } from 'vitest'
import { createNote, generateKeys, proveWithdraw, scanNotes, toHex, toMetaAddress, toViewingKey, NoteStatus, type Snarkjs } from '../src'

const circuits = resolve(__dirname, '..', '..', 'frontend', 'public', 'circuits')
const artifacts = { wasm: join(circuits, 'stealth_withdraw.wasm'), zkey: join(circuits, 'stealth_withdraw.zkey') }
const vkey = JSON.parse(readFileSync(join(circuits, 'verification_key.json'), 'utf8'))
const recipient = '0x1111111111111111111111111111111111111111' as const
const relayer = '0x2222222222222222222222222222222222222222' as const

afterAll(async () => {
  // snarkjs keeps a curve worker pool alive; release it so vitest can exit.
  await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate()
})

describe('withdrawal proof (real circuit)', () => {
  it('sender → scan → prove → verify, end to end', async () => {
    const alice = generateKeys()
    const note = createNote(toMetaAddress(alice))

    // Recipient discovers the note from on-chain data alone.
    const [found] = scanNotes(toViewingKey(alice), [
      {
        index: 0,
        commitment: note.commitment,
        token: '0x0000000000000000000000000000000000000000',
        amount: 1n,
        ephemeralPubKey: toHex(note.ephemeralPubKey),
        viewTag: note.viewTag,
        status: NoteStatus.Pending,
        createdAt: 0,
      },
    ])
    expect(found).toBeDefined()

    const result = await proveWithdraw(
      snarkjs as Snarkjs,
      { spendPriv: alice.spendPriv, sharedSecret: found.sharedSecret, commitment: found.commitment, recipient, relayer, fee: 5n },
      artifacts,
    )
    expect(result.publicSignals).toEqual([note.commitment, BigInt(recipient), BigInt(relayer), 5n])
    expect(await snarkjs.groth16.verify(vkey, result.publicSignals.map(String), result.raw)).toBe(true)

    // Changing any bound public input invalidates the proof.
    const tampered = [...result.publicSignals]
    tampered[3] = 6n
    expect(await snarkjs.groth16.verify(vkey, tampered.map(String), result.raw)).toBe(false)
  }, 60_000)

  it('the sender cannot prove: knowing the shared secret is not enough', async () => {
    const alice = generateKeys()
    const note = createNote(toMetaAddress(alice))
    const mallory = generateKeys()
    await expect(
      proveWithdraw(
        snarkjs as Snarkjs,
        { spendPriv: mallory.spendPriv, sharedSecret: note.sharedSecret, commitment: note.commitment, recipient, relayer, fee: 0n },
        artifacts,
      ),
    ).rejects.toThrow()
  }, 60_000)
})
