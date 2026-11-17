import type {
  BlockchainRecord,
  EvidenceReport,
  EvidenceSummary,
  FinancialClaimInput,
  HumanReviewRecord,
  ReferenceMetric,
  ReportType,
  RuleCheckResult,
  ValidationRuleType,
  VerificationResultItem,
  VerificationStatus,
} from '../types/stockproof.ts';

export const VERIFICATION_ENGINE_VERSION = 'stockproof-engine-2.0';
export const DEFAULT_TOLERANCE_PERCENT = 0.5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quy đổi các đơn vị tiền tệ VND, Triệu VND và Tỷ VND về cùng một đơn vị chuẩn.
 */
export function normalizeFinancialValue(
  value: number,
  fromUnit: string,
  toUnit: string,
): { value: number; unitMatched: boolean; convertible: boolean } {
  const f = fromUnit.trim().toLowerCase();
  const t = toUnit.trim().toLowerCase();

  if (f === t) {
    return { value, unitMatched: true, convertible: true };
  }

  const vndFactor = (unitStr: string): number | null => {
    if (unitStr === 'vnd' || unitStr === 'đồng') return 1;
    if (
      unitStr === 'million vnd' ||
      unitStr === 'triệu vnd' ||
      unitStr === 'triệu đồng'
    ) {
      return 1e6;
    }
    if (
      unitStr === 'billion vnd' ||
      unitStr === 'tỷ vnd' ||
      unitStr === 'tỷ đồng'
    ) {
      return 1e9;
    }
    return null;
  };

  const fromFactor = vndFactor(f);
  const toFactor = vndFactor(t);

  if (fromFactor !== null && toFactor !== null) {
    return {
      value: (value * fromFactor) / toFactor,
      unitMatched: false,
      convertible: true,
    };
  }

  return { value, unitMatched: false, convertible: false };
}

/**
 * Tính toán lại công thức xác định (Quy tắc 5).
 */
export function recalculateFormula(ref: ReferenceMetric): number | null {
  const ops = ref.formula_operands;
  if (!ref.formula || !ops) return null;

  switch (ref.metric) {
    case 'Gross Profit':
    case 'Lợi nhuận gộp':
      return round2((ops['Revenue'] ?? 0) - (ops['Cost of Goods Sold'] ?? 0));
    case 'Total Liabilities':
    case 'Nợ phải trả':
      return round2((ops['Total Assets'] ?? 0) - (ops['Total Equity'] ?? 0));
    case 'Revenue Growth':
    case 'Tăng trưởng doanh thu': {
      const prev = ops['previous_revenue'] ?? 0;
      const curr = ops['current_revenue'] ?? 0;
      if (prev === 0) return null;
      return round2(((curr - prev) / prev) * 100);
    }
    case 'Gross Profit Margin':
    case 'Biên lợi nhuận gộp': {
      const rev = ops['Revenue'] ?? 0;
      const gp = ops['Gross Profit'] ?? 0;
      return rev ? round2((gp / rev) * 100) : null;
    }
    case 'Net Profit Margin':
    case 'Biên lợi nhuận ròng': {
      const rev = ops['Revenue'] ?? 0;
      const np = ops['Net Profit After Tax'] ?? 0;
      return rev ? round2((np / rev) * 100) : null;
    }
    case 'ROA': {
      const assets = ops['Average Total Assets'] ?? 0;
      const np = ops['Net Profit After Tax'] ?? 0;
      return assets ? round2((np / assets) * 100) : null;
    }
    case 'ROE': {
      const equity = ops['Average Total Equity'] ?? 0;
      const np = ops['Net Profit After Tax'] ?? 0;
      return equity ? round2((np / equity) * 100) : null;
    }
    case 'Debt-to-Equity':
    case 'Nợ trên Vốn chủ sở hữu': {
      const equity = ops['Total Equity'] ?? 0;
      const liab = ops['Total Liabilities'] ?? 0;
      return equity ? round2(liab / equity) : null;
    }
    default:
      return null;
  }
}

