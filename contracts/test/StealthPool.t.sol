// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {IGroth16Verifier} from "../src/interfaces/IGroth16Verifier.sol";
import {StealthPool} from "../src/StealthPool.sol";
import {ProofFixtures} from "./fixtures/ProofFixtures.sol";
import {FeeOnTransferToken, MockStablecoin} from "./mocks/Mocks.sol";

contract StealthPoolTest is Test {
    StealthPool internal pool;
    MockStablecoin internal usdg;

    address internal owner = makeAddr("owner");
    address internal sender;
    uint256 internal senderKey;

    uint256 internal constant AMOUNT = 100e6; // 100 USDG
    uint256 internal constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    bytes internal constant EPH = hex"02b8a4f1d2c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0";

    function setUp() public {
        (sender, senderKey) = makeAddrAndKey("sender");
        usdg = new MockStablecoin();
        address[] memory tokens = new address[](2);
        tokens[0] = address(usdg);
        tokens[1] = address(0); // native ETH
        pool = new StealthPool(IGroth16Verifier(address(new Groth16Verifier())), owner, tokens);

        usdg.mint(sender, 1_000_000e6);
        vm.deal(sender, 100 ether);
        vm.prank(sender);
        usdg.approve(address(pool), type(uint256).max);
    }

    // ─────────────────────────────────────────── helpers

    function _params(ProofFixtures.Fixture memory f, address token, uint256 amount)
        internal
        pure
        returns (StealthPool.DepositParams memory)
    {
        return StealthPool.DepositParams({
            token: token,
            amount: amount,
            commitment: f.commitment,
            ephemeralPubKey: f.ephemeralPubKey,
            viewTag: f.viewTag
        });
    }

    function _raw(uint256 commitment) internal pure returns (StealthPool.DepositParams memory) {
        return StealthPool.DepositParams({
            token: address(0),
            amount: 1 ether,
            commitment: commitment,
            ephemeralPubKey: EPH,
            viewTag: 7
        });
    }

    function _deposit(ProofFixtures.Fixture memory f, uint256 amount) internal {
        vm.prank(sender);
        pool.deposit(_params(f, address(usdg), amount));
    }

    function _withdraw(ProofFixtures.Fixture memory f) internal {
        pool.withdraw(f.proof, f.commitment, f.recipient, f.relayer, f.fee);
    }

    // ─────────────────────────────────────────── deposits

    function test_Deposit_RecordsNoteAndPullsTokens() public {
        ProofFixtures.Fixture memory f = ProofFixtures.relayed();
        StealthPool.DepositParams memory p = _params(f, address(usdg), AMOUNT);

        vm.expectEmit(address(pool));
        emit StealthPool.Deposit(f.commitment, address(usdg), sender, 0, AMOUNT, f.ephemeralPubKey, f.viewTag);
        vm.prank(sender);
        uint256 index = pool.deposit(p);

        assertEq(index, 0);
        assertEq(pool.noteCount(), 1);
        assertEq(pool.commitmentAt(0), f.commitment);
        assertEq(usdg.balanceOf(address(pool)), AMOUNT);

        StealthPool.NoteView memory n = pool.getNote(f.commitment);
        assertEq(n.token, address(usdg));
        assertEq(n.amount, AMOUNT);
        assertEq(n.ephemeralPubKey, f.ephemeralPubKey, "ephemeral key must round-trip through packed storage");
        assertEq(n.viewTag, f.viewTag);
        assertEq(uint8(n.status), uint8(StealthPool.Status.Pending));
        assertEq(n.depositor, sender);
        assertEq(n.createdAt, block.timestamp);
    }

    function test_Deposit_NativeEth() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        vm.prank(sender);
        pool.deposit{value: 1 ether}(_params(f, address(0), 1 ether));
        assertEq(address(pool).balance, 1 ether);
    }

    function test_GetNotes_Paginates() public {
        _deposit(ProofFixtures.relayed(), AMOUNT);
        _deposit(ProofFixtures.self(), AMOUNT);

        StealthPool.NoteView[] memory all = pool.getNotes(0, 10);
        assertEq(all.length, 2);
        assertEq(all[1].commitment, ProofFixtures.self().commitment);
        assertEq(pool.getNotes(1, 1).length, 1);
        assertEq(pool.getNotes(2, 5).length, 0);
    }

    function test_RevertWhen_TokenNotAllowed() public {
        FeeOnTransferToken other = new FeeOnTransferToken();
        StealthPool.DepositParams memory p = _params(ProofFixtures.self(), address(other), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(StealthPool.TokenNotAllowed.selector, address(other)));
        pool.deposit(p);
    }

    function test_RevertWhen_FeeOnTransferToken() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        vm.prank(owner);
        pool.setTokenAllowed(address(fot), true);
        fot.mint(sender, AMOUNT);

        vm.startPrank(sender);
        fot.approve(address(pool), AMOUNT);
        vm.expectRevert(StealthPool.UnsupportedToken.selector);
        pool.deposit(_params(ProofFixtures.self(), address(fot), AMOUNT));
        vm.stopPrank();
    }

    function test_RevertWhen_ZeroAmount() public {
        vm.expectRevert(StealthPool.InvalidAmount.selector);
        vm.prank(sender);
        pool.deposit(_params(ProofFixtures.self(), address(usdg), 0));
    }

    function test_RevertWhen_AmountOverflowsStorage() public {
        uint256 tooBig = uint256(type(uint96).max) + 1;
        usdg.mint(sender, tooBig);
        vm.expectRevert(StealthPool.InvalidAmount.selector);
        vm.prank(sender);
        pool.deposit(_params(ProofFixtures.self(), address(usdg), tooBig));
    }

    function testFuzz_RevertWhen_CommitmentOutsideField(uint256 commitment) public {
        commitment = bound(commitment, FIELD, type(uint256).max);
        vm.expectRevert(StealthPool.InvalidCommitment.selector);
        vm.prank(sender);
        pool.deposit{value: 1 ether}(_raw(commitment));
    }

    function test_RevertWhen_ZeroCommitment() public {
        vm.expectRevert(StealthPool.InvalidCommitment.selector);
        vm.prank(sender);
        pool.deposit{value: 1 ether}(_raw(0));
    }

    function test_RevertWhen_CommitmentReused() public {
        _deposit(ProofFixtures.self(), AMOUNT);
        vm.expectRevert(StealthPool.CommitmentExists.selector);
        vm.prank(sender);
        pool.deposit(_params(ProofFixtures.self(), address(usdg), AMOUNT));
    }

    function test_RevertWhen_BadEphemeralKey() public {
        StealthPool.DepositParams memory p = _raw(42);
        p.ephemeralPubKey = hex"04b8a4f1d2c3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0";
        vm.expectRevert(StealthPool.InvalidEphemeralKey.selector);
        vm.prank(sender);
        pool.deposit{value: 1 ether}(p);

        p.ephemeralPubKey = hex"02b8a4";
        vm.expectRevert(StealthPool.InvalidEphemeralKey.selector);
        vm.prank(sender);
        pool.deposit{value: 1 ether}(p);
    }

    function test_RevertWhen_WrongNativeValue() public {
        vm.expectRevert(StealthPool.UnexpectedValue.selector);
        vm.prank(sender);
        pool.deposit{value: 0.5 ether}(_raw(42));
    }

    function test_RevertWhen_EthSentWithTokenDeposit() public {
        vm.expectRevert(StealthPool.UnexpectedValue.selector);
        vm.prank(sender);
        pool.deposit{value: 1}(_params(ProofFixtures.self(), address(usdg), AMOUNT));
    }

    // ─────────────────────────────────────────── permit

    function _permitSig(uint256 amount, uint256 deadline) internal view returns (StealthPool.PermitParams memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                sender,
                address(pool),
                amount,
                usdg.nonces(sender),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(senderKey, keccak256(abi.encodePacked("\x19\x01", usdg.DOMAIN_SEPARATOR(), structHash)));
        return StealthPool.PermitParams(deadline, v, r, s);
    }

    function test_DepositWithPermit_SingleTransaction() public {
        vm.prank(sender);
        usdg.approve(address(pool), 0);

        StealthPool.PermitParams memory permit = _permitSig(AMOUNT, block.timestamp + 1 hours);
        vm.prank(sender);
        pool.depositWithPermit(_params(ProofFixtures.self(), address(usdg), AMOUNT), permit);
        assertEq(usdg.balanceOf(address(pool)), AMOUNT);
    }

    function test_DepositWithPermit_SurvivesFrontRunPermit() public {
        vm.prank(sender);
        usdg.approve(address(pool), 0);
        StealthPool.PermitParams memory permit = _permitSig(AMOUNT, block.timestamp + 1 hours);

        // Attacker submits the permit first; the nonce is consumed but the allowance stands.
        usdg.permit(sender, address(pool), AMOUNT, permit.deadline, permit.v, permit.r, permit.s);

        vm.prank(sender);
        pool.depositWithPermit(_params(ProofFixtures.self(), address(usdg), AMOUNT), permit);
        assertEq(usdg.balanceOf(address(pool)), AMOUNT);
    }

    function test_RevertWhen_PermitDepositOfNativeToken() public {
        StealthPool.PermitParams memory permit;
        vm.expectRevert(StealthPool.UnsupportedToken.selector);
        pool.depositWithPermit(_raw(42), permit);
    }

    // ─────────────────────────────────────────── withdrawals (real Groth16 proofs)

    function test_Withdraw_ViaRelayer_PaysRecipientAndFee() public {
        ProofFixtures.Fixture memory f = ProofFixtures.relayed();
        _deposit(f, AMOUNT);

        vm.expectEmit(address(pool));
        emit StealthPool.Withdrawal(f.commitment, f.recipient, f.relayer, f.fee);
        vm.prank(f.relayer);
        _withdraw(f);

        assertEq(usdg.balanceOf(f.recipient), AMOUNT - f.fee);
        assertEq(usdg.balanceOf(f.relayer), f.fee);
        assertEq(usdg.balanceOf(address(pool)), 0);
        assertEq(uint8(pool.getNote(f.commitment).status), uint8(StealthPool.Status.Withdrawn));
    }

    function test_Withdraw_SelfRelayNoFee() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        _deposit(f, AMOUNT);
        _withdraw(f);
        assertEq(usdg.balanceOf(f.recipient), AMOUNT);
    }

    function test_Withdraw_NativeEth() public {
        ProofFixtures.Fixture memory f = ProofFixtures.relayed();
        vm.prank(sender);
        pool.deposit{value: 1 ether}(_params(f, address(0), 1 ether));
        _withdraw(f);
        assertEq(f.recipient.balance, 1 ether - f.fee);
        assertEq(f.relayer.balance, f.fee);
    }

    function test_Withdraw_StillWorksWhilePaused() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        _deposit(f, AMOUNT);
        vm.prank(owner);
        pool.pause();
        _withdraw(f);
        assertEq(usdg.balanceOf(f.recipient), AMOUNT);
    }

    function test_RevertWhen_WithdrawTwice() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        _deposit(f, AMOUNT);
        _withdraw(f);
        vm.expectRevert(StealthPool.NoteNotPending.selector);
        _withdraw(f);
    }

    function test_RevertWhen_WithdrawUnknownNote() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        vm.expectRevert(StealthPool.NoteNotPending.selector);
        _withdraw(f);
    }

    function test_RevertWhen_FrontRunnerChangesRecipient() public {
        ProofFixtures.Fixture memory f = ProofFixtures.relayed();
        _deposit(f, AMOUNT);
        vm.expectRevert(StealthPool.InvalidProof.selector);
        pool.withdraw(f.proof, f.commitment, makeAddr("thief"), f.relayer, f.fee);
    }

    function test_RevertWhen_RelayerInflatesFee() public {
        ProofFixtures.Fixture memory f = ProofFixtures.relayed();
        _deposit(f, AMOUNT);
        vm.expectRevert(StealthPool.InvalidProof.selector);
        pool.withdraw(f.proof, f.commitment, f.recipient, f.relayer, f.fee + 1);
    }

    function test_RevertWhen_RelayerSwapsItself() public {
        ProofFixtures.Fixture memory f = ProofFixtures.relayed();
        _deposit(f, AMOUNT);
        vm.expectRevert(StealthPool.InvalidProof.selector);
        pool.withdraw(f.proof, f.commitment, f.recipient, makeAddr("other relayer"), f.fee);
    }

    function test_RevertWhen_ProofForAnotherNote() public {
        ProofFixtures.Fixture memory a = ProofFixtures.self();
        ProofFixtures.Fixture memory b = ProofFixtures.relayed();
        _deposit(a, AMOUNT);
        _deposit(b, AMOUNT);
        vm.expectRevert(StealthPool.InvalidProof.selector);
        pool.withdraw(b.proof, a.commitment, a.recipient, a.relayer, a.fee);
    }

    function test_RevertWhen_ProofTampered() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        _deposit(f, AMOUNT);
        f.proof.a[0] = f.proof.a[0] ^ 1;
        vm.expectRevert(); // invalid curve point or failed pairing
        _withdraw(f);
    }

    function test_RevertWhen_FeeExceedsAmount() public {
        ProofFixtures.Fixture memory f = ProofFixtures.relayed();
        _deposit(f, f.fee - 1);
        vm.expectRevert(StealthPool.FeeExceedsAmount.selector);
        _withdraw(f);
    }

    function test_RevertWhen_ZeroRecipient() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        _deposit(f, AMOUNT);
        vm.expectRevert(StealthPool.InvalidRecipient.selector);
        pool.withdraw(f.proof, f.commitment, address(0), f.relayer, f.fee);
    }

    function test_RevertWhen_FeeWithoutRelayer() public {
        ProofFixtures.Fixture memory f = ProofFixtures.self();
        _deposit(f, AMOUNT);
        vm.expectRevert(StealthPool.InvalidRecipient.selector);
        pool.withdraw(f.proof, f.commitment, f.recipient, address(0), 1);
    }

    // ─────────────────────────────────────────── admin

    function test_Pause_BlocksOnlyDeposits() public {
        vm.prank(owner);
        pool.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(sender);
        pool.deposit(_params(ProofFixtures.self(), address(usdg), AMOUNT));

        vm.prank(owner);
        pool.unpause();
        _deposit(ProofFixtures.self(), AMOUNT);
    }

    function test_RevertWhen_NonOwnerAdmin() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        pool.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        pool.setTokenAllowed(address(1), true);
        vm.stopPrank();
    }

    function test_OwnershipTransferIsTwoStep() public {
        address next = makeAddr("next");
        vm.prank(owner);
        pool.transferOwnership(next);
        assertEq(pool.owner(), owner);
        vm.prank(next);
        pool.acceptOwnership();
        assertEq(pool.owner(), next);
    }

    // ─────────────────────────────────────────── fuzz

    function testFuzz_DepositAnyValidAmount(uint96 amount, uint8 viewTag) public {
        vm.assume(amount > 0);
        usdg.mint(sender, amount);
        StealthPool.DepositParams memory p = _params(ProofFixtures.self(), address(usdg), amount);
        p.viewTag = viewTag;
        vm.prank(sender);
        pool.deposit(p);
        StealthPool.NoteView memory n = pool.getNote(p.commitment);
        assertEq(n.amount, amount);
        assertEq(n.viewTag, viewTag);
    }
}
