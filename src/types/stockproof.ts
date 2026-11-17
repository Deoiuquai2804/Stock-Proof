export type VerificationStatus =
  | 'VERIFIED'
  | 'MISMATCH'
  | 'INSUFFICIENT EVIDENCE'
  | 'NEEDS HUMAN REVIEW';

export type ClaimReviewState =
  | VerificationStatus
  | 'PENDING';

export type FinancialUnit = 'VND' | 'Million VND' | 'Billion VND' | '%' | 'x';

export type ReportType = 'Consolidated' | 'Separate';

export type ValidationRuleType =
  | 'NUMERICAL'
  | 'PERIOD'
  | 'UNIT'
  | 'REPORT_TYPE'
  | 'FORMULA'
  | 'EVIDENCE'
  | 'MISSING_EVIDENCE'
  | 'HUMAN_REVIEW';

export interface FinancialClaimInput {
  claim_id: string;
  claim_type: 'financial_metric' | 'financial_ratio' | 'subjective_claim';
  metric: string;
  company: string;
  period: string;
  report_type: ReportType;
  reported_value: number | null;
  currency: string;
  unit: string;
  formula: string | null;
  source_document: string;
  source_page: number | null;
  source_location: string;
  evidence: string;
  verification_status: ClaimReviewState;
  uncertain?: boolean;
  ambiguous_reason?: string;
}

export interface ReferenceMetric {
  metric: string;
  company: string;
  ticker: string;
  exchange: string;
  period: string;
  report_type: ReportType;
  reference_value: number;
  currency: string;
  unit: string;
  formula: string | null;
  formula_operands?: Record<string, number>;
  source_document: string;
  source_page: number;
  source_location: string;
  requires_human_review?: boolean;
  ambiguity_note?: string;
}

export interface RuleCheckResult {
  rule: ValidationRuleType;
  label: string;
  passed: boolean;
  warning?: boolean;
  expected: string;
  actual: string;
  detail: string;
}

export interface HumanReviewRecord {
  id: string;
  claim_id: string;
  reviewer_id: string;
  reviewer_name: string;
  decision: 'VERIFIED' | 'MISMATCH' | 'INSUFFICIENT EVIDENCE';
  comment: string;
  previous_value: number | null;
  updated_value: number | null;
  created_at: string;
}

export interface VerificationResultItem {
  claim_id: string;
  claim_type: FinancialClaimInput['claim_type'];
  metric: string;
  company: string;
  period: string;
  report_type: ReportType;
  reported_value: number | null;
  normalized_reported_value: number | null;
  reference_value: number | null;
  currency: string;
  unit: string;
  reference_unit: string;
  difference_abs: number | null;
  difference_pct: number | null;
  difference_label: string;
  validation_rule: ValidationRuleType;
  formula: string | null;
  recalculated_formula_value: number | null;
  source_document: string;
  source_page: number | null;
  source_location: string;
  reference_source: string;
  reference_page: number | null;
  evidence: string;
  auto_status: VerificationStatus;
  status: VerificationStatus;
  verification_source: 'AUTOMATIC_ENGINE' | 'HUMAN_APPROVED';
  explanation: string;
  rules: RuleCheckResult[];
  human_review: HumanReviewRecord | null;
  timestamp: string;
}

export interface EvidenceSummary {
  total_claims: number;
  verified: number;
  mismatch: number;
  insufficient_evidence: number;
  needs_human_review: number;
  overall_status: 'VERIFIED' | 'PARTIAL_MISMATCH' | 'PENDING_REVIEW';
}

export interface EvidenceReport {
  report_id: string;
  company: string;
  ticker: string;
  exchange: string;
  reporting_period: string;
  report_type: ReportType;
  document_hash: string;
  evidence_hash: string;
  verification_timestamp: string;
  verification_engine_version: string;
  tolerance_percent: number;
  summary: EvidenceSummary;
  claims: VerificationResultItem[];
  human_reviews: HumanReviewRecord[];
  blockchain_record: BlockchainRecord | null;
  is_demo_data: boolean;
}

export interface BlockchainRecord {
  id: string;
  report_id: string;
  report_hash: string;
  evidence_hash: string;
  verification_status: string;
  version: number;
  transaction_hash: string;
  contract_address: string;
  network: string;
  chain_id: number;
  block_number: number;
  explorer_url: string | null;
  mode: 'LIVE_FUJI_WALLET' | 'DEMO_SIMULATION';
  created_at: string;
}

export interface ReportRecord {
  id: string;
  company_name: string;
  ticker: string;
  exchange: string;
  original_filename: string;
  file_size: number;
  file_type: string;
  document_hash: string;
  reporting_period: string;
  report_type: ReportType;
  fiscal_year: string;
  currency: string;
  unit: string;
  storage_path: string;
  status: 'EXTRACTED' | 'VERIFIED' | 'MISMATCH' | 'PENDING_REVIEW';
  buyer_decision: 'Pending' | 'Accepted' | 'Revision Requested';
  buyer_note: string;
  is_demo_data: boolean;
  created_at: string;
  extracted_claims: FinancialClaimInput[];
  verification_results: VerificationResultItem[];
  evidence_report: EvidenceReport | null;
  blockchain_record: BlockchainRecord | null;
  human_reviews: HumanReviewRecord[];
}

export interface ActivityEvent {
  id: string;
  report_id: string;
  title: string;
  description: string;
  status: 'info' | 'verified' | 'warning' | 'error';
  timestamp: string;
}

export interface BlockchainNetworkStatus {
  network: string;
  chain_id: number;
  connected: boolean;
  rpc_url: string;
  contract_address: string;
  block_number: number | null;
  explorer_base_url: string;
  mode_label: string;
}

export interface WorkspacePayload {
  active_report_id: string;
  tolerance_percent: number;
  reports: ReportRecord[];
  reference_dataset: ReferenceMetric[];
  activities: ActivityEvent[];
  blockchain_records: BlockchainRecord[];
  blockchain_status: BlockchainNetworkStatus;
  persistence_mode: 'POSTGRES_CLOUDSQL' | 'LOCAL_DEMO_PERSISTENCE';
}
