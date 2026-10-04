'use client'

import { ChevronDown, LogOut, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { getChain, getDeployment, supportedChains } from '@/lib/chains'
import { cn } from '@/lib/utils'

export default function WalletConnect() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { address, isConnected, chainId, connector } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const [open, setOpen] = useState(false)

  if (!mounted) return <div className="h-9 w-36 shrink-0" />

  if (isConnected && address) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`
    const current = getChain(chainId)
    return (
      <div className="relative shrink-0">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 border border-primary/60 rounded-lg px-2.5 sm:px-3.5 py-2 transition-all shadow-[0_0_12px_rgba(255,255,255,0.12)] hover:shadow-[0_0_18px_rgba(255,255,255,0.22)] cursor-pointer"
        >
          <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground/70 animate-pulse" />
          <Wallet className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{short}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-2 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover shadow-2xl p-4">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
                <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Connected via {connector?.name ?? 'wallet'}</p>
                  <p className="text-xs text-muted-foreground">{current?.name ?? 'Unsupported network'}</p>
                </div>
                <div className={cn('ml-auto h-2 w-2 rounded-full', getDeployment(chainId) ? 'bg-foreground' : 'bg-muted-foreground')} />
              </div>
              <p className="font-mono text-xs break-all text-foreground mb-4 bg-muted/40 rounded-md p-2">{address}</p>

              <p className="text-xs font-semibold text-muted-foreground mb-2">Network</p>
              <div className="space-y-1.5 mb-4">
                {supportedChains.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => switchChain({ chainId: c.id })}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-lg border text-sm transition-all cursor-pointer',
                      c.id === chainId ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border hover:border-primary/30 hover:bg-primary/5',
                    )}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{c.id}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  disconnect()
                  setOpen(false)
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect wallet
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg px-2.5 sm:px-4 py-2 transition-all shadow-[0_0_16px_rgba(255,255,255,0.14)] hover:shadow-[0_0_24px_rgba(255,255,255,0.25)] cursor-pointer"
      >
        <Wallet className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Connect Wallet</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover shadow-2xl p-4">
            <p className="text-xs font-semibold text-foreground mb-1">Connect an EVM wallet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Works on <span className="text-primary font-medium">Arbitrum Sepolia</span> and{' '}
              <span className="text-primary font-medium">Robinhood Chain</span>
            </p>
            {error && (
              <div className="mb-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {error.message.split('\n')[0]}
              </div>
            )}
            <div className="space-y-2">
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => connect({ connector: c }, { onSuccess: () => setOpen(false) })}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-sm disabled:opacity-50 group cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20">
                    <Wallet className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold leading-none">{c.name === 'Injected' ? 'Browser wallet' : c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{isPending ? 'Connecting…' : 'MetaMask, Rabby, Coinbase…'}</p>
                  </div>
                  {isPending && <div className="ml-auto h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