export function verifyClaimDeterministic(
  claim: FinancialClaimInput,
  referenceDataset: ReferenceMetric[],
  options?: {
    tolerancePercent?: number;
    expectedPeriod?: string;
    expectedReportType?: ReportType;
    humanReview?: HumanReviewRecord | null;
    timestamp?: string;
  },
): VerificationResultItem {
  const tolerance = options?.tolerancePercent ?? DEFAULT_TOLERANCE_PERCENT;
  const timestamp = options?.timestamp ?? new Date().toISOString();
  const ref = referenceDataset.find(
    (r) => r.metric.toLowerCase() === claim.metric.trim().toLowerCase(),
  );

  const rules: RuleCheckResult[] = [];
  const hasEvidence =
    Boolean(claim.source_document && claim.source_document.trim().length > 0) &&
    (claim.source_page !== null ||
      Boolean(claim.source_location && claim.source_location.trim().length > 0)) &&
    Boolean(claim.evidence && claim.evidence.trim().length > 0);

  // QUY TẮC 7: Kiểm tra nguồn & bằng chứng
  rules.push({
    rule: 'MISSING_EVIDENCE',
    label: 'Nguồn tài liệu & Bằng chứng',
    passed: hasEvidence,
    expected: ref
      ? `${ref.source_document} (Tr.${ref.source_page})`
      : 'Có tên tài liệu, số trang và trích dẫn bằng chứng',
    actual: hasEvidence
      ? `${claim.source_document} (Tr.${claim.source_page ?? '?'})`
      : 'Thiếu tài liệu nguồn hoặc số trang trích dẫn',
    detail: hasEvidence
      ? 'Đã cung cấp đầy đủ tài liệu nguồn và đoạn trích dẫn đối chiếu.'
      : 'Thiếu tên tài liệu nguồn, số trang hoặc đoạn trích dẫn bằng chứng.',
  });

  if (!ref) {
    return {
      claim_id: claim.claim_id,
      claim_type: claim.claim_type,
      metric: claim.metric,
      company: claim.company,
      period: claim.period,
      report_type: claim.report_type,
      reported_value: claim.reported_value,
      normalized_reported_value: claim.reported_value,
      reference_value: null,
      currency: claim.currency,
      unit: claim.unit,
      reference_unit: claim.unit,
      difference_abs: null,
      difference_pct: null,
      difference_label: 'N/A',
      validation_rule: 'MISSING_EVIDENCE',
      formula: claim.formula,
      recalculated_formula_value: null,
      source_document: claim.source_document,
      source_page: claim.source_page,
      source_location: claim.source_location,
      reference_source: 'Không tìm thấy chỉ tiêu trong bộ dữ liệu chuẩn',
      reference_page: null,
      evidence: claim.evidence,
      auto_status: 'INSUFFICIENT EVIDENCE',
      status: options?.humanReview?.decision ?? 'INSUFFICIENT EVIDENCE',
      verification_source: options?.humanReview
        ? 'HUMAN_APPROVED'
        : 'AUTOMATIC_ENGINE',
      explanation: `Không tìm thấy dữ liệu tham chiếu cho chỉ tiêu "${claim.metric}". Không thể xác minh khi thiếu dữ liệu gốc đáng tin cậy.`,
      rules,
      human_review: options?.humanReview ?? null,
      timestamp,
    };
  }

  const expectedPeriod = options?.expectedPeriod ?? ref.period;
  const expectedReportType = options?.expectedReportType ?? ref.report_type;

  // QUY TẮC 2: Kiểm tra kỳ báo cáo
  const periodMatch =
    claim.period.trim().toUpperCase() === expectedPeriod.trim().toUpperCase();
  rules.push({
    rule: 'PERIOD',
    label: 'Kỳ báo cáo',
    passed: periodMatch,
    expected: expectedPeriod,
    actual: claim.period || 'Chưa xác định',
    detail: periodMatch
      ? `Kỳ báo cáo khớp với ${expectedPeriod}.`
      : `Seller Agent báo cáo kỳ "${claim.period}", nhưng kỳ báo cáo cần đối chiếu là "${expectedPeriod}".`,
  });

  // QUY TẮC 4: Kiểm tra loại báo cáo
  const formatReportTypeVi = (rt: string) =>
    rt.trim().toLowerCase() === 'consolidated'
      ? 'Hợp nhất'
      : rt.trim().toLowerCase() === 'separate'
        ? 'Công ty mẹ'
        : rt;
  const reportTypeMatch =
    claim.report_type.trim().toLowerCase() ===
    expectedReportType.trim().toLowerCase();
  rules.push({
    rule: 'REPORT_TYPE',
    label: 'Phạm vi báo cáo',
    passed: reportTypeMatch,
    expected: formatReportTypeVi(expectedReportType),
    actual: formatReportTypeVi(claim.report_type),
    detail: reportTypeMatch
      ? `Phạm vi báo cáo khớp với ${formatReportTypeVi(expectedReportType)}.`
      : `Sai lệch phạm vi báo cáo: "${formatReportTypeVi(claim.report_type)}" so với "${formatReportTypeVi(expectedReportType)}".`,
  });

  // QUY TẮC 3: Kiểm tra & quy đổi đơn vị
  const norm =
    claim.reported_value !== null
      ? normalizeFinancialValue(claim.reported_value, claim.unit, ref.unit)
      : { value: 0, unitMatched: false, convertible: false };
  const unitValid = norm.unitMatched || norm.convertible;
  rules.push({
    rule: 'UNIT',
    label: 'Đơn vị tính & Quy đổi',
    passed: unitValid,
    warning: !norm.unitMatched && norm.convertible,
    expected: ref.unit,
    actual: claim.unit,
    detail: norm.unitMatched
      ? `Đơn vị khớp chuẩn (${ref.unit}).`
      : norm.convertible
        ? `Đã quy đổi đơn vị "${claim.unit}" sang "${ref.unit}" (${claim.reported_value} ${claim.unit} = ${round2(norm.value)} ${ref.unit}).`
        : `Đơn vị không tương thích "${claim.unit}" so với chuẩn "${ref.unit}".`,
  });

  // QUY TẮC 5: Tính toán lại công thức
  const recalculated = recalculateFormula(ref);
  let formulaPassed = true;
  if (recalculated !== null && claim.reported_value !== null) {
    const compareVal = norm.convertible ? norm.value : claim.reported_value;
    const formulaDiffPct =
      recalculated === 0
        ? Math.abs(compareVal) * 100
        : (Math.abs(compareVal - recalculated) / Math.abs(recalculated)) * 100;
    formulaPassed = unitValid && formulaDiffPct <= tolerance;
    rules.push({
      rule: 'FORMULA',
      label: 'Tính toán lại công thức',
      passed: formulaPassed,
      expected: `${ref.formula} = ${recalculated} ${ref.unit}`,
      actual: `${round2(compareVal)} ${ref.unit}`,
      detail: formulaPassed
        ? `Tính toán xác định theo công thức (${ref.formula}) khớp kết quả ${recalculated} ${ref.unit}.`
        : `Seller Agent báo cáo ${claim.reported_value} ${claim.unit}, nhưng tính toán lại từ BCTC gốc (${ref.formula}) cho kết quả ${recalculated} ${ref.unit}.`,
    });
  }

  // QUY TẮC 1: Kiểm tra độ chính xác số liệu
  const normalizedReported =
    claim.reported_value !== null && norm.convertible
      ? round2(norm.value)
      : claim.reported_value;
  const diffAbs =
    normalizedReported !== null
      ? round2(normalizedReported - ref.reference_value)
      : null;
  const diffPct =
    normalizedReported !== null && ref.reference_value !== 0
      ? round2(
          ((normalizedReported - ref.reference_value) /
            Math.abs(ref.reference_value)) *
            100,
        )
      : null;
  const absDiffPct = diffPct === null ? Infinity : Math.abs(diffPct);
  const numericalPassed =
    normalizedReported !== null && unitValid && absDiffPct <= tolerance;

  rules.push({
    rule: 'NUMERICAL',
    label: 'Độ chính xác số liệu',
    passed: numericalPassed,
    expected: `${ref.reference_value} ${ref.unit}`,
    actual:
      normalizedReported !== null
        ? `${normalizedReported} ${ref.unit}`
        : 'Thiếu giá trị',
    detail:
      normalizedReported === null
        ? 'Thiếu giá trị số liệu báo cáo.'
        : numericalPassed
          ? `Giá trị quy đổi ${normalizedReported} ${ref.unit} khớp với số liệu chuẩn ${ref.reference_value} ${ref.unit} (trong ngưỡng +/-${tolerance}%).`
          : `Giá trị Seller (${normalizedReported} ${ref.unit}) chênh lệch so với số liệu chuẩn (${ref.reference_value} ${ref.unit}) là ${diffPct}%.`,
  });

  // QUY TẮC 6 & 8: Kiểm tra tính mơ hồ & duyệt thủ công
  const requiresHuman = Boolean(
    claim.uncertain ||
      claim.claim_type === 'subjective_claim' ||
      ref.requires_human_review,
  );
  rules.push({
    rule: 'HUMAN_REVIEW',
    label: 'Kiểm tra tính mơ hồ & chủ quan',
    passed: !requiresHuman,
    warning: requiresHuman,
    expected: 'Chỉ tiêu khách quan, không xung đột',
    actual: requiresHuman ? 'Mơ hồ / Có xung đột thuyết minh' : 'Rõ ràng',
    detail: requiresHuman
      ? claim.ambiguous_reason ||
        ref.ambiguity_note ||
        'Nguồn tài liệu có điểm mơ hồ hoặc xung đột, cần kiểm toán viên rà soát thủ công.'
      : 'Không phát hiện điểm mơ hồ hay mâu thuẫn thuyết minh.',
  });

  // Xác định trạng thái tự động và quy tắc chính
  let autoStatus: VerificationStatus = 'VERIFIED';
  let primaryRule: ValidationRuleType = 'NUMERICAL';
  let explanation = `Đã xác minh khớp với ${ref.source_document} (Tr.${ref.source_page}, ${ref.source_location}).`;

  if (!hasEvidence || claim.reported_value === null) {
    autoStatus = 'INSUFFICIENT EVIDENCE';
    primaryRule = 'MISSING_EVIDENCE';
    explanation =
      claim.reported_value === null
        ? `Không thể xác minh ${claim.metric}: thiếu giá trị số liệu trích xuất.`
        : `Không thể xác minh ${claim.metric}: thiếu tài liệu nguồn, số trang hoặc đoạn trích dẫn bằng chứng.`;
  } else if (!periodMatch) {
    autoStatus = 'MISMATCH';
    primaryRule = 'PERIOD';
    explanation = `Seller Agent báo cáo ${claim.metric} cho kỳ "${claim.period}" (${claim.reported_value} ${claim.unit}), mâu thuẫn với kỳ đối chiếu chuẩn "${expectedPeriod}" (${ref.reference_value} ${ref.unit}).`;
  } else if (!reportTypeMatch) {
    autoStatus = 'MISMATCH';
    primaryRule = 'REPORT_TYPE';
    explanation = `Sai phạm vi báo cáo: chỉ tiêu trích dẫn "${claim.report_type}" thay vì "${expectedReportType}".`;
  } else if (!unitValid) {
    autoStatus = 'MISMATCH';
    primaryRule = 'UNIT';
    explanation = `Sai đơn vị tính: Seller báo cáo "${claim.unit}" không thể quy đổi về "${ref.unit}".`;
  } else if (requiresHuman) {
    autoStatus = 'NEEDS HUMAN REVIEW';
    primaryRule = 'HUMAN_REVIEW';
    explanation =
      claim.ambiguous_reason ||
      ref.ambiguity_note ||
      `Seller báo cáo ${normalizedReported} ${ref.unit} so với chuẩn ${ref.reference_value} ${ref.unit}; có thuyết minh mang tính chủ quan hoặc xung đột, cần kiểm toán viên duyệt.`;
  } else if (recalculated !== null && !formulaPassed) {
    autoStatus = 'MISMATCH';
    primaryRule = 'FORMULA';
    explanation = `Seller Agent báo cáo ${claim.metric} là ${claim.reported_value}${claim.unit === '%' ? '%' : ` ${claim.unit}`}, nhưng tính toán lại từ BCTC gốc (${ref.formula}) cho kết quả ${recalculated}${ref.unit === '%' ? '%' : ` ${ref.unit}`}.`;
  } else if (!numericalPassed) {
    autoStatus = 'MISMATCH';
    primaryRule = 'NUMERICAL';
    explanation = `Sai lệch số liệu: Seller báo cáo ${normalizedReported} ${ref.unit} so với số liệu chuẩn ${ref.reference_value} ${ref.unit} (lệch ${diffPct}%).`;
  } else if (!norm.unitMatched && norm.convertible) {
    explanation = `Đã xác minh sau khi quy đổi đơn vị: ${claim.reported_value.toLocaleString('en-US')} ${claim.unit} tương đương ${normalizedReported} ${ref.unit}, khớp với ${ref.source_document} (Tr.${ref.source_page}).`;
  }

  const finalStatus: VerificationStatus = options?.humanReview
    ? options.humanReview.decision
    : autoStatus;

  const verificationSource: VerificationResultItem['verification_source'] =
    options?.humanReview ? 'HUMAN_APPROVED' : 'AUTOMATIC_ENGINE';

  if (options?.humanReview) {
    explanation = `Kiểm toán viên duyệt (${options.humanReview.decision}) bởi ${options.humanReview.reviewer_name}: ${options.humanReview.comment}`;
  }

  const differenceLabel =
    diffAbs === null
      ? 'N/A'
      : diffAbs === 0
        ? '0'
        : `${diffAbs > 0 ? '+' : ''}${diffAbs} ${ref.unit} (${diffPct !== null && diffPct > 0 ? '+' : ''}${diffPct}%)`;

  return {
    claim_id: claim.claim_id,
    claim_type: claim.claim_type,
    metric: claim.metric,
    company: claim.company,
    period: claim.period,
    report_type: claim.report_type,
    reported_value: claim.reported_value,
    normalized_reported_value: normalizedReported,
    reference_value: ref.reference_value,
    currency: claim.currency,
    unit: claim.unit,
    reference_unit: ref.unit,
    difference_abs: diffAbs,
    difference_pct: diffPct,
    difference_label: differenceLabel,
    validation_rule: primaryRule,
    formula: ref.formula ?? claim.formula,
    recalculated_formula_value: recalculated,
    source_document: claim.source_document,
    source_page: claim.source_page,
    source_location: claim.source_location,
    reference_source: `${ref.source_document} (${ref.source_location})`,
    reference_page: ref.source_page,
    evidence: claim.evidence,
    auto_status: autoStatus,
    status: finalStatus,
    verification_source: verificationSource,
    explanation,
    rules,
    human_review: options?.humanReview ?? null,
    timestamp,
  };
}

