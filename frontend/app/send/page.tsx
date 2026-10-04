'use client'

import {
  createNote,
  decodeMetaAddress,
  isMetaAddress,
  SCHEME_ID,
  toHex,
  type StealthNote,
} from '@stealthy/sdk'
import { ArrowRight, Check, Copy, ExternalLink, Loader2, Shield } from 'lucide-react'
import { useState } from 'react'
import { erc20Abi, isAddress, parseAbi, parseSignature, parseUnits, zeroAddress, type Address, type Hex } from 'viem'
import { useAccount, useBalance, usePublicClient, useReadContract, useWalletClient } from 'wagmi'
import Navbar from '@/components/navbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorBox, WalletStatus } from '@/components/wallet-status'
import { stealthKeyRegistryAbi, stealthPoolAbi } from '@/lib/abi'
import { explorerTx, FAUCETS, getChain, getDeployment } from '@/lib/chains'
import { errorMessage, formatAmount } from '@/lib/format'
import { tokensFor, type TokenInfo } from '@/lib/tokens'
import { feeOverrides } from '@/lib/tx'
import { cn } from '@/lib/utils'

const permitAbi = parseAbi(['function nonces(address owner) view returns (uint256)'])

type Step = 'idle' | 'derived' | 'submitted'

export default function SendPage() {
  const { address, chainId, connector } = useAccount()
  const client = usePublicClient()
  const { data: wallet } = useWalletClient()
  const deployment = getDeployment(chainId)
  const tokens = tokensFor(chainId)

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('5')
  const [tokenAddr, setTokenAddr] = useState<Address | null>(null)
  const [note, setNote] = useState<StealthNote | null>(null)
  const [recipientLabel, setRecipientLabel] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const token: TokenInfo | undefined = tokens.find((t) => t.address === tokenAddr) ?? tokens[0]
  const nativeBalance = useBalance({ address })
  const tokenBalance = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? zeroAddress],
    query: { enabled: !!address && !!token && token.address !== zeroAddress },
  })
  const balance = token?.address === zeroAddress ? nativeBalance.data?.value : tokenBalance.data

  let parsedAmount: bigint | undefined
  try {
    parsedAmount = amount && token ? parseUnits(amount, token.decimals) : undefined
  } catch {
    parsedAmount = undefined
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  /** Resolves a 0x address through the on-chain registry, or accepts a raw meta-address. */
  async function deriveAddress() {
    setError('')
    setNote(null)
    setStep('idle')
    const input = recipient.trim()
    try {
      if (!deployment || !client) throw new Error('Connect your wallet to Arbitrum Sepolia or Robinhood Chain first')
      if (!parsedAmount || parsedAmount <= 0n) throw new Error('Enter an amount greater than zero')
      if (balance !== undefined && parsedAmount > balance) throw new Error(`Insufficient ${token?.symbol} balance`)
      let meta
      if (isMetaAddress(input)) {
        meta = decodeMetaAddress(input)
        setRecipientLabel('meta-address')
      } else if (isAddress(input)) {
        const entry = await client.readContract({
          address: deployment.registry,
          abi: stealthKeyRegistryAbi,
          functionName: 'stealthMetaAddressOf',
          args: [input, SCHEME_ID],
        })
        if (!entry || entry === '0x' || !isMetaAddress(entry)) {
          throw new Error('This address has not registered a Stealthy meta-address on this network yet. Ask them to register on /receive.')
        }
        meta = decodeMetaAddress(entry)
        setRecipientLabel(`${input.slice(0, 6)}…${input.slice(-4)}`)
      } else {
        throw new Error('Enter a 0x wallet address or an st:arb:0x… meta-address')
      }
      setNote(createNote(meta))
      setStep('derived')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function sendPayment() {
    if (!note || !parsedAmount || !token || !deployment || !client || !wallet || !address) return
    setError('')
    try {
      const params = {
        token: token.address,
        amount: parsedAmount,
        commitment: note.commitment,
        ephemeralPubKey: toHex(note.ephemeralPubKey),
        viewTag: note.viewTag,
      } as const

      let hash: Hex
      if (token.address === zeroAddress) {
        setProgress('Confirm in wallet…')
        const { request } = await client.simulateContract({
          account: address,
          ...(await feeOverrides(client)),
          address: deployment.pool,
          abi: stealthPoolAbi,
          functionName: 'deposit',
          args: [params],
          value: parsedAmount,
        })
        hash = await wallet.writeContract(request)
      } else {
        const allowance = await client.readContract({ address: token.address, abi: erc20Abi, functionName: 'allowance', args: [address, deployment.pool] })
        let permitted: Hex | null = null
        if (allowance < parsedAmount && token.permit) {
          try {
            setProgress(`Sign ${token.symbol} permit (no gas)…`)
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
            const nonce = await client.readContract({ address: token.address, abi: permitAbi, functionName: 'nonces', args: [address] })
            const signature = await wallet.signTypedData({
              account: address,
              domain: { name: token.permit.name, version: token.permit.version, chainId: client.chain!.id, verifyingContract: token.address },
              types: {
                Permit: [
                  { name: 'owner', type: 'address' },
                  { name: 'spender', type: 'address' },
                  { name: 'value', type: 'uint256' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'deadline', type: 'uint256' },
                ],
              },
              primaryType: 'Permit',
              message: { owner: address, spender: deployment.pool, value: parsedAmount, nonce, deadline },
            })
            const { r, s, v, yParity } = parseSignature(signature)
            setProgress('Confirm payment in wallet…')
            const { request } = await client.simulateContract({
              account: address,
              ...(await feeOverrides(client)),
              address: deployment.pool,
              abi: stealthPoolAbi,
              functionName: 'depositWithPermit',
              args: [params, { deadline, v: Number(v ?? BigInt(yParity + 27)), r, s }],
            })
            permitted = await wallet.writeContract(request)
          } catch (e) {
            if (errorMessage(e).toLowerCase().includes('reject')) throw e
            // Wallet can't sign typed data: fall back to approve + deposit.
          }
        }
        if (permitted) {
          hash = permitted
        } else {
          if (allowance < parsedAmount) {
            setProgress(`Approve ${token.symbol} in wallet…`)
            const approveHash = await wallet.writeContract({
              account: address,
              chain: client.chain,
              address: token.address,
              abi: erc20Abi,
              functionName: 'approve',
              args: [deployment.pool, parsedAmount],
              ...(await feeOverrides(client)),
            })
            await client.waitForTransactionReceipt({ hash: approveHash })
          }
          setProgress('Confirm payment in wallet…')
          const { request } = await client.simulateContract({
            account: address,
            ...(await feeOverrides(client)),
            address: deployment.pool,
            abi: stealthPoolAbi,
            functionName: 'deposit',
            args: [params],
          })
          hash = await wallet.writeContract(request)
        }
      }

      setProgress('Waiting for confirmation…')
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted')
      setTxHash(hash)
      setStep('submitted')
      void tokenBalance.refetch()
      void nativeBalance.refetch()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setProgress(null)
    }
  }

  function reset() {
    setNote(null)
    setStep('idle')
    setTxHash(null)
    setRecipient('')
    setAmount('5')
    setError('')
  }

  const chainName = getChain(chainId)?.name

  return (
    <div className="min-h-screen bg-background dark">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-20">
        <div className="mb-10">
          <Badge variant="outline" className="mb-3 text-xs">
            {chainName ?? 'Testnet'}
          </Badge>
          <h1 className="text-4xl font-bold font-heading mb-3">Send a Private Payment</h1>
          <p className="text-muted-foreground leading-relaxed">
            Enter the recipient&apos;s wallet address or meta-address. A fresh one-time commitment is derived, and only the
            recipient&apos;s viewing key can link it back to them.
          </p>
        </div>

        <WalletStatus />

        {step !== 'submitted' && (
          <Card className="p-6 mb-6 bg-card border-border gap-0">
            <div className="space-y-4">
              <div>
                <Label htmlFor="meta" className="text-sm font-medium mb-2 block">
                  Recipient
                  <span className="text-muted-foreground font-normal ml-1 text-xs">(registered 0x address or st:arb: meta-address)</span>
                </Label>
                <Input
                  id="meta"
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value)
                    setStep('idle')
                    setNote(null)
                  }}
                  placeholder="0x… or st:arb:0x…"
                  className="font-mono text-sm"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div>
                  <Label htmlFor="amount" className="text-sm font-medium mb-2 block">
                    Amount
                  </Label>
                  <Input
                    id="amount"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value.replace(/[^0-9.]/g, ''))
                      setStep('idle')
                    }}
                    placeholder="5"
                    inputMode="decimal"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Token</Label>
                  <div className="flex h-9 gap-1 rounded-md border border-input p-0.5">
                    {tokens.map((t) => (
                      <button
                        key={t.address}
                        type="button"
                        onClick={() => {
                          setTokenAddr(t.address)
                          setStep('idle')
                        }}
                        className={cn(
                          'rounded px-3 text-xs font-semibold transition-colors cursor-pointer',
                          t.address === token?.address ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t.symbol}
                      </button>
                    ))}
                    {tokens.length === 0 && <span className="px-3 text-xs text-muted-foreground self-center">USDG</span>}
                  </div>
                </div>
              </div>
              {token && balance !== undefined && (
                <p className="text-xs text-muted-foreground -mt-2">
                  Balance: {formatAmount(balance, token.decimals)} {token.symbol}
                </p>
              )}

              <Button
                onClick={deriveAddress}
                disabled={!recipient.trim() || !deployment || !!progress}
                className="w-full cursor-pointer hover:bg-foreground! hover:text-background!"
              >
                <Shield className="mr-2 h-4 w-4" />
                Derive Stealth Commitment
              </Button>
            </div>
          </Card>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        {/* Derived: show the public values + send button */}
        {note && step === 'derived' && token && (
          <Card className="p-6 mb-6 bg-card border-border gap-0">
            <h2 className="text-base font-semibold font-heading mb-1">Stealth Commitment Ready</h2>
            <p className="text-sm text-muted-foreground mb-5">
              A one-time commitment was derived from {recipientLabel}&apos;s keys. This is all the chain will see: no recipient address.
            </p>

            <div className="space-y-3 mb-6">
              {[
                { label: 'Commitment (payment destination)', value: `0x${note.commitment.toString(16).padStart(64, '0')}`, key: 'commit' },
                { label: 'Ephemeral key R (scanning hint for recipient)', value: toHex(note.ephemeralPubKey), key: 'ephem' },
              ].map(({ label, value, key }) => (
                <div key={key} className="p-3 rounded-md bg-muted/50 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <button onClick={() => copy(value, key)} className="text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                      {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all">{value}</p>
                </div>
              ))}
            </div>

            <Button onClick={sendPayment} disabled={!!progress} className="w-full cursor-pointer hover:bg-foreground! hover:text-background!">
              {progress ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress}
                </>
              ) : (
                <>
                  Send {amount} {token.symbol} via {connector?.name ?? 'wallet'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </Card>
        )}

        {/* Success */}
        {step === 'submitted' && note && txHash && chainId && (
          <Card className="p-6 bg-primary/5 border-primary/20 gap-0">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold font-heading mb-1">Payment Sent!</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  <strong className="text-foreground">
                    {amount} {token?.symbol}
                  </strong>{' '}
                  escrowed against a fresh stealth commitment on {chainName}. The recipient scans on{' '}
                  <strong className="text-foreground">/receive</strong> to discover it.
                </p>

                <div className="space-y-2 mb-5">
                  {[
                    { label: 'Commitment', value: `0x${note.commitment.toString(16).padStart(64, '0')}` },
                    { label: 'Ephemeral key R', value: toHex(note.ephemeralPubKey) },
                    { label: 'Sender', value: address ?? '' },
                    { label: 'Transaction hash', value: txHash },
                  ].map(({ label, value }) => (
                    <div key={label} className="p-2 rounded-md bg-muted/50 border border-border">
                      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                      <p className="font-mono text-xs break-all">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 flex-wrap">
                  <a href={explorerTx(chainId, txHash)} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="cursor-pointer hover:bg-foreground! hover:text-background!">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      View on explorer
                    </Button>
                  </a>
                  <Button variant="ghost" size="sm" onClick={reset} className="cursor-pointer hover:bg-foreground! hover:text-background!">
                    Send another
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {step === 'idle' && (
          <div className="mt-8 p-5 rounded-lg border border-border bg-muted/20">
            <h3 className="text-sm font-semibold mb-2">How the recipient gets paid</h3>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>
                They go to <strong className="text-foreground">/receive</strong> and sign once to unlock their keys
              </li>
              <li>
                They click <strong className="text-foreground">&quot;Register On-chain&quot;</strong> to publish their meta-address
              </li>
              <li>
                You can now pay their <strong className="text-foreground">normal 0x address</strong> privately
              </li>
              <li>
                Need test funds?{' '}
                {(chainId && FAUCETS[chainId] ? FAUCETS[chainId] : []).map((f, i) => (
                  <span key={f.url}>
                    {i > 0 && ' · '}
                    <a className="text-primary hover:underline" href={f.url} target="_blank" rel="noreferrer">
                      {f.label} faucet
                    </a>
                  </span>
                ))}
              </li>
            </ol>
          </div>
        )}
      </main>
    </div>
  )
}
