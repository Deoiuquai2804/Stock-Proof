// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StockProofRegistry
 * @notice Minimal Avalanche Fuji C-Chain registry anchoring SHA-256 hashes
 *         and verification summaries of claim-level financial Evidence Reports.
 */
contract StockProofRegistry {
    enum OverallStatus {
        PendingHITL,
        Approved,
        Rejected
    }

    struct EvidenceRecord {
        bytes32 reportHash;
        string ticker;
        string reportingPeriod;
        uint8 totalClaims;
        uint8 verifiedCount;
        uint8 mismatchCount;
        uint8 insufficientCount;
        uint8 hitlPendingCount;
        OverallStatus status;
        address submittedBy;
        uint256 anchoredAt;
        string buyerDecision;
    }

    address public immutable owner;
    mapping(bytes32 => EvidenceRecord) private records;
    bytes32[] private reportHashes;

    event EvidenceAnchored(
        bytes32 indexed reportHash,
        string ticker,
        string reportingPeriod,
        OverallStatus status,
        uint8 verifiedCount,
        uint8 totalClaims,
        address indexed submittedBy,
        uint256 anchoredAt
    );

    event BuyerDecisionRecorded(
        bytes32 indexed reportHash,
        string decision,
        address indexed buyer,
        uint256 updatedAt
    );

    constructor() {
        owner = msg.sender;
    }

    function recordEvidence(
        bytes32 reportHash,
        string calldata ticker,
        string calldata reportingPeriod,
        uint8 totalClaims,
        uint8 verifiedCount,
        uint8 mismatchCount,
        uint8 insufficientCount,
        uint8 hitlPendingCount,
        OverallStatus status
    ) external {
        require(reportHash != bytes32(0), "Invalid report hash");
        require(records[reportHash].anchoredAt == 0, "Report already anchored");

        records[reportHash] = EvidenceRecord({
            reportHash: reportHash,
            ticker: ticker,
            reportingPeriod: reportingPeriod,
            totalClaims: totalClaims,
            verifiedCount: verifiedCount,
            mismatchCount: mismatchCount,
            insufficientCount: insufficientCount,
            hitlPendingCount: hitlPendingCount,
            status: status,
            submittedBy: msg.sender,
            anchoredAt: block.timestamp,
            buyerDecision: "Pending"
        });

        reportHashes.push(reportHash);

        emit EvidenceAnchored(
            reportHash,
            ticker,
            reportingPeriod,
            status,
            verifiedCount,
            totalClaims,
            msg.sender,
            block.timestamp
        );
    }

    function recordBuyerDecision(
        bytes32 reportHash,
        string calldata decision
    ) external {
        require(records[reportHash].anchoredAt != 0, "Report not anchored");
        records[reportHash].buyerDecision = decision;
        emit BuyerDecisionRecorded(reportHash, decision, msg.sender, block.timestamp);
    }

    function verifyEvidence(bytes32 reportHash)
        external
        view
        returns (EvidenceRecord memory)
    {
        require(records[reportHash].anchoredAt != 0, "Report not found");
        return records[reportHash];
    }

    function totalAnchoredReports() external view returns (uint256) {
        return reportHashes.length;
    }
}
