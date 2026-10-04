import { SNARK_FIELD } from './constants'
import type { Hex } from './utils'

/** The subset of snarkjs used here; injected so the SDK works with the browser bundle or the npm module. */
export interface Snarkjs {
  groth16: {
    fullProve(
      input: Record<string, string>,
      wasm: string | Uint8Array,
      zkey: string | Uint8Array,
    ): Promise<{ proof: Groth16Proof; publicSignals: string[] }>
    verify(vkey: unknown, publicSignals: string[], proof: Groth16Proof): Promise<boolean>
  }
}

export interface Groth16Proof {
  pi_a: string[]
  pi_b: string[][]
  pi_c: string[]
  protocol?: string
  curve?: string
}

/** Proof laid out for Groth16Verifier.verifyProof / StealthPool.withdraw. */
export interface SolidityProof {
  a: readonly [bigint, bigint]
  b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]]
  c: readonly [bigint, bigint]
}

export interface WithdrawWitness {
  spendPriv: bigint
  sharedSecret: bigint
  commitment: bigint
  recipient: Hex
  relayer: Hex // zero address for self-relay
  fee: bigint
}

export interface CircuitArtifacts {
  wasm: string | Uint8Array
  zkey: string | Uint8Array
}

export interface WithdrawProof {
  proof: SolidityProof
  publicSignals: [bigint, bigint, bigint, bigint] // commitment, recipient, relayer, fee
  raw: Groth16Proof
}

function inField(name: string, value: bigint) {
  if (value < 0n || value >= SNARK_FIELD) throw new Error(`${name} is outside the BN254 scalar field`)
}

export function toSolidityProof(proof: Groth16Proof): SolidityProof {
  // G2 coordinates are (x1, x0), (y1, y0) in the EVM pairing precompile.
  return {
    a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    b: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  }
}

/**
 * Generates the withdrawal proof locally. The private inputs (spendPriv, sharedSecret)
 * exist only in this call's memory: nothing here performs network I/O except loading
 * the circuit artifacts.
 */
export async function proveWithdraw(snarkjs: Snarkjs, witness: WithdrawWitness, artifacts: CircuitArtifacts): Promise<WithdrawProof> {
  inField('spendPriv', witness.spendPriv)
  inField('sharedSecret', witness.sharedSecret)
  inField('commitment', witness.commitment)
  inField('fee', witness.fee)
  const recipient = BigInt(witness.recipient)
  const relayer = BigInt(witness.relayer)

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      spendPriv: witness.spendPriv.toString(),
      sharedSecret: witness.sharedSecret.toString(),
      commitment: witness.commitment.toString(),
      recipient: recipient.toString(),
      relayer: relayer.toString(),
      fee: witness.fee.toString(),
    },
    artifacts.wasm,
    artifacts.zkey,
  )
  const signals = publicSignals.map(BigInt)
  if (
    signals.length !== 4 ||
    signals[0] !== witness.commitment ||
    signals[1] !== recipient ||
    signals[2] !== relayer ||
    signals[3] !== witness.fee
  ) {
    throw new Error('Circuit returned unexpected public signals')
  }
  return {
    proof: toSolidityProof(proof),
    publicSignals: signals as [bigint, bigint, bigint, bigint],
    raw: proof,
  }
}
