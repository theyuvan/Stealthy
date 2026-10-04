import { Check, Eye, Minus } from 'lucide-react'

type Cell = { text: string; tone: 'exposed' | 'private' | 'neutral' }

const ROWS: { label: string; wallet: Cell; stealthy: Cell }[] = [
  { label: 'Who received the payment', wallet: { text: 'Visible to everyone', tone: 'exposed' }, stealthy: { text: 'Hidden', tone: 'private' } },
  { label: 'Your total balance', wallet: { text: 'Visible to everyone', tone: 'exposed' }, stealthy: { text: 'Not linkable to you', tone: 'private' } },
  { label: 'Every past payment', wallet: { text: 'One click away', tone: 'exposed' }, stealthy: { text: 'Each one unlinkable', tone: 'private' } },
  { label: 'Who your clients are', wallet: { text: 'Visible to everyone', tone: 'exposed' }, stealthy: { text: 'Hidden', tone: 'private' } },
  { label: 'Payment amount', wallet: { text: 'Visible', tone: 'neutral' }, stealthy: { text: 'Visible', tone: 'neutral' } },
]

function Value({ cell }: { cell: Cell }) {
  const Icon = cell.tone === 'exposed' ? Eye : cell.tone === 'private' ? Check : Minus
  return (
    <span
      className={
        'inline-flex items-start gap-1.5 sm:gap-2 ' +
        (cell.tone === 'private' ? 'text-foreground font-medium' : cell.tone === 'exposed' ? 'text-muted-foreground' : 'text-muted-foreground/70')
      }
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
      {cell.text}
    </span>
  )
}

export default function Visibility() {
  return (
    <section className="px-4 lg:px-8 py-24 md:py-32">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-4 space-y-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">The problem</p>
          <h2 className="font-heading text-4xl md:text-6xl leading-[1.02] text-foreground">
            What the world can <span className="italic">see</span>
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-md">
            A wallet address is a permanent, public bank statement. Stealthy keeps the payment rail and the stablecoin, and
            removes the part that exposes you. Amounts stay visible on purpose: this is private, not anonymous.
          </p>
        </div>

        <div className="lg:col-span-8 min-w-0">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="px-3 py-3 sm:px-5 sm:py-4 font-medium text-muted-foreground w-[38%]">
                    On-chain
                  </th>
                  <th scope="col" className="px-3 py-3 sm:px-5 sm:py-4 font-medium text-muted-foreground">
                    A normal wallet
                  </th>
                  <th scope="col" className="px-3 py-3 sm:px-5 sm:py-4 font-semibold text-foreground bg-muted/40">
                    Stealthy
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.label} className="border-t border-border">
                    <th scope="row" className="px-3 py-3 sm:px-5 sm:py-4 text-left font-medium text-foreground">
                      {r.label}
                    </th>
                    <td className="px-3 py-3 sm:px-5 sm:py-4">
                      <Value cell={r.wallet} />
                    </td>
                    <td className="px-3 py-3 sm:px-5 sm:py-4 bg-muted/40">
                      <Value cell={r.stealthy} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
