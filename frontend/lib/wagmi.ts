import { createConfig, http, injected } from 'wagmi'
import { arbitrumSepolia, robinhoodTestnet, supportedChains } from './chains'

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [injected()],
  transports: {
    [arbitrumSepolia.id]: http(),
    [robinhoodTestnet.id]: http(),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
