import type {
  BuyerDecision,
  EvidenceReport,
  EvidenceSummary,
  GroundTruthItem,
  HitlResolution,
  RuleCheckDetail,
  SellerClaim,
  VerificationStatus,
  VerifiedClaimResult,
} from '../types/stockproof.ts';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function evaluateFormula(truth: GroundTruthItem): number | null {
  const ops = truth.formulaOperands;
  if (!ops || !truth.formulaExpression) return null;

  switch (truth.metricCode) {
    case 'GROSS_PROFIT':
      return round2((ops.NET_REVENUE ?? 0) - (ops.COGS ?? 0));
    case 'GROSS_MARGIN':
      return ops.NET_REVENUE
        ? round2(((ops.GROSS_PROFIT ?? 0) / ops.NET_REVENUE) * 100)
        : null;
    case 'TOTAL_LIABILITIES':
      return round2((ops.TOTAL_ASSETS ?? 0) - (ops.TOTAL_EQUITY ?? 0));
    case 'DEBT_TO_EQUITY':
      return ops.TOTAL_EQUITY
        ? round2((ops.TOTAL_LIABILITIES ?? 0) / ops.TOTAL_EQUITY)
        : null;
    default:
      return null;
  }
}

export function verifySingleClaim(
  claim: SellerClaim,
  truth: GroundTruthItem,
  existingHitl: HitlResolution | null = null,
): VerifiedClaimResult {
  const rules: RuleCheckDetail[] = [];

  // 1. Source / Evidence Rule
  const hasSource = Boolean(claim.sourceRef && claim.sourceRef.trim().length >= 5);
  rules.push({
    rule: 'Source',
    outcome: hasSource ? 'pass' : 'fail',
    expected: `${truth.sourceDocument} (${truth.sourcePageRef})`,
    actual: hasSource ? claim.sourceRef.trim() : 'Missing / Empty citation',
    messageEn: hasSource
      ? 'Verifiable source citation provided.'
      : 'No verifiable source document or page reference provided.',
    messageVi: hasSource
      ? 'Có nguồn dẫn chứng đối chiếu hợp lệ.'
      : 'Thiếu nguồn dẫn chứng hoặc mã tham chiếu tài liệu.',
  });

  // 2. Reporting Period Rule
  const periodMatches =
    claim.period.trim().toUpperCase() === truth.period.trim().toUpperCase();
  rules.push({
    rule: 'Period',
    outcome: periodMatches ? 'pass' : 'fail',
    expected: truth.period,
    actual: claim.period || 'Unspecified',
    messageEn: periodMatches
      ? `Reporting period matches ${truth.period}.`
      : `Period mismatch: Seller submitted ${claim.period || 'empty'} instead of ${truth.period}.`,
    messageVi: periodMatches
      ? `Kỳ báo cáo khớp chuẩn ${truth.period}.`
      : `Sai kỳ báo cáo: Seller nộp kỳ ${claim.period || 'trống'} thay vì ${truth.period}.`,
  });

  // 3. Unit Rule
  const unitMatches =
    claim.unit.trim().toLowerCase() === truth.unit.trim().toLowerCase();
  rules.push({
    rule: 'Unit',
    outcome: unitMatches ? 'pass' : 'fail',
    expected: truth.unit,
    actual: claim.unit || 'Unspecified',
    messageEn: unitMatches
      ? `Unit matches standard (${truth.unit}).`
      : `Unit mismatch: Seller used "${claim.unit}" instead of "${truth.unit}".`,
    messageVi: unitMatches
      ? `Đơn vị tính khớp chuẩn (${truth.unit}).`
      : `Sai đơn vị tính: Seller dùng "${claim.unit}" thay vì "${truth.unit}".`,
  });

  // 4. Formula Check (if applicable)
  const formulaExpected = evaluateFormula(truth);
  let formulaMatches = true;
  if (formulaExpected !== null && claim.sellerValue !== null) {
    const formulaDiffPct =
      formulaExpected === 0
        ? Math.abs(claim.sellerValue) * 100
        : (Math.abs(claim.sellerValue - formulaExpected) /
            Math.abs(formulaExpected)) *
          100;
    formulaMatches = unitMatches && formulaDiffPct <= truth.tolerancePercent;
    rules.push({
      rule: 'Formula',
      outcome: formulaMatches ? 'pass' : 'fail',
      expected: `${truth.formulaExpression} = ${formulaExpected} ${truth.unit}`,
      actual: `${claim.sellerValue} ${claim.unit}`,
      messageEn: formulaMatches
        ? `Formula check passed (${truth.formulaExpression}).`
        : `Formula check failed: ${truth.formulaExpression} yields ${formulaExpected} ${truth.unit}.`,
      messageVi: formulaMatches
        ? `Công thức hợp lệ (${truth.formulaExpression}).`
        : `Sai công thức: ${truth.formulaExpression} cho kết quả ${formulaExpected} ${truth.unit}.`,
    });
  } else {
    rules.push({
      rule: 'Formula',
      outcome: 'skip',
      expected: 'Direct line-item (no derived formula)',
      actual: claim.formulaNote || 'Direct figure',
      messageEn: 'Direct audited ledger item; no derived formula required.',
      messageVi: 'Chỉ tiêu trực tiếp trên BCTC; không cần công thức phái sinh.',
    });
  }

  // 5. Numeric Value Check
  const sellerNum = claim.sellerValue;
  const varianceAbs =
    sellerNum === null ? null : round2(sellerNum - truth.standardValue);
  const variancePct =
    sellerNum === null || truth.standardValue === 0
      ? null
      : round2(((sellerNum - truth.standardValue) / truth.standardValue) * 100);
  const absVariancePct = variancePct === null ? Infinity : Math.abs(variancePct);

  const valueMatches =
    sellerNum !== null && absVariancePct <= truth.tolerancePercent;
  const withinHitlBand =
    Boolean(truth.requiresAuditorJudgment) &&
    sellerNum !== null &&
    absVariancePct > truth.tolerancePercent &&
    absVariancePct <= (truth.hitlThresholdPercent ?? 3.0);

  rules.push({
    rule: 'Value',
    outcome:
      sellerNum === null
        ? 'fail'
        : valueMatches
          ? 'pass'
          : withinHitlBand
            ? 'warn'
            : 'fail',
    expected: `${truth.standardValue} ${truth.unit}`,
    actual: sellerNum === null ? 'Missing' : `${sellerNum} ${claim.unit}`,
    messageEn:
      sellerNum === null
        ? 'Seller value is missing.'
        : valueMatches
          ? `Value matches ground truth within ${truth.tolerancePercent}% tolerance.`
          : withinHitlBand
            ? `Value deviates by ${variancePct}% (within judgment review band <= ${truth.hitlThresholdPercent}%).`
            : `Value deviates by ${variancePct}% (exceeds ${truth.tolerancePercent}% tolerance).`,
    messageVi:
      sellerNum === null
        ? 'Thiếu giá trị từ Seller.'
        : valueMatches
          ? `Số liệu khớp giá trị chuẩn (sai số trong ngưỡng ${truth.tolerancePercent}%).`
          : withinHitlBand
            ? `Chênh lệch ${variancePct}% nằm trong vùng cần người duyệt (<= ${truth.hitlThresholdPercent}%).`
            : `Sai lệch số liệu ${variancePct}% (vượt ngưỡng ${truth.tolerancePercent}%).`,
  });

  // Determine deterministic status & fault classification
  let autoStatus: VerificationStatus = 'Verified';
  let faultType: VerifiedClaimResult['faultType'] = 'None';
  let reasonEn = `Verified against ${truth.sourceDocument} (${truth.sourcePageRef}).`;
  let reasonVi = `Khớp dữ liệu chuẩn từ ${truth.sourceDocument} (${truth.sourcePageRef}).`;

  if (!hasSource || sellerNum === null) {
    autoStatus = 'Insufficient Evidence';
    faultType = 'Missing Source';
    reasonEn =
      sellerNum === null
        ? 'Missing Seller numeric value; cannot verify claim.'
        : 'Missing source citation or document reference; insufficient evidence to verify.';
    reasonVi =
      sellerNum === null
        ? 'Thiếu giá trị số liệu từ Seller nên không thể xác minh.'
        : 'Thiếu nguồn dẫn chứng đối chiếu (Insufficient Evidence).';
  } else if (!periodMatches) {
    autoStatus = 'Mismatch';
    faultType = 'Wrong Period';
    reasonEn = `Reporting period mismatch: Seller reported "${claim.period}" while standard scope is "${truth.period}".`;
    reasonVi = `Sai kỳ báo cáo: Seller nộp kỳ "${claim.period}", kỳ chuẩn là "${truth.period}".`;
  } else if (!unitMatches) {
    autoStatus = 'Mismatch';
    faultType = 'Wrong Unit';
    reasonEn = `Unit mismatch: Seller reported in "${claim.unit}" instead of "${truth.unit}", causing scale discrepancy.`;
    reasonVi = `Sai đơn vị tính: Seller dùng "${claim.unit}" thay vì "${truth.unit}".`;
  } else if (truth.requiresAuditorJudgment && (withinHitlBand || !valueMatches)) {
    if (withinHitlBand) {
      autoStatus = 'Needs Human Review';
      faultType = 'Auditor Judgment';
      reasonEn =
        truth.judgmentNoteEn ||
        'Non-standard management adjustment requires Human-in-the-Loop (HITL) auditor approval.';
      reasonVi =
        truth.judgmentNoteVi ||
        'Khoản điều chỉnh quản trị cần kiểm toán viên duyệt thủ công (HITL).';
    } else {
      autoStatus = 'Mismatch';
      faultType = 'Wrong Value';
      reasonEn = `Reported ${sellerNum} ${claim.unit} vs standard ${truth.standardValue} ${truth.unit} (${variancePct}% variance).`;
      reasonVi = `Seller báo cáo ${sellerNum} ${claim.unit}, giá trị chuẩn ${truth.standardValue} ${truth.unit} (lệch ${variancePct}%).`;
    }
  } else if (formulaExpected !== null && !formulaMatches) {
    autoStatus = 'Mismatch';
    faultType = 'Formula Error';
    reasonEn = `Formula verification failed (${truth.formulaExpression} = ${formulaExpected} ${truth.unit}, Seller reported ${sellerNum} ${claim.unit}).`;
    reasonVi = `Sai công thức chỉ tiêu (${truth.formulaExpression} = ${formulaExpected} ${truth.unit}, Seller nộp ${sellerNum} ${claim.unit}).`;
  } else if (!valueMatches) {
    autoStatus = 'Mismatch';
    faultType = 'Wrong Value';
    reasonEn = `Numeric mismatch: Seller reported ${sellerNum} ${claim.unit} vs standard ${truth.standardValue} ${truth.unit} (${variancePct}% variance).`;
    reasonVi = `Sai số liệu: Seller nộp ${sellerNum} ${claim.unit} so với chuẩn ${truth.standardValue} ${truth.unit} (lệch ${variancePct}%).`;
  }

  const finalStatus: VerificationStatus =
    autoStatus === 'Needs Human Review' && existingHitl
      ? existingHitl.decision
      : autoStatus;

  if (autoStatus === 'Needs Human Review' && existingHitl) {
    reasonEn = `HITL Resolved (${existingHitl.decision}) by ${existingHitl.reviewerName}: ${existingHitl.note}`;
    reasonVi = `HITL đã duyệt (${existingHitl.decision}) bởi ${existingHitl.reviewerName}: ${existingHitl.note}`;
  }

  return {
    claimId: claim.claimId,
    metricCode: claim.metricCode,
    metricNameEn: truth.metricNameEn,
    metricNameVi: truth.metricNameVi,
    category: truth.category,
    sellerValue: sellerNum,
    sellerUnit: claim.unit,
    sellerPeriod: claim.period,
    sellerSourceRef: claim.sourceRef,
    standardValue: truth.standardValue,
    standardUnit: truth.unit,
    standardPeriod: truth.period,
    standardSource: `${truth.sourceDocument} (${truth.sourcePageRef})`,
    varianceAbs,
    variancePct,
    autoStatus,
    finalStatus,
    reasonEn,
    reasonVi,
    faultType,
    rules,
    hitlResolution: autoStatus === 'Needs Human Review' ? existingHitl : null,
  };
}

