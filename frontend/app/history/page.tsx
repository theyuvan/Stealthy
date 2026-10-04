'use client'

import { NoteStatus } from '@stealthy/sdk'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import Navbar from '@/components/navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { WalletStatus } from '@/components/wallet-status'
import { explorerAddress, getDeployment } from '@/lib/chains'
import { formatAmount } from '@/lib/format'
import { fetchAllNotes } from '@/lib/notes'
import { tokenByAddress } from '@/lib/tokens'

const PAGE_SIZE = 10

function timeAgo(seconds: number) {
  const diff = Date.now() - seconds * 1000
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days > 0) return `${days}d ago`
  if (hrs > 0) return `${hrs}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}

function formatTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shortAddr(addr: string, n = 6) {
  return addr ? `${addr.slice(0, n)}…${addr.slice(-4)}` : '—'
}

const STATUS: Record<NoteStatus, { label: string; cls: string }> = {
  [NoteStatus.None]: { label: 'Unknown', cls: 'bg-muted text-muted-foreground border-border' },
  [NoteStatus.Pending]: { label: 'Unclaimed', cls: 'bg-primary/15 text-primary border-primary/25' },
  [NoteStatus.Withdrawn]: { label: 'Claimed', cls: 'bg-success/15 text-success border-success/25' },
}

export default function HistoryPage() {
  const { address, chainId } = useAccount()
  const client = usePublicClient()
  const deployment = getDeployment(chainId)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const notes = useQuery({
    queryKey: ['history', chainId, deployment?.pool],
    enabled: !!client && !!deployment,
    queryFn: async () => (await fetchAllNotes(client!, deployment!.pool)).reverse(), // newest first
  })

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const all = notes.data ?? []
  const q = search.trim().toLowerCase()
  const filtered = q
    ? all.filter(
        (n) =>
          `0x${n.commitment.toString(16).padStart(64, '0')}`.includes(q) ||
          n.depositor.toLowerCase().includes(q) ||
          (tokenByAddress(chainId, n.token)?.symbol.toLowerCase() ?? '').includes(q),
      )
    : all
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const latest = all[0]?.createdAt ?? 0

  return (
    <div className="min-h-screen bg-background dark">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-20">
        {/* Header */}
        <div className="mb-10 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Badge variant="outline" className="mb-3 text-xs">
              On-chain registry
            </Badge>
            <h1 className="text-4xl font-bold font-heading mb-2">Transaction History</h1>
            <p className="text-muted-foreground text-sm">
              Every stealth payment in the StealthPool: public commitments and scanning hints, no recipient identity revealed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs px-3 py-1.5">
              {all.length} total
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => notes.refetch()}
              disabled={notes.isFetching || !deployment}
              className="text-xs gap-1.5 hover:bg-foreground! hover:text-background! cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${notes.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <WalletStatus />

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search by commitment, sender, or token…"
            className="pl-9 bg-card border-border text-sm"
          />
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Total payments', value: all.length.toString() },
            { label: 'This page', value: visible.length.toString() },
            { label: 'Latest', value: latest > 0 ? timeAgo(latest) : '—' },
          ].map(({ label, value }) => (
            <Card key={label} className="p-4 bg-card border-border text-center gap-0">
              <p className="text-xl font-bold font-heading text-primary">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </Card>
          ))}
        </div>

        {/* List */}
        {notes.isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <Card className="p-12 text-center bg-card border-border">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{search ? 'No results match your search.' : 'No payments yet. Send one to get started.'}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((n) => {
              const t = tokenByAddress(chainId, n.token)
              const commitment = `0x${n.commitment.toString(16).padStart(64, '0')}`
              const mine = address && n.depositor.toLowerCase() === address.toLowerCase()
              return (
                <Card key={commitment} className="p-4 bg-card border-border hover:border-primary/20 transition-colors group gap-0">
                  <div className="flex items-start gap-4">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">#{n.index}</span>
                        {mine && (
                          <Badge className="text-xs bg-lavender/15 text-lavender border-lavender/25 px-2 gap-1">
                            <ArrowUpRight className="h-2.5 w-2.5" /> Sent by you
                          </Badge>
                        )}
                        <Badge className={`text-xs px-2 ${STATUS[n.status].cls}`}>{STATUS[n.status].label}</Badge>
                        <span className="text-xs font-semibold text-foreground">
                          {formatAmount(n.amount, t?.decimals ?? 18)} {t?.symbol}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 mb-2">{formatTime(n.createdAt)}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground mb-0.5">Commitment</p>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-foreground truncate">{shortAddr(commitment, 10)}</span>
                            <button onClick={() => copy(commitment, `c-${n.index}`)} className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0 cursor-pointer">
                              {copied === `c-${n.index}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground mb-0.5">Sender</p>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-foreground truncate">{shortAddr(n.depositor, 8)}</span>
                            {chainId && (
                              <a href={explorerAddress(chainId, n.depositor)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Recipient: <span className="text-primary">hidden</span>
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs gap-1 cursor-pointer hover:bg-foreground! hover:text-background!"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const pageNum = totalPages <= 7 ? i : page < 4 ? i : page + i - 3
                if (pageNum >= totalPages) return null
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`h-7 w-7 rounded text-xs font-medium cursor-pointer transition-colors ${
                      pageNum === page ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {pageNum + 1}
                  </button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs gap-1 cursor-pointer hover:bg-foreground! hover:text-background!"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Legend */}
        <div className="mt-12 p-5 rounded-lg border border-border bg-muted/10">
          <h3 className="text-sm font-semibold mb-2">Privacy model</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Each entry is a <span className="text-foreground font-medium">stealth note</span>: the sender publishes a Poseidon
            commitment and an ephemeral key so the recipient can scan. Anyone can see the amount and sender, but only the
            recipient (with their viewing key) can recognize which note is theirs, and only their spending key can claim it
            with a ZK proof. No link between sender and recipient is revealed on-chain.
          </p>
        </div>
      </main>
    </div>
  )
}
