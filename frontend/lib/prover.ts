'use client'

import { proveWithdraw, type Snarkjs, type WithdrawProof, type WithdrawWitness } from '@stealthy/sdk'

const ARTIFACTS = {
  wasm: '/circuits/stealth_withdraw.wasm',
  zkey: '/circuits/stealth_withdraw.zkey',
}

let loader: Promise<Snarkjs> | null = null

/** Loads the snarkjs browser bundle once, from our own origin. */
function loadSnarkjs(): Promise<Snarkjs> {
  const w = window as unknown as { snarkjs?: Snarkjs }
  if (w.snarkjs) return Promise.resolve(w.snarkjs)
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/snarkjs.min.js'
    script.async = true
    script.onload = () => (w.snarkjs ? resolve(w.snarkjs) : reject(new Error('snarkjs failed to initialise')))
    script.onerror = () => {
      loader = null
      reject(new Error('Could not load the prover'))
    }
    document.head.appendChild(script)
  })
  return loader
}

/**
 * Generates the Groth16 withdrawal proof entirely in this browser tab.
 * The witness (spending key + shared secret) is never serialised or sent anywhere;
 * only the resulting proof and public signals leave this function.
 */
export async function proveInBrowser(witness: WithdrawWitness): Promise<WithdrawProof & { ms: number }> {
  const snarkjs = await loadSnarkjs()
  const started = performance.now()
  const result = await proveWithdraw(snarkjs, witness, ARTIFACTS)
  return { ...result, ms: Math.round(performance.now() - started) }
}