export function summarizeVerificationResults(
  items: VerificationResultItem[],
): EvidenceSummary {
  const verified = items.filter((i) => i.status === 'VERIFIED').length;
  const mismatch = items.filter((i) => i.status === 'MISMATCH').length;
  const insufficient_evidence = items.filter(
    (i) => i.status === 'INSUFFICIENT EVIDENCE',
  ).length;
  const needs_human_review = items.filter(
    (i) => i.status === 'NEEDS HUMAN REVIEW',
  ).length;

  let overall_status: EvidenceSummary['overall_status'] = 'VERIFIED';
  if (needs_human_review > 0) {
    overall_status = 'PENDING_REVIEW';
  } else if (mismatch > 0 || insufficient_evidence > 0) {
    overall_status = 'PARTIAL_MISMATCH';
  }

  return {
    total_claims: items.length,
    verified,
    mismatch,
    insufficient_evidence,
    needs_human_review,
    overall_status,
  };
}

export async function computeSha256Hex(
  input: string | Uint8Array,
): Promise<string> {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
    const out = new Uint8Array(digest);
    return (
      '0x' +
      Array.from(out)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }
  const nodeCrypto = await import('node:crypto');
  return '0x' + nodeCrypto.createHash('sha256').update(bytes).digest('hex');
}

