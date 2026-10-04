import type React from 'react'
import type { Metadata } from 'next'
import { DM_Sans, Instrument_Serif } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const instrumentSerif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], display: 'swap', variable: '--font-heading-face' })
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body-face' })

export const metadata: Metadata = {
  title: 'Stealthy: Private Payments on Arbitrum',
  description:
    'Privacy-preserving USDG payments on Arbitrum and Robinhood Chain using stealth commitments and zero-knowledge proofs verified on-chain.',
  icons: { icon: '/icon.svg' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${instrumentSerif.variable} ${dmSans.variable}`}>
      <body className="font-body pt-16">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
