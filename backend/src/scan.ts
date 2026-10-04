import type { ViewingKey } from './keys'
import { computeCommitment, sharedValuesFor, type SharedValues } from './stealth'
import { fromHex, type Hex } from './utils'

/** Mirrors StealthPool.Status. */
export enum NoteStatus {
  None = 0,
  Pending = 1,
  Withdrawn = 2,
}

/** A note as returned by StealthPool.getNotes(). */
export interface OnchainNote {
  index: number
  commitment: bigint
  token: Hex
  amount: bigint
  ephemeralPubKey: Hex
  viewTag: number
  status: NoteStatus
  createdAt: number
}

export interface OwnedNote extends OnchainNote, SharedValues {}

/**
 * Finds the notes addressed to a viewing key. Only one ECDH per note is needed,
 * and the view tag filters out ~255/256 foreign notes before the Poseidon check.
 * Works identically for the owner and for an auditor holding the viewing key.
 */
export function scanNotes(key: ViewingKey, notes: readonly OnchainNote[]): OwnedNote[] {
  const owned: OwnedNote[] = []
  for (const note of notes) {
    let shared: SharedValues
    try {
      shared = sharedValuesFor(key.viewPriv, fromHex(note.ephemeralPubKey))
    } catch {
      continue // malformed ephemeral key published by someone else
    }
    if (shared.viewTag !== note.viewTag) continue
    if (computeCommitment(key.spendPub, shared.sharedSecret) !== note.commitment) continue
    owned.push({ ...note, ...shared })
  }
  return owned
}
