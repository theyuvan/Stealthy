// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";

/// @title StealthPool
/// @notice Private payments to stealth commitments, released only by an on-chain verified
///         Groth16 proof. The sender escrows USDG / USDC / ETH against
///         `commitment = Poseidon(spendPub, sharedSecret)`; only the holder of the recipient's
///         spending key can produce a proof that opens it.
/// @dev Trust model:
///      - Non-custodial: the owner can allowlist tokens and pause *new deposits*, but no role
///        can move escrowed funds. Withdrawals can never be paused.
///      - The proof binds (commitment, recipient, relayer, fee), so a relayer or a mempool
///        observer cannot redirect a withdrawal or raise its fee.
///      - Each commitment is single-use: accepted once on deposit, opened once on withdrawal.
contract StealthPool is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Withdrawn
    }

    /// @dev Packed into three slots: [token|createdAt|viewTag|ephPrefix|status],
    ///      [depositor|amount], [ephemeralX].
    struct Note {
        address token;
        uint32 createdAt;
        uint8 viewTag;
        uint8 ephemeralPrefix;
        Status status;
        address depositor;
        uint96 amount;
        bytes32 ephemeralX;
    }

    struct NoteView {
        uint256 commitment;
        address token;
        uint256 amount;
        bytes ephemeralPubKey;
        uint8 viewTag;
        Status status;
        uint40 createdAt;
        address depositor;
    }

    struct DepositParams {
        address token; // address(0) for native ETH
        uint256 amount;
        uint256 commitment;
        bytes ephemeralPubKey; // 33-byte compressed secp256k1 point R = r·G
        uint8 viewTag;
    }

    struct PermitParams {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    uint256 public constant SNARK_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    address public constant NATIVE_TOKEN = address(0);

    IGroth16Verifier public immutable verifier;

    mapping(uint256 commitment => Note) private _notes;
    uint256[] private _commitments;
    mapping(address token => bool) public isTokenAllowed;

    event Deposit(
        uint256 indexed commitment,
        address indexed token,
        address indexed depositor,
        uint256 index,
        uint256 amount,
        bytes ephemeralPubKey,
        uint8 viewTag
    );
    event Withdrawal(uint256 indexed commitment, address indexed recipient, address indexed relayer, uint256 fee);
    event TokenAllowed(address indexed token, bool allowed);

    error TokenNotAllowed(address token);
    error InvalidAmount();
    error InvalidCommitment();
    error CommitmentExists();
    error InvalidEphemeralKey();
    error UnexpectedValue();
    error UnsupportedToken();
    error NoteNotPending();
    error InvalidRecipient();
    error FeeExceedsAmount();
    error InvalidProof();
    error NativeTransferFailed();

    constructor(IGroth16Verifier verifier_, address owner_, address[] memory allowedTokens) Ownable(owner_) {
        verifier = verifier_;
        for (uint256 i; i < allowedTokens.length; ++i) {
            _setTokenAllowed(allowedTokens[i], true);
        }
    }

    // ─────────────────────────────────────────── Deposits

    /// @notice Pay a stealth commitment. ERC-20 deposits need a prior approval.
    function deposit(DepositParams calldata p) external payable nonReentrant whenNotPaused returns (uint256 index) {
        index = _recordDeposit(p);
        _pull(p.token, p.amount);
    }

    /// @notice Single-transaction ERC-20 deposit using an EIP-2612 permit (USDG and USDC support it).
    /// @dev The permit call is wrapped in try/catch so a front-run permit (which consumes the
    ///      nonce but still grants the allowance) cannot grief the deposit.
    function depositWithPermit(DepositParams calldata p, PermitParams calldata permit)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 index)
    {
        if (p.token == NATIVE_TOKEN) revert UnsupportedToken();
        try IERC20Permit(p.token).permit(msg.sender, address(this), p.amount, permit.deadline, permit.v, permit.r, permit.s) {}
            catch {}
        index = _recordDeposit(p);
        _pull(p.token, p.amount);
    }

    // ─────────────────────────────────────────── Withdrawals

    /// @notice Open a note with a zero-knowledge proof of the recipient's spending key.
    /// @param relayer Receives `fee` (in the note's token); address(0) when the recipient self-relays.
    function withdraw(Proof calldata proof, uint256 commitment, address recipient, address relayer, uint256 fee)
        external
        nonReentrant
    {
        Note storage note = _notes[commitment];
        if (note.status != Status.Pending) revert NoteNotPending();
        if (recipient == address(0)) revert InvalidRecipient();
        uint256 amount = note.amount;
        if (fee > amount) revert FeeExceedsAmount();
        if (fee != 0 && relayer == address(0)) revert InvalidRecipient();

        uint256[4] memory signals = [commitment, uint256(uint160(recipient)), uint256(uint160(relayer)), fee];
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, signals)) revert InvalidProof();

        note.status = Status.Withdrawn;
        emit Withdrawal(commitment, recipient, relayer, fee);

        address token = note.token;
        _push(token, recipient, amount - fee);
        if (fee != 0) _push(token, relayer, fee);
    }

    // ─────────────────────────────────────────── Views

    function noteCount() external view returns (uint256) {
        return _commitments.length;
    }

    function commitmentAt(uint256 index) external view returns (uint256) {
        return _commitments[index];
    }

    function getNote(uint256 commitment) public view returns (NoteView memory) {
        Note storage n = _notes[commitment];
        return NoteView({
            commitment: commitment,
            token: n.token,
            amount: n.amount,
            ephemeralPubKey: n.status == Status.None ? bytes("") : abi.encodePacked(n.ephemeralPrefix, n.ephemeralX),
            viewTag: n.viewTag,
            status: n.status,
            createdAt: n.createdAt,
            depositor: n.depositor
        });
    }

    /// @notice Page through every note for client-side scanning (no indexer or log range limits needed).
    function getNotes(uint256 start, uint256 count) external view returns (NoteView[] memory page) {
        uint256 total = _commitments.length;
        if (start >= total) return page;
        uint256 end = start + count > total ? total : start + count;
        page = new NoteView[](end - start);
        for (uint256 i = start; i < end; ++i) {
            page[i - start] = getNote(_commitments[i]);
        }
    }

    // ─────────────────────────────────────────── Admin

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        _setTokenAllowed(token, allowed);
    }

    /// @notice Stops new deposits only. Existing notes stay withdrawable.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─────────────────────────────────────────── Internals

    function _recordDeposit(DepositParams calldata p) private returns (uint256 index) {
        if (!isTokenAllowed[p.token]) revert TokenNotAllowed(p.token);
        if (p.amount == 0 || p.amount > type(uint96).max) revert InvalidAmount();
        if (p.commitment == 0 || p.commitment >= SNARK_FIELD) revert InvalidCommitment();
        if (_notes[p.commitment].status != Status.None) revert CommitmentExists();
        if (p.ephemeralPubKey.length != 33) revert InvalidEphemeralKey();
        uint8 prefix = uint8(p.ephemeralPubKey[0]);
        if (prefix != 2 && prefix != 3) revert InvalidEphemeralKey();

        _notes[p.commitment] = Note({
            token: p.token,
            createdAt: uint32(block.timestamp),
            viewTag: p.viewTag,
            ephemeralPrefix: prefix,
            status: Status.Pending,
            depositor: msg.sender,
            amount: uint96(p.amount),
            ephemeralX: bytes32(p.ephemeralPubKey[1:33])
        });
        index = _commitments.length;
        _commitments.push(p.commitment);

        emit Deposit(p.commitment, p.token, msg.sender, index, p.amount, p.ephemeralPubKey, p.viewTag);
    }

    /// @dev Pulls exactly `amount`; fee-on-transfer or rebasing tokens are rejected so a note
    ///      can never be worth more than the pool actually holds for it.
    function _pull(address token, uint256 amount) private {
        if (token == NATIVE_TOKEN) {
            if (msg.value != amount) revert UnexpectedValue();
            return;
        }
        if (msg.value != 0) revert UnexpectedValue();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - before != amount) revert UnsupportedToken();
    }

    function _push(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        if (token == NATIVE_TOKEN) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _setTokenAllowed(address token, bool allowed) private {
        isTokenAllowed[token] = allowed;
        emit TokenAllowed(token, allowed);
    }
}
