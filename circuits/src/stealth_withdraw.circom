pragma circom 2.1.6;

// Resolved via the `-l` library paths passed by scripts/build.js, so the circuit
// compiles on a clean checkout regardless of where npm hoists circomlib.
include "circomlib/circuits/poseidon.circom";

/*
 * StealthWithdraw
 *
 * A Stealthy note is a Poseidon commitment created by the *sender*:
 *
 *     spendPub   = Poseidon(spendPriv)              (published in the recipient's meta-address)
 *     commitment = Poseidon(spendPub, sharedSecret) (stored in StealthPool)
 *
 * `sharedSecret` comes from an ECDH exchange between the sender's ephemeral key
 * and the recipient's secp256k1 viewing key, so only the sender and recipient
 * can recognise the note. Knowing `sharedSecret` is NOT enough to spend: the
 * sender never learns `spendPriv`, a Poseidon pre-image.
 *
 * The proof shows, without revealing either secret, that the prover knows
 * (spendPriv, sharedSecret) opening `commitment`. It also binds the payout
 * parameters (recipient, relayer, fee), so a proof seen in the mempool cannot be
 * replayed with a different payout address or a higher relayer fee.
 */
template StealthWithdraw() {
    // ── Private witness: never leaves the prover's browser ─────────────────
    signal input spendPriv;
    signal input sharedSecret;

    // ── Public inputs: checked by the on-chain Groth16 verifier ────────────
    signal input commitment;
    signal input recipient;   // uint160(address) that receives amount - fee
    signal input relayer;     // uint160(address) that receives fee (0 = self-relay)
    signal input fee;         // denominated in the note's token

    component spendPub = Poseidon(1);
    spendPub.inputs[0] <== spendPriv;

    component note = Poseidon(2);
    note.inputs[0] <== spendPub.out;
    note.inputs[1] <== sharedSecret;
    note.out === commitment;

    // Give each payout signal a constraint so the compiler cannot optimise it
    // away; the verifier then rejects any proof replayed with altered values.
    signal recipientSq <== recipient * recipient;
    signal relayerSq   <== relayer * relayer;
    signal feeSq       <== fee * fee;
}

component main {public [commitment, recipient, relayer, fee]} = StealthWithdraw();
