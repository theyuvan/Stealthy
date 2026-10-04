import { NoteStatus, type OnchainNote } from '@stealthy/sdk'
import type { Address, PublicClient } from 'viem'
import { stealthPoolAbi } from './abi'

const PAGE = 250n

export interface PoolNote extends OnchainNote {
  depositor: Address
}

type RawNote = {
  commitment: bigint
  token: Address
  amount: bigint
  ephemeralPubKey: `0x${string}`
  viewTag: number
  status: number
  createdAt: number
  depositor: Address
}

function toPoolNote(n: RawNote, index: number): PoolNote {
  return {
    index,
    commitment: n.commitment,
    token: n.token,
    amount: n.amount,
    ephemeralPubKey: n.ephemeralPubKey,
    viewTag: n.viewTag,
    status: n.status as NoteStatus,
    createdAt: Number(n.createdAt),
    depositor: n.depositor,
  }
}

/** Reads every note straight from StealthPool storage: no indexer, no log-range limits. */
export async function fetchAllNotes(client: PublicClient, pool: Address): Promise<PoolNote[]> {
  const total = await client.readContract({ address: pool, abi: stealthPoolAbi, functionName: 'noteCount' })
  const notes: PoolNote[] = []
  for (let start = 0n; start < total; start += PAGE) {
    const page = await client.readContract({ address: pool, abi: stealthPoolAbi, functionName: 'getNotes', args: [start, PAGE] })
    page.forEach((n, i) => notes.push(toPoolNote(n, Number(start) + i)))
  }
  return notes
}

/** Reads one note by its commitment. Status `None` means no payment exists for it. */
export async function fetchNote(client: PublicClient, pool: Address, commitment: bigint): Promise<PoolNote> {
  const n = await client.readContract({ address: pool, abi: stealthPoolAbi, functionName: 'getNote', args: [commitment] })
  return toPoolNote(n, -1)
}