export function summarizeClaims(claims: VerifiedClaimResult[]): EvidenceSummary {
  const verifiedCount = claims.filter((c) => c.finalStatus === 'Verified').length;
  const mismatchCount = claims.filter((c) => c.finalStatus === 'Mismatch').length;
  const insufficientEvidenceCount = claims.filter(
    (c) => c.finalStatus === 'Insufficient Evidence',
  ).length;
  const needsHumanReviewCount = claims.filter(
    (c) => c.finalStatus === 'Needs Human Review',
  ).length;

  let overallVerdict: EvidenceSummary['overallVerdict'] = 'Approved';
  if (needsHumanReviewCount > 0) {
    overallVerdict = 'Pending HITL';
  } else if (mismatchCount > 0 || insufficientEvidenceCount > 0) {
    overallVerdict = 'Rejected';
  }

  return {
    totalClaims: claims.length,
    verifiedCount,
    mismatchCount,
    insufficientEvidenceCount,
    needsHumanReviewCount,
    overallVerdict,
  };
}

export function canonicalizeReportPayload(params: {
  enterpriseName: string;
  ticker: string;
  reportingPeriod: string;
  sellerAgentId: string;
  buyerAgentId: string;
  claims: VerifiedClaimResult[];
  summary: EvidenceSummary;
}): string {
  const canonicalClaims = params.claims.map((c) => ({
    claimId: c.claimId,
    metricCode: c.metricCode,
    sellerValue: c.sellerValue,
    sellerUnit: c.sellerUnit,
    sellerPeriod: c.sellerPeriod,
    standardValue: c.standardValue,
    autoStatus: c.autoStatus,
    finalStatus: c.finalStatus,
    faultType: c.faultType,
    hitl: c.hitlResolution
      ? {
          decision: c.hitlResolution.decision,
          reviewerName: c.hitlResolution.reviewerName,
          note: c.hitlResolution.note,
        }
      : null,
  }));

  return JSON.stringify({
    enterpriseName: params.enterpriseName,
    ticker: params.ticker,
    reportingPeriod: params.reportingPeriod,
    sellerAgentId: params.sellerAgentId,
    buyerAgentId: params.buyerAgentId,
    summary: params.summary,
    claims: canonicalClaims,
  });
}

