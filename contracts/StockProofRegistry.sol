// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StockProofRegistry
 * @notice Blockchain-based verification registry on Avalanche Fuji Testnet.
 *         Stores document hashes, evidence bundle hashes, verification statuses,
 *         report versions, and timestamps without storing confidential filings on-chain.
 * @dev Implements OpenZeppelin-compatible Ownable + authorized verifier role pattern.
 */
contract StockProofRegistry {
    enum VerificationStatus {
        VERIFIED,
        PARTIAL_MISMATCH,
        PENDING_REVIEW
    }

    struct ReportRegistration {
        bytes32 reportHash;
        string reportId;
        uint256 version;
        address registeredBy;
        uint256 timestamp;
        bool exists;
    }

    struct EvidenceRegistration {
        string reportId;
        bytes32 evidenceHash;
        VerificationStatus verificationStatus;
        address verifiedBy;
        uint256 timestamp;
        bool exists;
    }

    address private _owner;
    mapping(address => bool) public authorizedVerifiers;
    mapping(string => ReportRegistration) private _reports;
    mapping(string => EvidenceRegistration) private _evidences;
    string[] private _reportIds;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event VerifierAuthorizationUpdated(address indexed verifier, bool authorized);
    event ReportRegistered(
        string indexed reportIdHash,
        string reportId,
        bytes32 reportHash,
        uint256 version,
        address indexed registeredBy,
        uint256 timestamp
    );
    event EvidenceRegistered(
        string indexed reportIdHash,
        string reportId,
        bytes32 evidenceHash,
        VerificationStatus verificationStatus,
        address indexed verifiedBy,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == _owner, "Ownable: caller is not the owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == _owner || authorizedVerifiers[msg.sender],
            "StockProof: caller is not an authorized verifier"
        );
        _;
    }

    constructor() {
        _owner = msg.sender;
        authorizedVerifiers[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function setAuthorizedVerifier(address verifier, bool authorized) external onlyOwner {
        require(verifier != address(0), "StockProof: zero address");
        authorizedVerifiers[verifier] = authorized;
        emit VerifierAuthorizationUpdated(verifier, authorized);
    }

    function registerReport(
        bytes32 reportHash,
        string memory reportId,
        uint256 version
    ) external onlyAuthorized {
        require(reportHash != bytes32(0), "StockProof: empty report hash");
        require(bytes(reportId).length > 0, "StockProof: empty reportId");
        require(version > 0, "StockProof: version must be positive");

        if (!_reports[reportId].exists) {
            _reportIds.push(reportId);
        }

        _reports[reportId] = ReportRegistration({
            reportHash: reportHash,
            reportId: reportId,
            version: version,
            registeredBy: msg.sender,
            timestamp: block.timestamp,
            exists: true
        });

        emit ReportRegistered(
            reportId,
            reportId,
            reportHash,
            version,
            msg.sender,
            block.timestamp
        );
    }

    function registerEvidence(
        string memory reportId,
        bytes32 evidenceHash,
        uint8 verificationStatus
    ) external onlyAuthorized {
        require(_reports[reportId].exists, "StockProof: report not registered");
        require(evidenceHash != bytes32(0), "StockProof: empty evidence hash");
        require(
            verificationStatus <= uint8(VerificationStatus.PENDING_REVIEW),
            "StockProof: invalid status"
        );

        VerificationStatus statusEnum = VerificationStatus(verificationStatus);

        _evidences[reportId] = EvidenceRegistration({
            reportId: reportId,
            evidenceHash: evidenceHash,
            verificationStatus: statusEnum,
            verifiedBy: msg.sender,
            timestamp: block.timestamp,
            exists: true
        });

        emit EvidenceRegistered(
            reportId,
            reportId,
            evidenceHash,
            statusEnum,
            msg.sender,
            block.timestamp
        );
    }

    function getReport(
        string memory reportId
    ) external view returns (ReportRegistration memory) {
        require(_reports[reportId].exists, "StockProof: report not found");
        return _reports[reportId];
    }

    function getEvidence(
        string memory reportId
    ) external view returns (EvidenceRegistration memory) {
        require(_evidences[reportId].exists, "StockProof: evidence not found");
        return _evidences[reportId];
    }

    function totalReports() external view returns (uint256) {
        return _reportIds.length;
    }
}
