export type VerificationStatus =
  | 'Verified'
  | 'Mismatch'
  | 'Insufficient Evidence'
  | 'Needs Human Review';

export type ClaimCategory =
  | 'Income Statement'
  | 'Balance Sheet'
  | 'Cash Flow'
  | 'Financial Ratio';

export type RuleOutcome = 'pass' | 'fail' | 'warn' | 'skip';

export interface RuleCheckDetail {
  rule: 'Source' | 'Period' | 'Unit' | 'Formula' | 'Value';
  outcome: RuleOutcome;
  expected: string;
  actual: string;
  messageVi: string;
  messageEn: string;
}

export interface GroundTruthItem {
  claimId: string;
  metricCode: string;
  metricNameEn: string;
  metricNameVi: string;
  category: ClaimCategory;
  standardValue: number;
  unit: string;
  period: string;
  formulaExpression?: string;
  formulaOperands?: Record<string, number>;
  sourceDocument: string;
  sourcePageRef: string;
  tolerancePercent: number;
  hitlThresholdPercent?: number;
  requiresAuditorJudgment?: boolean;
  judgmentNoteEn?: string;
  judgmentNoteVi?: string;
}

export interface SellerClaim {
  claimId: string;
  metricCode: string;
  metricNameEn: string;
  metricNameVi: string;
  category: ClaimCategory;
  sellerValue: number | null;
  unit: string;
  period: string;
  formulaNote?: string;
  sourceRef: string;
  sellerCommentaryEn?: string;
  sellerCommentaryVi?: string;
}

export interface HitlResolution {
  claimId: string;
  decision: 'Verified' | 'Mismatch';
  reviewerName: string;
  reviewerRole: string;
  note: string;
  resolvedAt: string;
}

export interface VerifiedClaimResult {
  claimId: string;
  metricCode: string;
  metricNameEn: string;
  metricNameVi: string;
  category: ClaimCategory;
  sellerValue: number | null;
  sellerUnit: string;
  sellerPeriod: string;
  sellerSourceRef: string;
  standardValue: number;
  standardUnit: string;
  standardPeriod: string;
  standardSource: string;
  varianceAbs: number | null;
  variancePct: number | null;
  autoStatus: VerificationStatus;
  finalStatus: VerificationStatus;
  reasonEn: string;
  reasonVi: string;
  faultType:
    | 'None'
    | 'Wrong Period'
    | 'Wrong Unit'
    | 'Wrong Value'
    | 'Formula Error'
    | 'Missing Source'
    | 'Auditor Judgment';
  rules: RuleCheckDetail[];
  hitlResolution: HitlResolution | null;
}

export interface EvidenceSummary {
  totalClaims: number;
  verifiedCount: number;
  mismatchCount: number;
  insufficientEvidenceCount: number;
  needsHumanReviewCount: number;
  overallVerdict: 'Approved' | 'Rejected' | 'Pending HITL';
}

export interface EvidenceReport {
  reportId: string;
  enterpriseName: string;
  ticker: string;
  exchange: string;
  statementType: string;
  reportingPeriod: string;
  sellerAgentId: string;
  buyerAgentId: string;
  generatedAt: string;
  summary: EvidenceSummary;
  reportHash: string;
  claims: VerifiedClaimResult[];
}

export interface FujiAnchorRecord {
  anchorId: string;
  reportId: string;
  reportHash: string;
  contractAddress: string;
  chainId: number;
  networkName: string;
  blockNumber: number;
  txHash: string;
  explorerUrl: string;
  overallVerdict: string;
  verifiedCount: number;
  totalClaims: number;
  anchoredAt: string;
  anchorMode: 'wallet-live' | 'fuji-rpc-recorded';
  rpcVerified: boolean;
}

export interface BuyerDecision {
  decision: 'Pending' | 'Accepted' | 'Revision Requested';
  buyerName: string;
  note: string;
  decidedAt: string | null;
}

export type ScenarioPresetId = 'faulty-demo' | 'clean-revised';

export interface WorkspaceState {
  scenarioId: ScenarioPresetId;
  enterprise: {
    name: string;
    ticker: string;
    exchange: string;
    statementType: string;
    reportingPeriod: string;
    auditor: string;
  };
  sellerAgentId: string;
  buyerAgentId: string;
  sellerClaims: SellerClaim[];
  groundTruth: GroundTruthItem[];
  evidenceReport: EvidenceReport | null;
  fujiAnchor: FujiAnchorRecord | null;
  anchorHistory: FujiAnchorRecord[];
  buyerDecision: BuyerDecision;
  lastUpdatedAt: string;
}

export type Language = 'en' | 'vi';