export async function computeSha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const bytes = new Uint8Array(digest);
    return (
      '0x' +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }
  const nodeCrypto = await import('node:crypto');
  return '0x' + nodeCrypto.createHash('sha256').update(input).digest('hex');
}

export async function runVerificationEngine(params: {
  reportId: string;
  enterpriseName: string;
  ticker: string;
  exchange: string;
  statementType: string;
  reportingPeriod: string;
  sellerAgentId: string;
  buyerAgentId: string;
  sellerClaims: SellerClaim[];
  groundTruth: GroundTruthItem[];
  hitlMap?: Record<string, HitlResolution>;
  generatedAt?: string;
}): Promise<EvidenceReport> {
  const truthByCode = new Map(params.groundTruth.map((g) => [g.metricCode, g]));
  const verifiedClaims: VerifiedClaimResult[] = [];

  for (const claim of params.sellerClaims) {
    const truth = truthByCode.get(claim.metricCode);
    if (!truth) continue;
    const hitl = params.hitlMap?.[claim.claimId] ?? null;
    verifiedClaims.push(verifySingleClaim(claim, truth, hitl));
  }

  const summary = summarizeClaims(verifiedClaims);
  const canonical = canonicalizeReportPayload({
    enterpriseName: params.enterpriseName,
    ticker: params.ticker,
    reportingPeriod: params.reportingPeriod,
    sellerAgentId: params.sellerAgentId,
    buyerAgentId: params.buyerAgentId,
    claims: verifiedClaims,
    summary,
  });
  const reportHash = await computeSha256Hex(canonical);

  return {
    reportId: params.reportId,
    enterpriseName: params.enterpriseName,
    ticker: params.ticker,
    exchange: params.exchange,
    statementType: params.statementType,
    reportingPeriod: params.reportingPeriod,
    sellerAgentId: params.sellerAgentId,
    buyerAgentId: params.buyerAgentId,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    summary,
    reportHash,
    claims: verifiedClaims,
  };
}

