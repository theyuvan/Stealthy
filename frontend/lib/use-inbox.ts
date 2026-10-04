'use client'

import { scanNotes, toViewingKey, type OwnedNote } from '@stealthy/sdk'
import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import type { Deployment } from './chains'
import { useKeyVault } from './keys'
import { fetchAllNotes, type PoolNote } from './notes'

export type InboxNote = OwnedNote & PoolNote

/**
 * Scans the pool with the unlocked viewing key, entirely in the browser. Shared by the
 * Receive and Prove pages through the react-query cache, so a note found on Receive is
 * available on Prove without rescanning.
 */
export function useInbox(deployment: Deployment | undefined) {
  const { keys } = useKeyVault()
  const { chainId } = useAccount()
  const client = usePublicClient()

  return useQuery({
    queryKey: ['inbox', chainId, deployment?.pool, keys?.spendPub.toString()],
    enabled: !!client && !!keys && !!deployment,
    queryFn: async () => {
      const started = performance.now()
      const all = await fetchAllNotes(client!, deployment!.pool)
      const notes = (scanNotes(toViewingKey(keys!), all) as InboxNote[]).reverse()
      return { total: all.length, notes, ms: Math.round(performance.now() - started) }
    },
  })
}
