'use client'

import { ArrowUpRight } from 'lucide-react'
import dynamic from 'next/dynamic'
import { arbitrumSepolia, explorerAddress, getDeployment, robinhoodTestnet } from '@/lib/chains'

const GlobeCanvas = dynamic(() => import('@/components/zk-scene').then((m) => m.GlobeCanvas), { ssr: false })

const CHAINS = [
  { chain: arbitrumSepolia, note: 'Arbitrum’s public testnet. USDG and USDC with one-transaction permits.' },
  { chain: robinhoodTestnet, note: 'Robinhood’s Arbitrum Orbit chain. Same contracts, Robinhood’s own USDG.' },
]

function short(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

export default function Chains() {
  return (
    <section className="px-4 lg:px-8 py-24 md:py-32 border-t border-border">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="relative aspect-square w-full max-w-[560px] mx-auto overflow-hidden rounded-3xl border border-border bg-card">
          <GlobeCanvas />
          <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-card to-transparent" aria-hidden />
          <p className="absolute bottom-5 left-6 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Private settlement, anywhere USDG moves
          </p>
        </div>

        <div className="space-y-10 min-w-0">
          <div className="space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Deployed</p>
            <h2 className="font-heading text-4xl md:text-6xl leading-[1.02] text-foreground">
              Live on <span className="italic">two chains</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed max-w-lg">
              The same audited building blocks, deployed to the same address on both networks. Switch chains from the wallet
              menu and the app follows.
            </p>
          </div>

          <ul className="divide-y divide-border border-y border-border">
            {CHAINS.map(({ chain, note }) => {
              const d = getDeployment(chain.id)
              return (
                <li key={chain.id} className="py-6 space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-heading text-2xl text-foreground">{chain.name}</h3>
                    <span className="font-mono text-xs text-muted-foreground">chain {chain.id}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{note}</p>
                  {d && (
                    <a
                      href={explorerAddress(chain.id, d.pool)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-xs text-foreground hover:underline underline-offset-4"
                    >
                      StealthPool {short(d.pool)}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