export function canAcceptBuyerReport(
  report: EvidenceReport | null,
): { allowed: boolean; reasonEn: string; reasonVi: string } {
  if (!report) {
    return {
      allowed: false,
      reasonEn: 'Run verification engine before recording buyer decision.',
      reasonVi: 'Cần chạy Verification Engine trước khi ra quyết định.',
    };
  }
  if (report.summary.needsHumanReviewCount > 0) {
    return {
      allowed: false,
      reasonEn:
        'Complete all pending Human-in-the-Loop (HITL) reviews before accepting.',
      reasonVi:
        'Cần hoàn tất bước duyệt thủ công (HITL) trước khi chấp nhận báo cáo.',
    };
  }
  if (
    report.summary.mismatchCount > 0 ||
    report.summary.insufficientEvidenceCount > 0
  ) {
    return {
      allowed: false,
      reasonEn:
        'Unresolved mismatches or missing evidence found; request revision from Seller Agent.',
      reasonVi:
        'Phát hiện sai lệch hoặc thiếu dẫn chứng; cần yêu cầu Seller sửa báo cáo.',
    };
  }
  return {
    allowed: true,
    reasonEn: 'All 10 claims verified; report is eligible for Buyer acceptance.',
    reasonVi: 'Toàn bộ 10 claims đã xác minh hợp lệ; đủ điều kiện chấp nhận.',
  };
}

export function formatBuyerDecisionSummary(decision: BuyerDecision): string {
  if (decision.decision === 'Pending') return 'Awaiting Buyer Decision';
  return `${decision.decision} by ${decision.buyerName}`;
}