export async function buildEvidenceReport(params: {
  report_id: string;
  company: string;
  ticker: string;
  exchange: string;
  reporting_period: string;
  report_type: ReportType;
  document_hash: string;
  tolerance_percent: number;
  claims: FinancialClaimInput[];
  reference_dataset: ReferenceMetric[];
  human_reviews?: HumanReviewRecord[];
  blockchain_record?: BlockchainRecord | null;
  is_demo_data: boolean;
  timestamp?: string;
}): Promise<{
  results: VerificationResultItem[];
  evidenceReport: EvidenceReport;
}> {
  const ts = params.timestamp ?? new Date().toISOString();
  const reviewMap = new Map<string, HumanReviewRecord>();
  for (const rev of params.human_reviews ?? []) {
    reviewMap.set(rev.claim_id, rev);
  }

  const results = params.claims.map((claim) =>
    verifyClaimDeterministic(claim, params.reference_dataset, {
      tolerancePercent: params.tolerance_percent,
      expectedPeriod: params.reporting_period,
      expectedReportType: params.report_type,
      humanReview: reviewMap.get(claim.claim_id) ?? null,
      timestamp: ts,
    }),
  );

  const summary = summarizeVerificationResults(results);
  const canonicalPayload = JSON.stringify({
    report_id: params.report_id,
    company: params.company,
    ticker: params.ticker,
    reporting_period: params.reporting_period,
    document_hash: params.document_hash,
    engine_version: VERIFICATION_ENGINE_VERSION,
    summary,
    claims: results.map((r) => ({
      claim_id: r.claim_id,
      metric: r.metric,
      reported_value: r.reported_value,
      reference_value: r.reference_value,
      status: r.status,
      verification_source: r.verification_source,
    })),
  });

  const evidence_hash = await computeSha256Hex(canonicalPayload);

  return {
    results,
    evidenceReport: {
      report_id: params.report_id,
      company: params.company,
      ticker: params.ticker,
      exchange: params.exchange,
      reporting_period: params.reporting_period,
      report_type: params.report_type,
      document_hash: params.document_hash,
      evidence_hash,
      verification_timestamp: ts,
      verification_engine_version: VERIFICATION_ENGINE_VERSION,
      tolerance_percent: params.tolerance_percent,
      summary,
      claims: results,
      human_reviews: params.human_reviews ?? [],
      blockchain_record: params.blockchain_record ?? null,
      is_demo_data: params.is_demo_data,
    },
  };
}
