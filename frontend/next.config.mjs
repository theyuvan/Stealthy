import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a verification build run next to a live dev server without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The app imports ../backend, so file tracing starts at the repo root.
  outputFileTracingRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  transpilePackages: ['@stealthy/sdk'],
  webpack: (config) => {
    // wagmi's optional connectors reference these; they are not used in the browser bundle.
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

export default nextConfig
