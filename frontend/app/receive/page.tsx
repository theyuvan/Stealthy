'use client'

import {
  encodeMetaAddress,
  encodeMetaPrivateKey,
  encodeViewingKey,
  formatMetaAddress,
  NoteStatus,
  SCHEME_ID,
  toMetaAddress,
  toViewingKey,
} from '@stealthy/sdk'
import { ArrowRight, Check, Copy, ExternalLink, Eye, EyeOff, FileSearch, Key, Loader2, ScanLine } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { zeroAddress, type Hex } from 'viem'
import { useAccount, usePublicClient, useReadContract, useWalletClient } from 'wagmi'
import Navbar from '@/components/navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorBox, WalletStatus } from '@/components/wallet-status'
import { stealthKeyRegistryAbi } from '@/lib/abi'
import { explorerTx, getDeployment } from '@/lib/chains'
import { errorMessage, formatAmount, formatDate } from '@/lib/format'
import { useKeyVault } from '@/lib/keys'
import { tokenByAddress } from '@/lib/tokens'
import { feeOverrides } from '@/lib/tx'
import { useInbox } from '@/lib/use-inbox'

export default function ReceivePage() {
  const router = useRouter()
  const { address, chainId } = useAccount()
  const client = usePublicClient()
  const { data: wallet } = useWalletClient()
  const deployment = getDeployment(chainId)
  const { keys, unlock, unlocking, error: unlockError } = useKeyVault()

  const [scanRequested, setScanRequested] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registerTx, setRegisterTx] = useState<Hex | null>(null)
  const [error, setError] = useState('')
  const [showViewKey, setShowViewKey] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const metaRaw = keys ? encodeMetaAddress(toMetaAddress(keys)) : undefined
  const registered = useReadContract({
    address: deployment?.registry,
    abi: stealthKeyRegistryAbi,
    functionName: 'stealthMetaAddressOf',
    args: [address ?? zeroAddress, SCHEME_ID],
    query: { enabled: !!deployment && !!address },
  })
  const isRegistered = !!metaRaw && registered.data?.toLowerCase() === metaRaw.toLowerCase()

  const inbox = useInbox(scanRequested ? deployment : undefined)
  const pending = inbox.data?.notes.filter((n) => n.status === NoteStatus.Pending) ?? []
  const settled = (inbox.data?.notes.length ?? 0) - pending.length

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function register() {
    if (!deployment || !client || !wallet || !address) return
    setError('')
    setRegistering(true)
    try {
      const active = keys ?? (await unlock())
      if (!active) return
      const raw = encodeMetaAddress(toMetaAddress(active))
      const { request } = await client.simulateContract({
        account: address,
        ...(await feeOverrides(client)),
        address: deployment.registry,
        abi: stealthKeyRegistryAbi,
        functionName: 'registerKeys',
        args: [SCHEME_ID, raw],
      })
      const hash = await wallet.writeContract(request)
      await client.waitForTransactionReceipt({ hash })
      setRegisterTx(hash)
      await registered.refetch()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setRegistering(false)
    }
  }

  async function scanPayments() {
    setError('')
    if (!keys && !(await unlock())) return
    setScanRequested(true)
    if (scanRequested) void inbox.refetch()
  }

  function goToProve(commitment: bigint) {
    sessionStorage.setItem('proveData', JSON.stringify({ chainId, commitment: commitment.toString() }))
    router.push('/prove') // client-side navigation keeps the unlocked keys in memory
  }

  const buttonLabel = registering ? (
    <>
      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
      {keys ? 'Confirm in wallet…' : 'Sign in wallet…'}
    </>
  ) : isRegistered ? (
    <>
      <Check className="mr-1.5 h-3 w-3" />
      Registered on-chain
    </>
  ) : (
    <>
      <Key className="mr-1.5 h-3 w-3" />
      {keys ? 'Register On-chain' : 'Unlock & Register'}
    </>
  )

  return (
    <div className="min-h-screen bg-background dark">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-20">
        <div className="mb-10">
          <Badge variant="outline" className="mb-3 text-xs">
            Recipient
          </Badge>
          <h1 className="text-4xl font-bold font-heading mb-3">Scan for Payments</h1>
          <p className="text-muted-foreground leading-relaxed">
            Register your meta-address (linked to your wallet on-chain), scan for incoming payments, then claim them with a ZK
            proof on the Prove page.
          </p>
        </div>

        <WalletStatus />

        {/* Wallet-linked meta-address */}
        <Card className="p-6 mb-6 bg-card border-border gap-0">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold">Your Meta-Address</h2>
              {address && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRegistered ? 'Published' : 'Will be linked'} to {address.slice(0, 6)}…{address.slice(-4)} in the on-chain registry
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={register}
              disabled={!deployment || registering || isRegistered || unlocking}
              className="text-xs hover:bg-foreground! hover:text-background! cursor-pointer"
            >
              {buttonLabel}
            </Button>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {keys
                ? 'Keys unlocked from your wallet signature. They stay in this tab only and are never sent anywhere.'
                : 'Your keys are derived from one wallet signature. There is no private key to paste or save.'}
            </p>
            <Button
              onClick={scanPayments}
              disabled={!deployment || inbox.isFetching || unlocking}
              className="w-full cursor-pointer hover:bg-foreground! hover:text-background!"
            >
              {inbox.isFetching || unlocking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {unlocking ? 'Sign in wallet…' : 'Scanning…'}
                </>
              ) : (
                <>
                  <ScanLine className="mr-2 h-4 w-4" />
                  Scan for My Payments
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Your keys */}
        {keys && (
          <Card className="p-5 mb-6 bg-primary/5 border-primary/20 gap-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold">Your Stealthy keys</p>
                  {isRegistered && (
                    <span className="text-xs bg-success/15 text-success border border-success/25 px-1.5 py-0.5 rounded font-medium">On-chain ✓</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Share the meta-address, or just your 0x address once registered.</p>
                {registerTx && chainId && (
                  <a
                    href={explorerTx(chainId, registerTx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary/80 hover:text-primary mt-1 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View registration tx
                  </a>
                )}
              </div>
              <button
                onClick={() => setShowViewKey((v) => !v)}
                className="text-muted-foreground hover:text-primary transition-colors ml-3 flex-shrink-0 cursor-pointer"
                aria-label={showViewKey ? 'Hide private keys' : 'Show private keys'}
              >
                {showViewKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-md bg-muted/50 border border-primary/30">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-primary">
                    Meta-address <span className="font-normal opacity-70">(share with senders)</span>
                  </span>
                  <button onClick={() => copy(formatMetaAddress(toMetaAddress(keys)), 'meta')} className="text-muted-foreground hover:text-primary cursor-pointer">
                    {copied === 'meta' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <p className="font-mono text-xs break-all">{formatMetaAddress(toMetaAddress(keys))}</p>
              </div>

              {showViewKey ? (
                <div className="p-2.5 rounded-md bg-muted/50 border border-warning/30">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-warning">
                      Viewing key <span className="font-normal opacity-70">(read-only, for auditors)</span>
                    </span>
                    <button onClick={() => copy(encodeViewingKey(toViewingKey(keys)), 'vk')} className="text-muted-foreground hover:text-primary cursor-pointer">
                      {copied === 'vk' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all">{encodeViewingKey(toViewingKey(keys))}</p>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Anyone with this key sees your incoming payments but can never spend them.{' '}
                    <Link href="/audit" className="text-primary hover:underline inline-flex items-center gap-1">
                      <FileSearch className="h-3 w-3" /> Open auditor view
                    </Link>
                  </p>
                </div>
              ) : null}

              {showViewKey ? (
                <div className="p-2.5 rounded-md bg-muted/50 border border-foreground/40">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      Meta private key <span className="font-normal opacity-70">(secret, claims your payments)</span>
                    </span>
                    <button onClick={() => copy(encodeMetaPrivateKey(keys), 'mpk')} className="text-muted-foreground hover:text-primary cursor-pointer">
                      {copied === 'mpk' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all">{encodeMetaPrivateKey(keys)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Paste it on the Prove page to claim. Never share it: anyone holding it can claim your payments.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-md bg-muted/50 border border-warning/20 flex items-center justify-between">
                  <span className="text-xs text-warning">Viewing key and meta private key hidden. Click the eye icon to reveal them.</span>
                  <Eye className="h-3.5 w-3.5 text-warning/60" />
                </div>
              )}
            </div>
          </Card>
        )}

        {(error || unlockError) && <ErrorBox>{error || unlockError}</ErrorBox>}
        {inbox.error && <ErrorBox>{errorMessage(inbox.error)}</ErrorBox>}

        {/* Scan results */}
        {inbox.data && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold font-heading">Payments Found</h2>
              <Badge variant={pending.length > 0 ? 'default' : 'outline'}>{pending.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Scanned {inbox.data.total} notes locally in {inbox.data.ms} ms
              {settled > 0 && ` · ${settled} already claimed`}
            </p>

            {pending.length === 0 ? (
              <Card className="p-8 text-center bg-card border-border">
                <ScanLine className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No unclaimed payments found for your keys.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {pending.map((n) => {
                  const t = tokenByAddress(chainId, n.token)
                  return (
                    <Card key={n.commitment.toString()} className="p-5 bg-card border-border gap-0">
                      <div className="flex items-start justify-between mb-4 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              #{n.index}
                            </Badge>
                            <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                              {formatAmount(n.amount, t?.decimals ?? 18)} {t?.symbol}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</span>
                          </div>
                          <p className="font-mono text-xs text-muted-foreground break-all">
                            <span className="text-foreground font-medium">Stealth address: </span>0x{n.commitment.toString(16).padStart(64, '0')}
                          </p>
                        </div>
                      </div>

                      <Button className="w-full cursor-pointer hover:bg-foreground! hover:text-background!" onClick={() => goToProve(n.commitment)}>
                        Generate ZK Proof &amp; Claim to Wallet
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
