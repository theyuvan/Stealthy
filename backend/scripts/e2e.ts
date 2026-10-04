// End-to-end test against a live chain (normally an anvil fork of Arbitrum Sepolia),
// exercising exactly what the UI does:
//   register keys → look up → permit-deposit real USDG → scan → restore keys from a pasted meta private key
//   → prove → claim from the recipient wallet to an address of its choice
//   → ETH note self-claim → double-claim rejected.
//
// Env: RPC_URL, DEPLOYMENT (path to deployments json)
import { readFileSync } from 'node:fs'
// @ts-expect-error snarkjs ships no types
import * as snarkjs from 'snarkjs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  erc20Abi,
  http,
  keccak256,
  pad,
  parseAbi,
  parseAbiItem,
  parseSignature,
  toHex as viemToHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  createNote,
  decodeMetaAddress,
  encodeMetaAddress,
  encodeMetaPrivateKey,
  decodeMetaPrivateKey,
  KEY_DERIVATION_MESSAGE,
  keysFromSignature,
  NoteStatus,
  proveWithdraw,
  scanNotes,
  SCHEME_ID,
  toHex,
  toMetaAddress,
  toViewingKey,
  type OnchainNote,
  type Snarkjs,
} from '../src'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const dep = JSON.parse(readFileSync(process.env.DEPLOYMENT!, 'utf8')) as { pool: Address; registry: Address; usdg: Address; startBlock: number }
const artifacts = {
  wasm: join(repo, 'frontend', 'public', 'circuits', 'stealth_withdraw.wasm'),
  zkey: join(repo, 'frontend', 'public', 'circuits', 'stealth_withdraw.zkey'),
}
const out = (abiName: string) => JSON.parse(readFileSync(join(repo, 'contracts', 'out', `${abiName}.sol`, `${abiName}.json`), 'utf8')).abi
const poolAbi = out('StealthPool')
const registryAbi = out('StealthKeyRegistry')

// Works against a fork of either Arbitrum Sepolia (421614) or Robinhood Chain (46630).
const chainId = await createPublicClient({ transport: http(RPC) }).getChainId()
const chain = defineChain({
  id: chainId,
  name: `fork-${chainId}`,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
})
const client = createPublicClient({ chain, transport: http(RPC) })
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) })

let passed = 0
function ok(cond: unknown, what: string) {
  if (!cond) throw new Error(`FAILED: ${what}`)
  passed++
  console.log(`  ✓ ${what}`)
}

async function fundedWallet() {
  const account = privateKeyToAccount(generatePrivateKey())
  await test.setBalance({ address: account.address, value: 10n ** 18n })
  return { account, wallet: createWalletClient({ account, chain, transport: http(RPC) }) }
}

/** Finds USDG's balance mapping slot from a real holder, then writes a balance for `to`. */
async function dealUsdg(to: Address, amount: bigint) {
  const latest = await client.getBlockNumber()
  const logs = await client.getLogs({
    address: dep.usdg,
    event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
    fromBlock: latest - 2_000_000n,
    toBlock: latest,
  })
  for (const log of logs.reverse()) {
    const holder = log.args.to!
    const bal = await client.readContract({ address: dep.usdg, abi: erc20Abi, functionName: 'balanceOf', args: [holder] })
    if (bal === 0n) continue
    for (let slot = 0n; slot < 60n; slot++) {
      const key = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [holder, slot]))
      const raw = await client.getStorageAt({ address: dep.usdg, slot: key })
      if (raw && BigInt(raw) === bal) {
        const target = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [to, slot]))
        await test.setStorageAt({ address: dep.usdg, index: target, value: pad(viemToHex(amount)) })
        return
      }
    }
  }
  throw new Error('Could not locate the USDG balance slot')
}

async function allNotes(): Promise<OnchainNote[]> {
  const total = (await client.readContract({ address: dep.pool, abi: poolAbi, functionName: 'noteCount' })) as bigint
  const page = (await client.readContract({ address: dep.pool, abi: poolAbi, functionName: 'getNotes', args: [0n, total] })) as {
    commitment: bigint
    token: Address
    amount: bigint
    ephemeralPubKey: Hex
    viewTag: number
    status: number
    createdAt: number
  }[]
  return page.map((n, index) => ({ ...n, index, status: n.status as NoteStatus, createdAt: Number(n.createdAt) }))
}

console.log(`E2E on chain ${chainId} via ${RPC}\n`)

// 1. Recipient derives keys from a wallet signature and publishes the meta-address.
const bob = await fundedWallet()
const keys = keysFromSignature(await bob.wallet.signMessage({ message: KEY_DERIVATION_MESSAGE }))
const regHash = await bob.wallet.writeContract({
  address: dep.registry,
  abi: registryAbi,
  functionName: 'registerKeys',
  args: [SCHEME_ID, encodeMetaAddress(toMetaAddress(keys))],
})
await client.waitForTransactionReceipt({ hash: regHash })
ok(true, 'recipient published meta-address to StealthKeyRegistry')

