# Stealthy: private stablecoin payments on Arbitrum

> **Arbitrum Open House Buildathon.** Get paid in **USDG** without exposing your wallet. Every payment lands on a
> one-time stealth commitment that only the recipient can open, using a **Groth16 proof generated in the browser and
> verified on-chain on Arbitrum**. Live on **Arbitrum Sepolia** and **Robinhood Chain Testnet**.

| | |
|---|---|
| **Chains** | Arbitrum Sepolia (421614) · Robinhood Chain Testnet (46630) · Arbitrum One-ready |
| **Stablecoin** | Paxos **USDG** (native, with single-tx EIP-2612 permit deposits) · USDC · ETH |
| **Contracts** | `StealthPool` · `StealthKeyRegistry` (ERC-6538 interface) · `Groth16Verifier` |
| **ZK** | Circom 2 · Groth16 / BN254 · 935 constraints · ~0.6 s proving in the browser |
| **Tests** | 43 Foundry tests (real proofs, fuzzing) · 16 SDK/circuit tests · 10-step fork E2E on both chains against real USDG |

---

## Deployed contracts

Owner on both chains: `0xfEd7f6C96f9Ff062a4522AD56BF8548a046b22e9`.

| Contract | Arbitrum Sepolia | Robinhood Chain Testnet |
|---|---|---|
| StealthPool | [0xFfe0a95A1Ffd486e7f516791d5c63803a88C77b7](https://sepolia.arbiscan.io/address/0xFfe0a95A1Ffd486e7f516791d5c63803a88C77b7) | [0xE474514770C384Cde73AaF618B4118960a0292e8](https://explorer.testnet.chain.robinhood.com/address/0xE474514770C384Cde73AaF618B4118960a0292e8) |
| StealthKeyRegistry | [0xEC3671ECE0C62e6BB7a50A4d24b77FF86a4ca7B1](https://sepolia.arbiscan.io/address/0xEC3671ECE0C62e6BB7a50A4d24b77FF86a4ca7B1) | [0x44abd6eB6091e29AC99fAea73891ffDCa5f19944](https://explorer.testnet.chain.robinhood.com/address/0x44abd6eB6091e29AC99fAea73891ffDCa5f19944) |
| Groth16Verifier | [0xE474514770C384Cde73AaF618B4118960a0292e8](https://sepolia.arbiscan.io/address/0xE474514770C384Cde73AaF618B4118960a0292e8) | [0xC8F99C4BbcE1Fab1Cf26B0Ef8756283D8a29252E](https://explorer.testnet.chain.robinhood.com/address/0xC8F99C4BbcE1Fab1Cf26B0Ef8756283D8a29252E) |

The deployed verifiers accept a real proof generated from this repo's circuit (`eth_call` returns `true`) and reject the same proof with the fee changed by one unit, on both chains. Allowed tokens: Paxos USDG and ETH on both chains, plus USDC on Arbitrum Sepolia.

---

## 1. The problem

Stablecoins are becoming the way the internet pays people, and Arbitrum settles a large share of that volume. But
every on-chain payment is a **public bank statement**:

- **Payroll** in stablecoins publishes every salary to colleagues, competitors and strangers.
- **Freelancers** who share an address also share their income, other clients and savings.
- **Treasuries** leak supplier relationships, runway and deal flow in real time.

Existing answers don't fit. Mixers are sanctioned and all-or-nothing. Privacy chains need bridges and break the
payment rails. Manual address rotation doesn't scale. **Stealthy is a privacy layer that runs directly on
Arbitrum's payment rails, in USDG, with selective disclosure built in.**

## 2. How it works

```
 Recipient                         Sender                          Arbitrum
 ─────────                         ──────                          ────────
 sign 1 message ─► viewKey, spendKey
 publish meta-address ───────────────────────────────────────────► StealthKeyRegistry
                                   look up 0xBob ◄──────────────── meta-address
                                   r ← random, R = r·G
                                   S = r·viewPub   (ECDH)
                                   commitment = Poseidon(spendPub, H(S))
                                   depositWithPermit(USDG, commitment, R) ──────► StealthPool
 scan: S = viewKey·R, view-tag filter,
       recompute commitment ◄────────────────────────────────────── getNotes()
 prove (in browser):
   "I know spendPriv, sharedSecret opening
    commitment" + bind the payout address
 withdraw(proof, …) ──────────────────────────────────────────────► Groth16 verified on-chain,
                                                                    USDG → any fresh address
```

**Key design choices**

| Decision | Why |
|---|---|
| **Scan/spend key split.** Viewing key = secp256k1 (ECDH); spending key = Poseidon pre-image | The viewing key can go to an auditor without granting spend rights. The sender knows the shared secret but can never spend. |
| **Keys derived from one wallet signature** (HKDF over an RFC-6979 signature) | Nothing to back up; sign again on any device to restore. |
| **Commitment-based notes in a pool contract**, not stealth EOAs | Stablecoins need no gas at the stealth address, and the recipient can pay out to any address they choose. |
| **Payout binding in the circuit.** `recipient` (plus `relayer` and `fee`, reserved for a future relayer and fixed to zero today) are public inputs | A mempool observer cannot copy the proof and redirect the claim. |
| **On-chain Groth16 verification** (~200k gas of pairing checks) | No funds move unless the contract itself has checked the proof. On Arbitrum the pairing check costs a fraction of a cent. |
| **View tags** (1 byte) | Scanning skips 255/256 foreign notes before any Poseidon hashing. |
| **`getNotes()` pagination from storage** | Scanning needs no indexer and hits no RPC log-range limits. |
| **ERC-6538 registry interface** | Pay a normal `0x` address; includes EIP-712 `registerKeysOnBehalf` for gasless onboarding. |

## 3. Trust model: what is and isn't private

| Public on Arbitrum | Private (browser only) |
|---|---|
| Commitment (random-looking), ephemeral key `R` | Spending key: never leaves the tab, never persisted |
| Token and amount | Which commitments belong to whom |
| Sender address | Your meta private key (claims payments) |
| That a note was opened, and the payout address the recipient chose | The link between a meta-address and any payment |

**Honest limitations.** Amounts are visible. A withdrawal reveals which note was opened, so if the recipient claims to
their *main* wallet, observers can link sender to recipient. The app warns about this and lets the recipient choose any
payout address. Full unlinkability (a Merkle-tree shielded pool with
association-set compliance, as in Privacy Pools) is on the roadmap.

**Contract guarantees**

- **Non-custodial.** No role can move escrowed funds. `pause()` stops *new deposits only*; withdrawals always work.
- **Single-use notes.** A commitment is accepted once and opened once (`Status: None → Pending → Withdrawn`).
- **Exact accounting.** Fee-on-transfer and rebasing tokens are rejected by balance-diff checks; token allowlist; `uint96` packing bounds-checked.
- **Front-run-safe permits.** `depositWithPermit` wraps `permit` in try/catch so a front-run permit can't grief the deposit.
- **Field checks.** Commitments must be non-zero and `< SNARK_FIELD`; ephemeral keys must be 33-byte compressed points.
- **OpenZeppelin 5.4.** `Ownable2Step`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `EIP712`, `SignatureChecker`.

## 4. Engineering choices

| Area | What we did |
|---|---|
| **Keys never leave the device** | Proving happens in the browser (`frontend/lib/prover.ts`, snarkjs WASM served from the app's own origin). No server ever sees a key: the `backend/` package is a TypeScript library that runs inside the browser, and the recipient's own wallet submits the proof to the contract. The E2E test exercises this exact path. |
| **The proof is bound to the payment** | The circuit proves knowledge of the pre-image of **the specific note commitment** and binds the payout parameters, so a copied proof cannot be redirected. |
| **Reproducible circuit build** | The circuit uses `include "circomlib/..."` resolved with `-l` library paths. `npm run build` in `circuits/` compiles it (native circom, or the `circom2` WASM compiler from npm as a fallback), downloads the PSE perpetual powers of tau, runs the phase-2 contribution and random beacon, verifies the zkey, and exports the Solidity verifier and frontend artifacts. |
| **Tested with real proofs** | **69 automated checks**: SDK unit tests (derivation, encoding, scanning, auditor keys, meta private keys), real-circuit proving tests (a valid proof verifies, a tampered signal fails, the sender can't prove), 43 Foundry tests with **real Groth16 proofs** (front-running, fee inflation, replay, permits, pausing, fuzzing), and a fork E2E against Paxos USDG on Arbitrum Sepolia. |

## 5. Judging criteria

| Criterion | How Stealthy addresses it |
|---|---|
| **Smart contract quality** | Minimal, audited-library-based contracts; custom errors; packed storage (3 slots per note); CEI + reentrancy guard; no admin fund access; 43 tests including real-proof attack cases and fuzzing; ERC-6538-compatible registry. |
| **Product-market fit** | Stablecoin payroll, freelance invoicing, B2B settlement and aid all need payment privacy *with* auditability. Pay-to-`0x`-address UX, one-signature onboarding, claims to any payout address, CSV audit export. |
| **Innovation** | Scan/spend-split stealth commitments with a Poseidon spending key, so the sender can pay but provably can't spend. In-browser Groth16 with on-chain verification. Proofs bound to the payout address, so they cannot be front-run. Deployed on both Arbitrum and Robinhood Chain. |
| **Real problem solving** | Public stablecoin rails leak salaries, client lists and treasury strategy today. Stealthy fixes that without a mixer, a bridge or a custodian, and keeps a compliance path (viewing keys). |
| **USDG bonus** | USDG is the default token, with single-transaction EIP-2612 permit deposits verified against the real Paxos contracts on both chains. |

## 6. Repository layout

```
backend/     TypeScript core used by the app and the tests: key derivation, stealth notes, scanning,
             proof formatting. It runs inside the browser; no server ever holds a key.
  scripts/   fixtures.ts (real proofs → Solidity test fixtures) · e2e.ts (fork end-to-end test)
  test/      unit tests + real-circuit proving tests
circuits/    stealth_withdraw.circom + reproducible build and trusted-setup script
contracts/   Foundry: StealthPool, StealthKeyRegistry, Groth16Verifier (generated), tests, deploy script
frontend/    Next.js 15 app: landing, Send, Receive, Prove, History, auditor view
README.md
```

Each folder is its own project with its own `package.json`. The frontend imports `backend/` directly.

## 7. Run it

Prerequisites: Node 20+, [Foundry](https://book.getfoundry.sh). Circom is optional (falls back to the npm WASM build).

```bash
git clone <repo> && cd <repo>
(cd backend && npm install) && (cd circuits && npm install) && (cd contracts && npm install) && (cd frontend && npm install)

# Tests
cd backend && npm test && cd ..       # unit tests + real-circuit proving tests
cd contracts && forge test -vv && cd ..

# App (reads contract ABIs + deployments automatically)
cd frontend && npm run dev            # http://localhost:3000

# (Optional) rebuild circuit + trusted setup, then regenerate proof fixtures.
# NOTE: this creates a NEW proving key, so the deployed verifiers no longer match: redeploy afterwards.
cd circuits && npm run build && cd ../backend && npm run fixtures
```

### Deploy

```bash
cd contracts
cast wallet import deployer --interactive       # store the key in Foundry's encrypted keystore
forge script script/Deploy.s.sol --rpc-url https://sepolia-rollup.arbitrum.io/rpc  --account deployer --broadcast
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.chain.robinhood.com --account deployer --broadcast
cd ../frontend && npm run sync                  # pull addresses + ABIs into the app
```

Token addresses are built in: USDG `0xFFC9…1892` (Arbitrum Sepolia) and `0x7E95…802F` (Robinhood testnet), and
USDC `0x75fa…AA4d` (Arbitrum Sepolia).

### Fork end-to-end test

```bash
anvil --fork-url https://sepolia-rollup.arbitrum.io/rpc --chain-id 421614
cd contracts && DEPLOYMENT_OUT=deployments/fork-421614.json forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 --private-key <anvil key 0> --broadcast
cd ../backend && RPC_URL=http://127.0.0.1:8545 DEPLOYMENT=../contracts/deployments/fork-421614.json npx tsx scripts/e2e.ts
```

The fork shares chain ID 421614, so Foundry records its run under `broadcast/Deploy.s.sol/421614/`. Restore
`run-latest.json` from the real timestamped run afterwards, and don't commit the fork's run file.

Measured on the fork: USDG permit deposit **240k gas**; claim with on-chain proof verification **294k gas**.

### Getting testnet funds

Arbitrum Sepolia ETH: [arbitrum.faucet.dev](https://arbitrum.faucet.dev) · USDG: [faucet.paxos.com](https://faucet.paxos.com) ·
USDC: [faucet.circle.com](https://faucet.circle.com) · Robinhood Chain ETH: [faucet.testnet.chain.robinhood.com](https://faucet.testnet.chain.robinhood.com)

## 8. Trusted setup

Phase 1 is the PSE perpetual powers of tau (`ppot_0080_12`, 80 public contributions). Phase 2 is one contribution plus a
random beacon, produced by `circuits/scripts/build.js` and verified with `snarkjs zkey verify`. That is fine for a
testnet. Before mainnet, run a multi-party phase-2 ceremony.

## 9. Roadmap

1. **Shielded mode.** Merkle-tree commitments + nullifiers so a withdrawal doesn't reveal which note it opens, with
   Privacy-Pools-style association sets to keep compliance.
2. **Stylus verifier.** Port the Groth16 verifier and Poseidon to Rust/Stylus for lower claim gas.
3. **Payroll batches.** One transaction pays N employees to N stealth commitments.
4. **Account-abstraction onboarding.** Gasless `registerKeysOnBehalf` through a paymaster.
5. **Mainnet**: Arbitrum One and Robinhood Chain after an audit and a multi-party ceremony.

## License

MIT. Testnet software, not audited. Do not use with real funds.
