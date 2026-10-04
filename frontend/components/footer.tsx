import { Shield } from 'lucide-react'
import Link from 'next/link'

const APP = [
  { href: '/send', label: 'Send' },
  { href: '/receive', label: 'Receive' },
  { href: '/prove', label: 'Prove' },
  { href: '/history', label: 'History' },
  { href: '/audit', label: 'Auditor view' },
]

const NETWORKS = [
  { href: 'https://sepolia.arbiscan.io', label: 'Arbitrum Sepolia' },
  { href: 'https://explorer.testnet.chain.robinhood.com', label: 'Robinhood Chain' },
  { href: 'https://faucet.paxos.com', label: 'USDG faucet' },
]

export default function Footer() {
  return (
    <footer className="border-t border-border px-4 lg:px-8 pt-16 pb-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <span className="font-heading text-2xl text-foreground">Stealthy</span>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">Private USDG payments on Arbitrum, with zero-knowledge proofs verified on-chain.</p>
          </div>
          <nav className="md:col-span-3 space-y-3" aria-label="App">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">App</p>
            <ul className="space-y-2 text-sm">
              {APP.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-foreground/80 hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav className="md:col-span-3 space-y-3" aria-label="Networks">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Networks</p>
            <ul className="space-y-2 text-sm">
              {NETWORKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-foreground/80 hover:text-foreground">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Stealthy · Built for the Arbitrum Open House Buildathon</span>
          <span>Testnet software, not audited. Do not use with real funds.</span>
        </div>
      </div>
    </footer>
  )
}
