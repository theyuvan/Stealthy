'use client'

import { AlertCircle, Key, Loader2, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getChain, getDeployment, supportedChains } from '@/lib/chains'
import { useKeyVault } from '@/lib/keys'

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

/**
 * The status strip shown at the top of every app page (as in the original UI):
 * not connected → amber warning, wrong network → switch buttons, otherwise a summary line.
 */
export function WalletStatus({ label }: { label?: ReactNode }) {
  const mounted = useMounted()
  const { isConnected, address, chainId, connector } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!mounted) return <div className="mb-6 h-12" />

  if (!isConnected || !address) {
    return (
      <div className="mb-6 p-4 rounded-md bg-warning/10 border border-warning/20 flex items-start gap-3">
        <Wallet className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-warning">Wallet not connected</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click <strong>&quot;Connect Wallet&quot;</strong> in the top-right. MetaMask, Rabby and other browser wallets work.
          </p>
        </div>
      </div>
    )
  }

  if (!getDeployment(chainId)) {
    return (
      <div className="mb-6 p-4 rounded-md bg-warning/10 border border-warning/20 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-warning">Switch network</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Stealthy is live on these testnets:</p>
          <div className="flex flex-wrap gap-2">
            {supportedChains
              .filter((c) => getDeployment(c.id))
              .map((c) => (
                <Button key={c.id} size="sm" variant="outline" disabled={isPending} onClick={() => switchChain({ chainId: c.id })} className="cursor-pointer">
                  {c.name}
                </Button>
              ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 p-3 rounded-md bg-primary/5 border border-primary/20 flex items-center gap-2.5 flex-wrap">
      <Wallet className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="text-sm text-primary font-medium">{label ?? `${connector?.name ?? 'Wallet'} · ${getChain(chainId)?.name}`}</span>
      <span className="font-mono text-xs text-muted-foreground ml-auto">
        {address.slice(0, 6)}…{address.slice(-6)}
      </span>
    </div>
  )
}

/** Card asking for the one key-derivation signature, styled like the original key cards. */
export function UnlockKeysCard({ purpose }: { purpose: string }) {
  const { unlock, unlocking, error } = useKeyVault()
  const { isConnected } = useAccount()
  return (
    <Card className="p-6 mb-6 bg-card border-border gap-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Key className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Unlock your Stealthy keys</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {purpose} One wallet signature derives your keys. They stay in this tab&apos;s memory only, and signing again restores them on any
            device.
          </p>
        </div>
      </div>
      <Button onClick={unlock} disabled={!isConnected || unlocking} className="w-full cursor-pointer hover:bg-foreground! hover:text-background!">
        {unlocking ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sign in wallet…
          </>
        ) : (
          <>
            <Key className="mr-2 h-4 w-4" />
            Sign to Unlock Keys
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  )
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 p-4 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <span className="break-words min-w-0">{children}</span>
    </div>
  )
}
