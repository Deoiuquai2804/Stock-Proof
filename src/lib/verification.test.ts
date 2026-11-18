import test from 'node:test';
import assert from 'node:assert/strict';
import type { FinancialClaimInput, ReferenceMetric } from '../types/stockproof.ts';
import {
  buildEvidenceReport,
  normalizeFinancialValue,
  verifyClaimDeterministic,
} from './verification.ts';

const TEST_COMPANY = 'Công ty Cổ phần Kiểm thử Alpha';

const TEST_REFERENCE_DATASET: ReferenceMetric[] = [
  {
    metric: 'Doanh thu thuần',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    period: 'FY2025',
    report_type: 'Consolidated',
    reference_value: 62849,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 7,
    source_location: 'Báo cáo KQKD hợp nhất - Mã số 10',
  },
  {
    metric: 'Lợi nhuận thuần từ HĐKD',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    period: 'FY2025',
    report_type: 'Consolidated',
    reference_value: 10820,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 8,
    source_location: 'Báo cáo KQKD hợp nhất - Mã số 30',
    requires_human_review: true,
    ambiguity_note: 'Cần kiểm toán viên rà soát phân loại lại chênh lệch tỷ giá.',
  },
  {
    metric: 'Lợi nhuận sau thuế',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    period: 'FY2025',
    report_type: 'Consolidated',
    reference_value: 7857,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 8,
    source_location: 'Báo cáo KQKD hợp nhất - Mã số 60',
  },
  {
    metric: 'Nợ phải trả',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    period: 'FY2025',
    report_type: 'Consolidated',
    reference_value: 36218,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: 'Tổng tài sản - Vốn chủ sở hữu',
    formula_operands: {
      'Total Assets': 72003,
      'Total Equity': 35785,
    },
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 5,
    source_location: 'Bảng cân đối kế toán hợp nhất - Mã số 300',
  },
  {
    metric: 'Vốn chủ sở hữu',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    period: 'FY2025',
    report_type: 'Consolidated',
    reference_value: 35785,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 6,
    source_location: 'Bảng cân đối kế toán hợp nhất - Mã số 400',
  },
  {
    metric: 'Tăng trưởng doanh thu',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    period: 'FY2025',
    report_type: 'Consolidated',
    reference_value: 12.3,
    currency: '%',
    unit: '%',
    formula: '(Doanh thu kỳ này - Doanh thu kỳ trước) / Doanh thu kỳ trước * 100',
    formula_operands: {
      current_revenue: 62849,
      previous_revenue: 55965,
    },
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 7,
    source_location: 'Báo cáo KQKD hợp nhất - So sánh cùng kỳ',
  },
];

const TEST_CLAIMS: FinancialClaimInput[] = [
  {
    claim_id: 'CLM-001',
    claim_type: 'financial_metric',
    metric: 'Doanh thu thuần',
    company: TEST_COMPANY,
    period: 'FY2025',
    report_type: 'Consolidated',
    reported_value: 62849,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 7,
    source_location: 'Mã số 10',
    evidence: 'Doanh thu thuần: 62.849 tỷ VND.',
    verification_status: 'PENDING',
  },
  {
    claim_id: 'CLM-004',
    claim_type: 'subjective_claim',
    metric: 'Lợi nhuận thuần từ HĐKD',
    company: TEST_COMPANY,
    period: 'FY2025',
    report_type: 'Consolidated',
    reported_value: 11045,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 8,
    source_location: 'Thuyết minh V.24',
    evidence: 'Điều chỉnh chênh lệch tỷ giá chưa thực hiện.',
    verification_status: 'PENDING',
    uncertain: true,
  },
  {
    claim_id: 'CLM-005',
    claim_type: 'financial_metric',
    metric: 'Lợi nhuận sau thuế',
    company: TEST_COMPANY,
    period: 'FY2025',
    report_type: 'Consolidated',
    reported_value: 7857000,
    currency: 'VND',
    unit: 'Triệu VND',
    formula: null,
    source_document: 'ALP_BCTC_HopNhat_FY2025.pdf',
    source_page: 8,
    source_location: 'Mã số 60',
    evidence: 'Lợi nhuận sau thuế: 7.857.000 Triệu VND.',
    verification_status: 'PENDING',
  },
  {
    claim_id: 'CLM-007',
    claim_type: 'financial_metric',
    metric: 'Nợ phải trả',
    company: TEST_COMPANY,
    period: 'FY2025',
    report_type: 'Consolidated',
    reported_value: 36218,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: '',
    source_page: null,
    source_location: '',
    evidence: '',
    verification_status: 'PENDING',
  },
  {
    claim_id: 'CLM-008',
    claim_type: 'financial_metric',
    metric: 'Vốn chủ sở hữu',
    company: TEST_COMPANY,
    period: 'Q3/2025',
    report_type: 'Consolidated',
    reported_value: 29930,
    currency: 'VND',
    unit: 'Tỷ VND',
    formula: null,
    source_document: 'ALP_BCTC_Q3_2025.pdf',
    source_page: 6,
    source_location: 'Mã số 400',
    evidence: 'Vốn chủ sở hữu Q3/2025: 29.930 tỷ VND.',
    verification_status: 'PENDING',
  },
  {
    claim_id: 'CLM-010',
    claim_type: 'financial_ratio',
    metric: 'Tăng trưởng doanh thu',
    company: TEST_COMPANY,
    period: 'FY2025',
    report_type: 'Consolidated',
    reported_value: 18.5,
    currency: '%',
    unit: '%',
    formula: '(Doanh thu kỳ này - Doanh thu kỳ trước) / Doanh thu kỳ trước * 100',
    source_document: 'ALP_TomTat_FY2025.pdf',
    source_page: 2,
    source_location: 'Tóm tắt điều hành',
    evidence: 'Tăng trưởng doanh thu YoY đạt 18,5%.',
    verification_status: 'PENDING',
  },
];

