// Compiles the circuit and runs the Groth16 setup end to end from a clean checkout:
//   circom → PSE phase-1 ptau → phase-2 contribution + random beacon
//   → verification key → Solidity verifier → frontend artifacts.
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '..')
const build = join(root, 'build')
const ptauDir = join(root, 'ptau')
const NAME = 'stealth_withdraw'

// Phase 1: PSE perpetual powers of tau (80 public contributions), sized for 2^12 constraints.
const PTAU = 'ppot_0080_12.ptau'
const PTAU_URL = `https://pse-trusted-setup-ppot.s3.eu-central-1.amazonaws.com/pot28_0080/${PTAU}`

const isWin = process.platform === 'win32'
const bin = (name) => join(root, 'node_modules', '.bin', isWin ? `${name}.cmd` : name)
const run = (cmd, args) => {
  console.log(`$ ${cmd.split(/[\\/]/).pop()} ${args.join(' ')}`)
  // .cmd shims need a shell on Windows; native binaries do not.
  execFileSync(cmd, args, { stdio: 'inherit', cwd: root, shell: isWin && cmd.endsWith('.cmd') })
}

// Prefer a native circom on PATH (fast, reliable output paths on every OS);
// fall back to the circom2 WASM build from npm so a clean checkout needs no global install.
function circomBinary() {
  try {
    execFileSync('circom', ['--version'], { stdio: 'ignore' })
    return 'circom'
  } catch {
    return bin('circom2')
  }
}

async function fetchPtau() {
  const dest = join(ptauDir, PTAU)
  if (existsSync(dest)) return dest
  mkdirSync(ptauDir, { recursive: true })
  console.log(`Downloading ${PTAU_URL}`)
  const res = await fetch(PTAU_URL)
  if (!res.ok) throw new Error(`Could not download the phase-1 ptau file (HTTP ${res.status})`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}

mkdirSync(build, { recursive: true })

run(circomBinary(), [
  `src/${NAME}.circom`, '--r1cs', '--wasm', '--sym', '-o', 'build',
  '-l', join(root, 'node_modules'),
])

const ptau = await fetchPtau()
const snark = bin('snarkjs')
const z0 = `build/${NAME}_0000.zkey`
const z1 = `build/${NAME}_0001.zkey`
const zFinal = `build/${NAME}.zkey`

run(snark, ['groth16', 'setup', `build/${NAME}.r1cs`, ptau, z0])
run(snark, ['zkey', 'contribute', z0, z1, '--name=stealthy-phase2', `-e=${randomBytes(32).toString('hex')}`])
// A public beacon closes the ceremony so the final key does not rely on a single secret alone.
const beacon = createHash('sha256').update(`stealthy-arbitrum-${Date.now()}`).digest('hex')
run(snark, ['zkey', 'beacon', z1, zFinal, beacon, '10', '-n=stealthy-beacon'])
run(snark, ['zkey', 'verify', `build/${NAME}.r1cs`, ptau, zFinal])
run(snark, ['zkey', 'export', 'verificationkey', zFinal, 'build/verification_key.json'])

const verifierPath = join(repo, 'contracts', 'src', 'Groth16Verifier.sol')
mkdirSync(dirname(verifierPath), { recursive: true })
run(snark, ['zkey', 'export', 'solidityverifier', zFinal, verifierPath])
// snarkjs emits `pragma solidity >=0.7.0 <0.9.0;` — pin it to the project compiler range.
writeFileSync(
  verifierPath,
  readFileSync(verifierPath, 'utf8').replace(/pragma solidity [^;]+;/, 'pragma solidity ^0.8.24;'),
)

const pub = join(repo, 'frontend', 'public', 'circuits')
mkdirSync(pub, { recursive: true })
copyFileSync(join(build, `${NAME}_js`, `${NAME}.wasm`), join(pub, `${NAME}.wasm`))
copyFileSync(join(root, zFinal), join(pub, `${NAME}.zkey`))
copyFileSync(join(build, 'verification_key.json'), join(pub, 'verification_key.json'))
console.log('\nCircuit artifacts written to frontend/public/circuits and contracts/src/Groth16Verifier.sol')
