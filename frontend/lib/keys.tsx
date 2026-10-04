'use client'

import { KEY_DERIVATION_MESSAGE, keysFromSignature, type StealthKeys } from '@stealthy/sdk'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAccount, useSignMessage } from 'wagmi'

interface KeyVault {
  keys: StealthKeys | null
  unlocking: boolean
  error: string | null
  unlock: () => Promise<StealthKeys | null>
  lock: () => void
}

const Ctx = createContext<KeyVault | null>(null)

/**
 * Holds the user's Stealthy keys in React memory only. They are derived from a wallet
 * signature, never written to storage, never sent over the network, and dropped whenever
 * the connected account changes or the tab closes.
 */
export function KeyVaultProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [keys, setKeys] = useState<StealthKeys | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setKeys(null)
    setError(null)
  }, [address])

  const unlock = useCallback(async () => {
    if (!address) return null
    setUnlocking(true)
    setError(null)
    try {
      const signature = await signMessageAsync({ message: KEY_DERIVATION_MESSAGE })
      const derived = keysFromSignature(signature)
      setKeys(derived)
      return derived
    } catch (e) {
      setError(e instanceof Error ? e.message.split('\n')[0] : 'Signature rejected')
      return null
    } finally {
      setUnlocking(false)
    }
  }, [address, signMessageAsync])

  const lock = useCallback(() => setKeys(null), [])

  const value = useMemo(() => ({ keys, unlocking, error, unlock, lock }), [keys, unlocking, error, unlock, lock])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useKeyVault() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useKeyVault must be used inside KeyVaultProvider')
  return ctx
}
