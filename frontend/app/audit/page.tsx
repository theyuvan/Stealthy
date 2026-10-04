'use client'

import { decodeViewingKey, NoteStatus, scanNotes, type ViewingKey } from '@stealthy/sdk'
import { useQuery } from '@tanstack/react-query'
import { Download, FileSearch, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount, usePublicClient } from 'wagmi'
import Navbar from '@/components/navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorBox, WalletStatus } from '@/components/wallet-status'
import { getDeployment } from '@/lib/chains'
import { errorMessage, formatAmount, formatDate } from '@/lib/format'
import { fetchAllNotes } from '@/lib/notes'
import { tokenByAddress } from '@/lib/tokens'

const STATUS_LABEL: Record<NoteStatus, string> = {
  [NoteStatus.None]: 'Unknown',
  [NoteStatus.Pending]: 'Unclaimed',
  [NoteStatus.Withdrawn]: 'Claimed',
}

export default function AuditPage() {
  const { chainId } = useAccount()
  const client = usePublicClient()
  const deployment = getDeployment(chainId)
  const [input, setInput] = useState('')
  const [key, setKey] = useState<ViewingKey | null>(null)
  const [error, setError] = useState('')

  const report = useQuery({
    queryKey: ['audit', chainId, input],
    enabled: !!key && !!client && !!deployment,
    queryFn: async () => scanNotes(key!, await fetchAllNotes(client!, deployment!.pool)),
  })

  function load() {
    try {
      setKey(decodeViewingKey(input))
      setError('')
    } catch (e) {
      setKey(null)
      setError(errorMessage(e))
    }
  }

  function exportCsv() {
    if (!report.data) return
    const rows = [['note', 'date', 'token', 'amount', 'status', 'commitment']]
    for (const n of report.data) {
      const t = tokenByAddress(chainId, n.token)
      rows.push([
        String(n.index),
        new Date(n.createdAt * 1000).toISOString(),
        t?.symbol ?? n.token,
        formatUnits(n.amount, t?.decimals ?? 18),
        STATUS_LABEL[n.status],
        `0x${n.commitment.toString(16).padStart(64, '0')}`,
      ])
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }))
    a.download = `Stealthy-audit-${chainId}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="min-h-screen bg-background dark">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-20">
        <div className="mb-10">
          <Badge variant="outline" className="mb-3 text-xs">
            Selective disclosure
          </Badge>
          <h1 className="text-4xl font-bold font-heading mb-3">Audit with a Viewing Key</h1>
          <p className="text-muted-foreground leading-relaxed">
            Private, not anonymous. A recipient can hand a read-only viewing key to an accountant or compliance team. It shows every
            incoming payment and cannot move a single cent.
          </p>
        </div>

        <WalletStatus />

        <Card className="p-6 mb-6 bg-card border-border gap-0">
          <div className="space-y-4">
            <div>
              <Label htmlFor="vk" className="text-sm font-medium mb-2 block">
                Viewing key <span className="text-muted-foreground font-normal ml-1 text-xs">(svk:0x…, processed only in this browser)</span>
              </Label>
              <Input id="vk" value={input} onChange={(e) => setInput(e.target.value)} placeholder="svk:0x…" className="font-mono text-sm" spellCheck={false} autoComplete="off" />
            </div>
            <Button onClick={load} disabled={!input.trim() || !deployment || report.isFetching} className="w-full cursor-pointer hover:bg-foreground! hover:text-background!">
              {report.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
              Generate Report
            </Button>
          </div>
        </Card>

        {error && <ErrorBox>{error}</ErrorBox>}
        {report.error && <ErrorBox>{errorMessage(report.error)}</ErrorBox>}

        {report.data && (
          <Card className="bg-card border-border overflow-hidden py-0 gap-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold font-heading">{report.data.length} incoming payments</h2>
                <p className="text-xs text-muted-foreground">Read-only. This key cannot claim, move or redirect funds.</p>
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={report.data.length === 0} className="cursor-pointer hover:bg-foreground! hover:text-background!">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.map((n) => {
                    const t = tokenByAddress(chainId, n.token)
                    return (
                      <tr key={n.commitment.toString()} className="border-t border-border hover:bg-muted/30">
                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDate(n.createdAt)}</td>
                        <td className="whitespace-nowrap px-5 py-3 font-medium">
                          {formatAmount(n.amount, t?.decimals ?? 18)} {t?.symbol}
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={n.status === NoteStatus.Pending ? 'default' : 'outline'} className="text-xs">
                            {STATUS_LABEL[n.status]}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-muted-foreground">#{n.index}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}