// 2. Sender looks the recipient up by plain 0x address and pays real USDG with a permit.
const alice = await fundedWallet()
const AMOUNT = 25_000_000n // 25 USDG
await dealUsdg(alice.account.address, 1_000_000_000n)
const entry = (await client.readContract({
  address: dep.registry,
  abi: registryAbi,
  functionName: 'stealthMetaAddressOf',
  args: [bob.account.address, SCHEME_ID],
})) as Hex
const note = createNote(decodeMetaAddress(entry))
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
const nonce = await client.readContract({ address: dep.usdg, abi: parseAbi(['function nonces(address) view returns (uint256)']), functionName: 'nonces', args: [alice.account.address] })
const sig = parseSignature(
  await alice.wallet.signTypedData({
    domain: { name: 'Global Dollar', version: '1', chainId: chain.id, verifyingContract: dep.usdg },
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
    message: { owner: alice.account.address, spender: dep.pool, value: AMOUNT, nonce, deadline },
  }),
)
const depHash = await alice.wallet.writeContract({
  address: dep.pool,
  abi: poolAbi,
  functionName: 'depositWithPermit',
  args: [
    { token: dep.usdg, amount: AMOUNT, commitment: note.commitment, ephemeralPubKey: toHex(note.ephemeralPubKey), viewTag: note.viewTag },
    { deadline, v: Number(sig.v ?? BigInt(sig.yParity + 27)), r: sig.r, s: sig.s },
  ],
})
const depReceipt = await client.waitForTransactionReceipt({ hash: depHash })
ok(depReceipt.status === 'success', `single-tx USDG permit deposit (gas ${depReceipt.gasUsed})`)

// 3. Recipient scans with the viewing key.
const mine = scanNotes(toViewingKey(keys), await allNotes())
ok(mine.length === 1 && mine[0].commitment === note.commitment, 'recipient found exactly its note by scanning')
const pasted = decodeMetaPrivateKey(encodeMetaPrivateKey(keys))
ok(scanNotes(toViewingKey(pasted), await allNotes())[0]?.sharedSecret === mine[0].sharedSecret, 'pasted meta private key opens the same note')
const stranger = keysFromSignature(await alice.wallet.signMessage({ message: KEY_DERIVATION_MESSAGE }))
ok(scanNotes(toViewingKey(stranger), await allNotes()).length === 0, 'other keys see nothing')

// 4. The recipient's wallet submits the claim, paying out to a different address it chose.
const fresh = privateKeyToAccount(generatePrivateKey()).address
const t0 = performance.now()
const { proof } = await proveWithdraw(
  snarkjs as Snarkjs,
  { spendPriv: keys.spendPriv, sharedSecret: mine[0].sharedSecret, commitment: note.commitment, recipient: fresh, relayer: zeroAddress, fee: 0n },
  artifacts,
)
console.log(`    (proof generated in ${Math.round(performance.now() - t0)} ms)`)

const withdrawCall = (recipient: Address) => ({
  account: bob.account,
  address: dep.pool,
  abi: poolAbi,
  functionName: 'withdraw',
  args: [proof, note.commitment, recipient, zeroAddress, 0n],
}) as const
const redirected = await client.simulateContract(withdrawCall(alice.account.address)).then(() => false, () => true)
ok(redirected, 'proof replayed to a different recipient is rejected on-chain')

const wHash = await bob.wallet.writeContract(withdrawCall(fresh))
const wReceipt = await client.waitForTransactionReceipt({ hash: wHash })
ok(wReceipt.status === 'success', `on-chain Groth16 verification + payout (gas ${wReceipt.gasUsed})`)
const freshBal = await client.readContract({ address: dep.usdg, abi: erc20Abi, functionName: 'balanceOf', args: [fresh] })
ok(freshBal === AMOUNT, `chosen address received the full ${freshBal} (no fee)`)

// 5. Replay of the same claim is rejected.
const replayed = await client.simulateContract(withdrawCall(fresh)).then(() => false, () => true)
ok(replayed, 'double claim rejected')

// 6. ETH note, claimed back to the recipient wallet itself.
const ethNote = createNote(toMetaAddress(keys))
const ethHash = await alice.wallet.writeContract({
  address: dep.pool,
  abi: poolAbi,
  functionName: 'deposit',
  args: [{ token: zeroAddress, amount: 10n ** 16n, commitment: ethNote.commitment, ephemeralPubKey: toHex(ethNote.ephemeralPubKey), viewTag: ethNote.viewTag }],
  value: 10n ** 16n,
})
await client.waitForTransactionReceipt({ hash: ethHash })
const [found] = scanNotes(toViewingKey(keys), await allNotes()).filter((n) => n.status === NoteStatus.Pending)
const self = await proveWithdraw(
  snarkjs as Snarkjs,
  { spendPriv: keys.spendPriv, sharedSecret: found.sharedSecret, commitment: found.commitment, recipient: bob.account.address, relayer: zeroAddress, fee: 0n },
  artifacts,
)
const before = await client.getBalance({ address: bob.account.address })
const selfHash = await bob.wallet.writeContract({ address: dep.pool, abi: poolAbi, functionName: 'withdraw', args: [self.proof, found.commitment, bob.account.address, zeroAddress, 0n] })
const selfReceipt = await client.waitForTransactionReceipt({ hash: selfHash })
const gasCost = selfReceipt.gasUsed * selfReceipt.effectiveGasPrice
ok((await client.getBalance({ address: bob.account.address })) === before + 10n ** 16n - gasCost, 'ETH note self-claimed')

await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate()
console.log(`\nAll ${passed} end-to-end checks passed.`)
process.exit(0)