test('normalizeFinancialValue converts VND, Million VND, and Billion VND accurately', () => {
  const m2b = normalizeFinancialValue(7857000, 'Million VND', 'Billion VND');
  assert.equal(m2b.value, 7857);
  assert.equal(m2b.convertible, true);
  assert.equal(m2b.unitMatched, false);

  const b2m = normalizeFinancialValue(10, 'Billion VND', 'Million VND');
  assert.equal(b2m.value, 10000);
});

test('verifyClaimDeterministic validates formula, period, unit normalization, missing evidence, and human review', () => {
  // CLM-005: 7,857,000 Triệu VND -> 7,857 Tỷ VND -> VERIFIED
  const clm5 = verifyClaimDeterministic(TEST_CLAIMS[2], TEST_REFERENCE_DATASET);
  assert.equal(clm5.status, 'VERIFIED');
  assert.equal(clm5.normalized_reported_value, 7857);

  // CLM-007: Thiếu nguồn -> INSUFFICIENT EVIDENCE
  const clm7 = verifyClaimDeterministic(TEST_CLAIMS[3], TEST_REFERENCE_DATASET);
  assert.equal(clm7.status, 'INSUFFICIENT EVIDENCE');
  assert.equal(clm7.validation_rule, 'MISSING_EVIDENCE');

  // CLM-008: Q3/2025 vs FY2025 -> MISMATCH (PERIOD)
  const clm8 = verifyClaimDeterministic(TEST_CLAIMS[4], TEST_REFERENCE_DATASET);
  assert.equal(clm8.status, 'MISMATCH');
  assert.equal(clm8.validation_rule, 'PERIOD');

  // CLM-010: Tăng trưởng 18.5% vs 12.3% -> MISMATCH (FORMULA)
  const clm10 = verifyClaimDeterministic(TEST_CLAIMS[5], TEST_REFERENCE_DATASET);
  assert.equal(clm10.status, 'MISMATCH');
  assert.equal(clm10.validation_rule, 'FORMULA');
  assert.equal(clm10.recalculated_formula_value, 12.3);
});

test('buildEvidenceReport computes accurate summary counts and tracks HITL audit trail', async () => {
  const { evidenceReport } = await buildEvidenceReport({
    report_id: 'RPT-TEST-ALP-2025',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    reporting_period: 'FY2025',
    report_type: 'Consolidated',
    document_hash: '0x' + 'a'.repeat(64),
    tolerance_percent: 0.5,
    claims: TEST_CLAIMS,
    reference_dataset: TEST_REFERENCE_DATASET,
    is_demo_data: false,
  });

  assert.equal(evidenceReport.summary.total_claims, 6);
  assert.equal(evidenceReport.summary.verified, 2);
  assert.equal(evidenceReport.summary.mismatch, 2);
  assert.equal(evidenceReport.summary.insufficient_evidence, 1);
  assert.equal(evidenceReport.summary.needs_human_review, 1);
  assert.match(evidenceReport.evidence_hash, /^0x[0-9a-f]{64}$/);

  const { evidenceReport: updated } = await buildEvidenceReport({
    report_id: 'RPT-TEST-ALP-2025',
    company: TEST_COMPANY,
    ticker: 'ALP',
    exchange: 'HOSE',
    reporting_period: 'FY2025',
    report_type: 'Consolidated',
    document_hash: '0x' + 'a'.repeat(64),
    tolerance_percent: 0.5,
    claims: TEST_CLAIMS,
    reference_dataset: TEST_REFERENCE_DATASET,
    human_reviews: [
      {
        id: 'REV-1',
        claim_id: 'CLM-004',
        reviewer_id: 'auditor-01',
        reviewer_name: 'Nguyen Minh Tuan, CPA',
        decision: 'VERIFIED',
        comment: 'Confirmed Note V.24 FX adjustment matches audited filing.',
        previous_value: 11045,
        updated_value: 11045,
        created_at: '2026-11-17T12:00:00.000Z',
      },
    ],
    is_demo_data: false,
  });

  assert.equal(updated.summary.verified, 3);
  assert.equal(updated.summary.needs_human_review, 0);
  assert.notEqual(updated.evidence_hash, evidenceReport.evidence_hash);
  const clm4 = updated.claims.find((c) => c.claim_id === 'CLM-004');
  assert.equal(clm4?.verification_source, 'HUMAN_APPROVED');
});

