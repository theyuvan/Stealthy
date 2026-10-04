import { ArrowRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/** A paper-slip receipt. `inverted` renders the private (white) version. */
function Receipt({
  title,
  tag,
  rows,
  footer,
  inverted,
}: {
  title: string
  tag: string
  rows: { k: string; v: React.ReactNode; strong?: boolean }[]
  footer: React.ReactNode
  inverted?: boolean
}) {
  return (
    <div
      className={
        'relative w-full rounded-lg px-5 pt-5 pb-6 font-mono text-[12.5px] leading-relaxed shadow-2xl shadow-black/60 ' +
        (inverted ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground border border-border')
      }
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <span className="font-body text-sm font-semibold tracking-tight">{title}</span>
        <span
          className={
            'rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ' +
            (inverted ? 'border-primary-foreground/30' : 'border-border text-muted-foreground')
          }
        >
          {tag}
        </span>
      </div>
      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-4">
            <dt className={inverted ? 'opacity-60' : 'text-muted-foreground'}>{r.k}</dt>
            <dd className={'text-right ' + (r.strong ? 'font-semibold' : '')}>{r.v}</dd>
          </div>
        ))}
      </dl>
      <div className={'my-4 border-t border-dashed ' + (inverted ? 'border-primary-foreground/30' : 'border-border')} />
      <div className={'text-[11.5px] ' + (inverted ? 'opacity-80' : 'text-muted-foreground')}>{footer}</div>
    </div>
  )
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-4 lg:px-8 pt-16 md:pt-24 pb-20 md:pb-28">
      {/* faint ledger grid */}
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, #000 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 30%, #000 40%, transparent 100%)',
        }}
      />

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-10">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-foreground animate-pulse" aria-hidden />
            Live on testnet
          </span>
          <span>Arbitrum Sepolia</span>
          <span>Robinhood Chain</span>
          <span>Paxos USDG</span>
        </div>

        <h1 className="font-heading text-[clamp(3.2rem,9.5vw,8.5rem)] leading-[0.92] text-foreground mb-12 md:mb-16">
          Get paid in stablecoins.
          <br />
          <span className="italic text-muted-foreground">Stay unseen.</span>
        </h1>

        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-5 space-y-8">
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl">
              Stealthy sends every USDG payment to a <span className="text-foreground font-medium">one-time commitment</span> only
              the recipient can recognise. They claim it with a <span className="text-foreground font-medium">zero-knowledge proof</span>{' '}
              that Arbitrum verifies on-chain. Your address, balance and clients stay yours.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/receive">
                <Button size="lg" className="h-12 px-7 text-base cursor-pointer w-full sm:w-auto">
                  Start receiving privately
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/send">
                <Button size="lg" variant="outline" className="h-12 px-7 text-base cursor-pointer w-full sm:w-auto">
                  Send a payment
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">No account. One wallet signature sets up your private keys.</p>
          </div>

          {/* The thesis, as two receipts */}
          <div className="lg:col-span-7 grid sm:grid-cols-2 gap-5 items-start">
            <Receipt
              title="Ordinary transfer"
              tag="Public"
              rows={[
                { k: 'From', v: '0xA11c…7e02' },
                { k: 'To', v: <span className="underline decoration-dotted underline-offset-4">0xB0b5…c4e1</span>, strong: true },
                { k: 'Amount', v: '4,250.00 USDG', strong: true },
                { k: 'Their balance', v: '38,912.40 USDG' },
                { k: 'Past payments', v: '214 visible' },
              ]}
              footer="Anyone with the recipient's address can read their whole financial history."
            />
            <div className="sm:mt-12">
              <Receipt
                inverted
                title="Stealthy transfer"
                tag="Private"
                rows={[
                  { k: 'From', v: '0xA11c…7e02' },
                  {
                    k: 'To',
                    v: (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-3 w-20 rounded-sm bg-primary-foreground" aria-hidden />
                        <span className="sr-only">hidden</span>
                      </span>
                    ),
                    strong: true,
                  },
                  { k: 'Amount', v: '4,250.00 USDG', strong: true },
                  { k: 'Commitment', v: '0x1f3a…9c20' },
                  { k: 'Their balance', v: 'not linkable' },
                ]}
                footer={
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Claimed with a Groth16 proof, verified on-chain
                  </span>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
