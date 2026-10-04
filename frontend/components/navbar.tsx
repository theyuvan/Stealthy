'use client'

import { Shield } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import WalletConnect from '@/components/wallet-connect'
import { cn } from '@/lib/utils'

const links = [
  { href: '/send', label: 'Send' },
  { href: '/receive', label: 'Receive' },
  { href: '/prove', label: 'Prove' },
  { href: '/history', label: 'History' },
]

export default function Navbar() {
  const pathname = usePathname()
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/60 shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-4 md:gap-8">
        <Link href="/" className="flex items-center gap-2.5 font-bold font-heading text-primary shrink-0">
          <div className="h-7 w-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <span className="text-base tracking-tight hidden sm:inline">Stealthy</span>
        </Link>

        <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'relative px-2 sm:px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
                pathname === l.href ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {l.label}
              {pathname === l.href && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full" />}
            </Link>
          ))}
        </div>

        <WalletConnect />
      </div>
    </nav>
  )
}