test('processUploadedDocument + extractFinancialClaims deterministically parses structured CSV reports', async () => {
  const { processUploadedDocument } = await import('./documentProcessor.ts');
  const { extractFinancialClaims } = await import('./geminiExtractor.ts');

  const csv = [
    'claim_id,metric,reported_value,unit,period,source_page,evidence',
    'CLM-CSV-1,Doanh thu thuần,62849,Tỷ VND,FY2025,7,"Doanh thu thuần 62.849 tỷ VND"',
    'CLM-CSV-2,Tăng trưởng doanh thu,18.5,%,FY2025,2,"Tóm tắt điều hành 18,5%"',
  ].join('\n');

  const processed = await processUploadedDocument({
    buffer: Buffer.from(csv, 'utf-8'),
    originalFilename: 'report-test.csv',
    mimeType: 'text/csv',
  });

  assert.match(processed.documentHash, /^0x[0-9a-f]{64}$/);
  assert.ok(processed.structuredJsonClaims && processed.structuredJsonClaims.length === 2);

  const extracted = await extractFinancialClaims({
    extractedText: processed.extractedText,
    structuredRows: processed.structuredJsonClaims,
    companyName: TEST_COMPANY,
    period: 'FY2025',
    reportType: 'Consolidated',
    currency: 'VND',
    unit: 'Tỷ VND',
    sourceDocument: processed.originalFilename,
  });

  assert.equal(extracted.extractor, 'STRUCTURED_PARSER');
  assert.equal(extracted.claims.length, 2);

  const revRes = verifyClaimDeterministic(extracted.claims[0], TEST_REFERENCE_DATASET);
  const growthRes = verifyClaimDeterministic(extracted.claims[1], TEST_REFERENCE_DATASET);
  assert.equal(revRes.status, 'VERIFIED');
  assert.equal(growthRes.status, 'MISMATCH');
});

test('processUploadedDocument detects scanned image PDFs accurately without faking text', async () => {
  const fs = await import('node:fs/promises');
  const { processUploadedDocument } = await import('./documentProcessor.ts');
  const pdfPath = 'public/assets/aistudio/VNM_2024_ENG_c372c76a.pdf';
  const buf = await fs.readFile(pdfPath);
  const processed = await processUploadedDocument({
    buffer: buf,
    originalFilename: 'VNM_2024_ENG_c372c76a.pdf',
    mimeType: 'application/pdf',
  });

  assert.equal(processed.pageCount, 54);
  assert.equal(processed.isScannedPdf, true);
  assert.equal(processed.extractedText, '');
  assert.ok(processed.pdfBase64 && processed.pdfBase64.length > 1000);
});

test('parseApiJson surfaces friendly errors for HTML proxy responses instead of JSON syntax errors', async () => {
  const { parseApiJson } = await import('./apiClient.ts');

  const html504 = new Response('<!doctype html><html><body>504 Gateway Timeout</body></html>', {
    status: 504,
    headers: { 'Content-Type': 'text/html' },
  });
  await assert.rejects(
    () => parseApiJson(html504, 'Tải lên thất bại'),
    /HTTP 504/,
  );

  const html413 = new Response('<!DOCTYPE html><html>Payload Too Large</html>', {
    status: 413,
    headers: { 'Content-Type': 'text/html' },
  });
  await assert.rejects(
    () => parseApiJson(html413, 'Tải lên thất bại'),
    /HTTP 413/,
  );

  const okJson = new Response(JSON.stringify({ ok: true, job_id: 'job-1' }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
  const parsed = await parseApiJson<{ ok: boolean; job_id: string }>(okJson, 'Lỗi');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.job_id, 'job-1');
});



