// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DataTypes} from "../shared/DataTypes.sol";
import {Hashing} from "../shared/Hashing.sol";

contract OptimisticPortalMock {
    uint256 public constant BOND_AMOUNT = 0.1 ether;
    uint64 public constant CHALLENGE_WINDOW = 120;
    // Burn a slice of the loser's slashed bond. This makes a sequencer that
    // self-challenges (posts fraud, then "catches" itself to reclaim its stake)
    // strictly lose money, so it cannot launder a slashed bond back.
    uint256 public constant SLASH_BURN_BPS = 1000; // 10%
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    address public sequencer;
    address public disputeGame;
    uint64 public nextBatchId;

    struct SubmittedBatch {
        bytes32 headerHash;
        DataTypes.BatchHeader header;
        bytes32 rawDataHash;
        uint256 bond; // sequencer bond
        uint256 challengerBond;
        uint64 submittedAt;
        bool finalized;
        bool challenged;
        address challenger;
    }

    mapping(uint64 => SubmittedBatch) public batches;

    event BatchPosted(
        uint64 indexed batchId,
        bytes32 headerHash,
        bytes32 postStateRoot,
        bytes32 batchDataHash,
        uint32 txCount,
        uint256 bond
    );
    event BatchChallenged(uint64 indexed batchId, address indexed challenger);
    event BatchFinalized(uint64 indexed batchId, bool valid);
    // Emitted whenever bonds settle: the winner receives the pot minus the burn.
    event BondSettled(uint64 indexed batchId, address indexed winner, uint256 payout, uint256 burned);

    constructor(address _sequencer, address _disputeGame) {
        sequencer = _sequencer;
        disputeGame = _disputeGame;
    }

    function postBatch(DataTypes.BatchHeader calldata header, bytes calldata rawData) external payable {
        require(msg.sender == sequencer, "only sequencer");
        require(msg.value >= BOND_AMOUNT, "insufficient bond");

        uint64 id = nextBatchId++;
        require(header.batchId == id, "wrong batch id");

        bytes32 hHash = Hashing.hashBatchHeader(header);
        bytes32 dataHash = keccak256(rawData);

        batches[id] = SubmittedBatch({
            headerHash: hHash,
            header: header,
            rawDataHash: dataHash,
            bond: msg.value,
            challengerBond: 0,
            submittedAt: uint64(block.timestamp),
            finalized: false,
            challenged: false,
            challenger: address(0)
        });

        emit BatchPosted(id, hHash, header.postStateRoot, header.batchDataHash, header.txCount, msg.value);
    }

    function challengeBatch(uint64 batchId) external payable {
        SubmittedBatch storage b = batches[batchId];
        require(!b.finalized, "already finalized");
        require(!b.challenged, "already challenged");
        require(block.timestamp < b.submittedAt + CHALLENGE_WINDOW, "challenge window closed");
        require(msg.value >= BOND_AMOUNT, "challenger bond required");

        b.challenged = true;
        b.challenger = msg.sender;
        // Both bonds stay escrowed here. The interactive fraud proof is opened
        // separately by the challenger via FraudProofGame.initiate; on resolution
        // the game calls finalizeBatch, which pays the winner from the escrow.
        b.challengerBond = msg.value;

        emit BatchChallenged(batchId, msg.sender);
    }

    /// @param valid true if the sequencer's batch was upheld (honest). The game
    ///        passes the on-chain verdict; the backend passes true for an
    ///        unchallenged batch whose window has closed.
    function finalizeBatch(uint64 batchId, bool valid) external {
        SubmittedBatch storage b = batches[batchId];
        require(!b.finalized, "already finalized");
        b.finalized = true;

        if (b.challenged) {
            require(msg.sender == disputeGame, "only dispute game");
            // Winner takes the pot (both bonds) minus a burn on the loser's stake.
            uint256 loserBond = valid ? b.challengerBond : b.bond;
            uint256 burn = (loserBond * SLASH_BURN_BPS) / 10000;
            uint256 payout = b.bond + b.challengerBond - burn;
            address winner = valid ? sequencer : b.challenger;
            payable(winner).transfer(payout);
            if (burn > 0) {
                payable(BURN_ADDRESS).transfer(burn);
            }
            emit BondSettled(batchId, winner, payout, burn);
        } else {
            require(block.timestamp >= b.submittedAt + CHALLENGE_WINDOW, "challenge window open");
            // Unchallenged and past the window: return the sequencer's bond.
            payable(sequencer).transfer(b.bond);
            emit BondSettled(batchId, sequencer, b.bond, 0);
        }

        emit BatchFinalized(batchId, valid);
    }

    function getBatch(uint64 batchId) external view returns (SubmittedBatch memory) {
        return batches[batchId];
    }

    receive() external payable {}
}
