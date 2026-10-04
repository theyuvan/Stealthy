'use client'

import {
  computeCommitment,
  decodeMetaPrivateKey,
  encodeMetaPrivateKey,
  fromHex,
  NoteStatus,
  sharedValuesFor,
  SNARK_FIELD,
  type SolidityProof,
  type StealthKeys,
} from '@stealthy/sdk'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Shield,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAddress, zeroAddress, type Address, type Hex } from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import Navbar from '@/components/navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorBox, WalletStatus } from '@/components/wallet-status'
import { stealthPoolAbi } from '@/lib/abi'
import { explorerTx, getDeployment } from '@/lib/chains'
import { errorMessage, formatAmount } from '@/lib/format'
import { useKeyVault } from '@/lib/keys'
import { fetchNote } from '@/lib/notes'
import { proveInBrowser } from '@/lib/prover'
import { tokenByAddress } from '@/lib/tokens'
import { feeOverrides } from '@/lib/tx'
import { cn } from '@/lib/utils'

type ClaimStep = 'idle' | 'proving' | 'signing' | 'verifying'
type SlotState = 'empty' | 'checking' | 'ok' | 'bad'

const STEPS = [
  { key: 'proving', label: 'Generate ZK proof in your browser' },
  { key: 'signing', label: 'Confirm the claim in your wallet' },
  { key: 'verifying', label: 'Verify proof on-chain & release funds' },
] as const

interface ProofResult {
  proof: SolidityProof
  publicSignals: [bigint, bigint, bigint, bigint]
  ms: number
}

/** Parses a 32-byte stealth address (the note commitment) typed or pasted by the user. */
function parseStealthAddress(input: string): bigint | null {
  const v = input.trim()
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(v)) return null
  const n = BigInt(v)
  return n > 0n && n < SNARK_FIELD ? n : null
}

function parseKey(input: string): StealthKeys | null {
  try {
    return input.trim() ? decodeMetaPrivateKey(input) : null
  } catch {
    return null
  }
}

/** One of the two numbered input slots. Its border lights up once the value checks out. */
function KeySlot({
  n,
  label,
  hint,
  state,
  status,
  children,
}: {
  n: string
  label: string
  hint: string
  state: SlotState
  status: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'relative rounded-xl border bg-card p-5 transition-colors',
        state === 'ok' ? 'border-foreground/70 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_40px_-12px_rgba(255,255,255,0.25)]' : 'border-border',
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-card font-mono text-xs transition-colors',
            state === 'ok' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground',
          )}
        >
          {state === 'ok' ? <Check className="h-4 w-4" /> : n}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-heading text-xl text-foreground leading-tight">{label}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
          {children}
          <div className="min-h-5 text-xs">{status}</div>
        </div>
      </div>
    </div>
  )
}

function StatusLine({ tone, children }: { tone: 'ok' | 'bad' | 'muted'; children: ReactNode }) {
  const Icon = tone === 'ok' ? Check : tone === 'bad' ? CircleAlert : Loader2
  return (
    <span className={cn('inline-flex items-center gap-1.5', tone === 'ok' ? 'text-foreground' : 'text-muted-foreground')}>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', tone === 'muted' && 'animate-spin')} aria-hidden />
      {children}
    </span>
  )
}

export default function ProvePage() {
  const { address, chainId } = useAccount()
  const client = usePublicClient()
  const { data: wallet } = useWalletClient()
  const deployment = getDeployment(chainId)
  const { keys, unlock, unlocking } = useKeyVault()

  const [stealthInput, setStealthInput] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [destination, setDestination] = useState('')
  const [editDestination, setEditDestination] = useState(false)
  const [step, setStep] = useState<ClaimStep>('idle')
  const [proofResult, setProofResult] = useState<ProofResult | null>(null)
  const [claim, setClaim] = useState<{ hash: Hex; amount: string; symbol: string; to: Address } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [showProof, setShowProof] = useState(false)

  // Pre-fill the stealth address chosen on /receive (only the public value is passed).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('proveData')
      if (!raw) return
      const data = JSON.parse(raw) as { commitment?: string }
      if (data.commitment) setStealthInput(`0x${BigInt(data.commitment).toString(16).padStart(64, '0')}`)
      sessionStorage.removeItem('proveData')
    } catch {
      /* ignore */
    }
  }, [])

  // Keys unlocked earlier in this tab fill the second slot automatically.
  useEffect(() => {
    if (keys && !keyInput) setKeyInput(encodeMetaPrivateKey(keys))
  }, [keys, keyInput])

  useEffect(() => {
    if (address && !destination) setDestination(address)
  }, [address, destination])

  const commitment = parseStealthAddress(stealthInput)
  const parsedKey = useMemo(() => parseKey(keyInput), [keyInput])

  const noteQuery = useQuery({
    queryKey: ['note', chainId, deployment?.pool, commitment?.toString()],
    enabled: !!client && !!deployment && commitment !== null,
    queryFn: () => fetchNote(client!, deployment!.pool, commitment!),
  })
  const note = noteQuery.data
  const token = note ? tokenByAddress(chainId, note.token) : undefined

  // Does this key open this payment? Checked locally with the same math the circuit enforces.
  const ownership = useMemo(() => {
    if (!note || note.status === NoteStatus.None || !parsedKey || commitment === null) return null
    try {
      const shared = sharedValuesFor(parsedKey.viewPriv, fromHex(note.ephemeralPubKey))
      return computeCommitment(parsedKey.spendPub, shared.sharedSecret) === commitment ? shared : false
    } catch {
      return false
    }
  }, [note, parsedKey, commitment])

  // Slot 1 status
  let stealthState: SlotState = 'empty'
  let stealthStatus: ReactNode = <span className="text-muted-foreground">Paste the stealth address from the Receive page.</span>
  if (stealthInput.trim() && commitment === null) {
    stealthState = 'bad'
    stealthStatus = <StatusLine tone="bad">Not a valid stealth address (0x followed by up to 64 hex characters).</StatusLine>
  } else if (commitment !== null && !deployment) {
    stealthStatus = <StatusLine tone="bad">Connect to Arbitrum Sepolia or Robinhood Chain to look it up.</StatusLine>
  } else if (commitment !== null && noteQuery.isLoading) {
    stealthState = 'checking'
    stealthStatus = <StatusLine tone="muted">Looking up the payment on-chain…</StatusLine>
  } else if (note && note.status === NoteStatus.None) {
    stealthState = 'bad'
    stealthStatus = <StatusLine tone="bad">No payment exists at this stealth address on this network.</StatusLine>
  } else if (note && note.status === NoteStatus.Withdrawn) {
    stealthState = 'bad'
    stealthStatus = <StatusLine tone="bad">This payment has already been claimed.</StatusLine>
  } else if (note && note.status === NoteStatus.Pending) {
    stealthState = 'ok'
    stealthStatus = (
      <StatusLine tone="ok">
        Found · {formatAmount(note.amount, token?.decimals ?? 18)} {token?.symbol} · ready to claim
      </StatusLine>
    )
  }

  // Slot 2 status
  let keyState: SlotState = 'empty'
  let keyStatus: ReactNode = <span className="text-muted-foreground">Paste your spk:0x… key, or fill it from your wallet.</span>
  if (keyInput.trim() && !parsedKey) {
    keyState = 'bad'
    keyStatus = <StatusLine tone="bad">Not a valid meta private key (it starts with spk:0x).</StatusLine>
  } else if (parsedKey && ownership === null) {
    keyStatus = <StatusLine tone="ok">Valid key. Add the stealth address to check ownership.</StatusLine>
  } else if (parsedKey && ownership === false) {
    keyState = 'bad'
    keyStatus = <StatusLine tone="bad">This key does not own that payment.</StatusLine>
  } else if (parsedKey && ownership) {
    keyState = 'ok'
    keyStatus = <StatusLine tone="ok">Key matches this payment. Checked in your browser only.</StatusLine>
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).catch(() => undefined)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  async function fillFromWallet() {
    const k = keys ?? (await unlock())
    if (k) setKeyInput(encodeMetaPrivateKey(k))
  }

  async function proveAndClaim() {
    if (!note || !ownership || !parsedKey || commitment === null || !client || !wallet || !address || !deployment || !isAddress(destination)) return
    setError('')
    setProofResult(null)
    setClaim(null)
    try {
      // Step 1: Groth16 proof, generated locally. The key never leaves this tab.
      setStep('proving')
      const result = await proveInBrowser({
        spendPriv: parsedKey.spendPriv,
        sharedSecret: ownership.sharedSecret,
        commitment,
        recipient: destination as Address,
        relayer: zeroAddress,
        fee: 0n,
      })
      setProofResult({ proof: result.proof, publicSignals: result.publicSignals, ms: result.ms })

      // Step 2: the connected wallet submits the proof and pays gas.
      setStep('signing')
      const { request } = await client.simulateContract({
        account: address,
        ...(await feeOverrides(client)),
        address: deployment.pool,
        abi: stealthPoolAbi,
        functionName: 'withdraw',
        args: [result.proof, commitment, destination as Address, zeroAddress, 0n],
      })
      const hash = await wallet.writeContract(request)

      // Step 3: StealthPool runs the Groth16 verifier, then pays out.
      setStep('verifying')
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Claim transaction reverted')
      setClaim({ hash, amount: formatAmount(note.amount, token?.decimals ?? 18), symbol: token?.symbol ?? '', to: destination as Address })
      void noteQuery.refetch()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setStep('idle')
    }
  }

  const isWorking = step !== 'idle'
  const canProve = stealthState === 'ok' && keyState === 'ok' && isAddress(destination) && !!wallet
  const stepIdx = STEPS.findIndex((s) => s.key === step)
  const reusedWallet = !!address && destination.toLowerCase() === address.toLowerCase()

  return (
    <div className="min-h-screen bg-background dark">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-20">
        <div className="mb-10">
          <Badge variant="outline" className="mb-3 text-xs">
            ZK Claim
          </Badge>
          <h1 className="text-4xl font-bold font-heading mb-3">Prove &amp; Claim</h1>
          <p className="text-muted-foreground leading-relaxed">
            Two inputs unlock a payment: where it is, and the key that owns it. A zero-knowledge proof is generated in your browser,
            and Arbitrum verifies it before releasing the funds.
          </p>
        </div>

        <WalletStatus />

        {!claim && (
          <div className="relative mb-6 space-y-4">
            {/* connector between the two slots */}
            <div className="absolute left-[2.35rem] top-14 h-[calc(50%-1rem)] w-px bg-border" aria-hidden />

            <KeySlot n="01" label="Stealth address" hint="The one-time address the payment was sent to." state={stealthState} status={stealthStatus}>
              <input
                id="stealth-address"
                value={stealthInput}
                onChange={(e) => setStealthInput(e.target.value)}
                placeholder="0x1f3a…9c20"
                spellCheck={false}
                autoComplete="off"
                className="h-11 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              />
            </KeySlot>

            <KeySlot n="02" label="Meta private key" hint="Your secret key. It is used only inside this tab." state={keyState} status={keyStatus}>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    id="meta-private-key"
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="spk:0x…"
                    spellCheck={false}
                    autoComplete="off"
                    className="h-11 w-full rounded-md border border-input bg-background pl-3 pr-10 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" onClick={fillFromWallet} disabled={unlocking} className="h-11 shrink-0 cursor-pointer">
                  {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  <span className="hidden sm:inline">From wallet</span>
                </Button>
              </div>
            </KeySlot>

            {/* Payout */}
            <div className="rounded-xl border border-dashed border-border px-5 py-4 text-sm">
              {editDestination ? (
                <div className="space-y-2">
                  <label htmlFor="destination" className="text-xs text-muted-foreground">
                    Send funds to (locked into the proof, so nobody can redirect it)
                  </label>
                  <input
                    id="destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value.trim())}
                    placeholder="0x…"
                    spellCheck={false}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  />
                  {reusedWallet && (
                    <p className="text-xs text-muted-foreground">
                      Claiming to your connected wallet links this payment to it. A different address you control keeps it private.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <Wallet className="h-4 w-4 shrink-0" aria-hidden />
                    Funds arrive at
                    <span className="truncate font-mono text-xs text-foreground">
                      {isAddress(destination) ? `${destination.slice(0, 8)}…${destination.slice(-6)}` : 'your connected wallet'}
                    </span>
                  </span>
                  <button type="button" onClick={() => setEditDestination(true)} className="shrink-0 text-xs text-foreground underline underline-offset-4 cursor-pointer">
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Step-by-step progress */}
            {isWorking && (
              <div className="space-y-2">
                {STEPS.map((s, i) => {
                  const done = i < stepIdx
                  const active = i === stepIdx
                  return (
                    <div
                      key={s.key}
                      className={`flex items-center gap-3 p-2.5 rounded-md border text-sm transition-all ${
                        active ? 'bg-primary/10 border-primary/30 text-foreground' : done ? 'bg-muted/20 border-border text-muted-foreground' : 'border-transparent text-muted-foreground/40'
                      }`}
                    >
                      <div
                        className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          active ? 'bg-primary text-primary-foreground' : done ? 'bg-muted-foreground/30 text-muted-foreground' : 'border border-muted-foreground/20'
                        }`}
                      >
                        {done ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                      </div>
                      <span className="font-medium">{s.label}</span>
                      {active && s.key === 'proving' && <span className="text-xs text-muted-foreground ml-auto">~1 sec</span>}
                      {active && s.key === 'signing' && <span className="text-xs text-primary ml-auto animate-pulse">Check wallet</span>}
                    </div>
                  )
                })}
              </div>
            )}

            <Button onClick={proveAndClaim} disabled={!canProve || isWorking} className="h-12 w-full text-base cursor-pointer hover:bg-foreground! hover:text-background!">
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {STEPS[stepIdx]?.label}…
                </>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" />
                  Generate ZK Proof &amp; Claim Funds
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        {/* Success */}
        {claim && chainId && (
          <Card className="p-6 mb-6 bg-primary/5 border-primary/20 gap-0">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold font-heading mb-1">Funds Claimed!</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  <strong className="text-foreground">
                    {claim.amount} {claim.symbol}
                  </strong>{' '}
                  released from the StealthPool. The ZK proof was verified on-chain, and your key never left this tab.
                </p>

                <div className="space-y-2 mb-5">
                  <div className="p-2.5 rounded-md bg-muted/50 border border-border">
                    <p className="text-xs text-muted-foreground mb-0.5">Recipient</p>
                    <p className="font-mono text-xs break-all">{claim.to}</p>
                  </div>
                  <div className="p-2.5 rounded-md bg-muted/50 border border-border">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs text-muted-foreground">Claim transaction</p>
                      <button onClick={() => copy(claim.hash, 'hash')} className="text-muted-foreground hover:text-primary cursor-pointer">
                        {copied === 'hash' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    <p className="font-mono text-xs break-all">{claim.hash}</p>
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <a href={explorerTx(chainId, claim.hash)} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="cursor-pointer hover:bg-foreground! hover:text-background!">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      View on explorer
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setClaim(null)
                      setProofResult(null)
                      setStealthInput('')
                      setError('')
                    }}
                    className="cursor-pointer hover:bg-foreground! hover:text-background!"
                  >
                    Claim another
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ZK proof details */}
        {proofResult && (
          <div className="space-y-4">
            <Card className="p-5 bg-card border-border gap-0">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                ZK Proof Generated
                <span className="text-xs text-muted-foreground font-normal ml-auto">{proofResult.ms} ms, in-browser</span>
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Stealth address (public input)', value: `0x${proofResult.publicSignals[0].toString(16).padStart(64, '0')}`, key: 'c' },
                  { label: 'Payout address (bound into the proof)', value: `0x${proofResult.publicSignals[1].toString(16).padStart(40, '0')}`, key: 'r' },
                ].map(({ label, value, key }) => (
                  <div key={key} className="p-2.5 rounded-md bg-muted/50 border border-border">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <button onClick={() => copy(value, key)} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                        {copied === key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    <p className="font-mono text-xs break-all">{value}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="bg-card border-border overflow-hidden py-0 gap-0">
              <button className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setShowProof((v) => !v)}>
                <span className="text-sm font-semibold">Raw proof &amp; public signals</span>
                {showProof ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showProof && (
                <div className="border-t border-border">
                  {[
                    { label: 'Proof (Groth16, Solidity layout)', value: JSON.stringify(proofResult.proof, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2), key: 'proof' },
                    { label: 'Public signals [stealth address, recipient, relayer, fee]', value: JSON.stringify(proofResult.publicSignals.map(String), null, 2), key: 'sigs' },
                  ].map(({ label, value, key }) => (
                    <div key={key} className="p-4 border-b border-border last:border-b-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">{label}</span>
                        <button onClick={() => copy(value, key)} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                          {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <pre className="font-mono text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all bg-muted/30 rounded-md p-3">{value}</pre>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* How it works */}
        {!claim && (
          <div className="mt-10 p-5 rounded-lg border border-border bg-muted/20">
            <h3 className="text-sm font-semibold mb-3">How it works</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>
                The <span className="text-foreground font-medium">stealth address</span> is looked up on-chain to find the payment
              </li>
              <li>
                Your <span className="text-foreground font-medium">meta private key</span> is checked against it inside this tab
              </li>
              <li>
                snarkjs builds a <span className="text-foreground font-medium">Groth16 proof</span> that you own the payment, without revealing the key
              </li>
              <li>The StealthPool contract verifies the proof on-chain and marks the payment as claimed</li>
              <li>Funds arrive at the payout address. The link between sender and recipient stays hidden.</li>
            </ol>
          </div>
        )}
      </main>
    </div>
  )
}
