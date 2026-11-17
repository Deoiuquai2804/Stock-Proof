import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_REFERENCE_DATASET,
  DEMO_SELLER_CLAIMS,
} from '../data/fptSeedData.ts';
import {
  buildEvidenceReport,
  normalizeFinancialValue,
  verifyClaimDeterministic,
} from './verification.ts';

test('normalizeFinancialValue converts VND, Million VND, and Billion VND accurately', () => {
  const m2b = normalizeFinancialValue(7857000, 'Million VND', 'Billion VND');
  assert.equal(m2b.value, 7857);
  assert.equal(m2b.convertible, true);
  assert.equal(m2b.unitMatched, false);

  const b2m = normalizeFinancialValue(10, 'Billion VND', 'Million VND');
  assert.equal(b2m.value, 10000);
});

test('verifyClaimDeterministic validates formula, period, unit normalization, missing evidence, and human review', () => {
  // CLM-005: 7,857,000 Million VND normalizes to 7,857 Billion VND -> VERIFIED
  const clm5 = verifyClaimDeterministic(
    DEMO_SELLER_CLAIMS[4],
    DEMO_REFERENCE_DATASET,
  );
  assert.equal(clm5.status, 'VERIFIED');
  assert.equal(clm5.normalized_reported_value, 7857);

  // CLM-007: Missing source -> INSUFFICIENT EVIDENCE
  const clm7 = verifyClaimDeterministic(
    DEMO_SELLER_CLAIMS[6],
    DEMO_REFERENCE_DATASET,
  );
  assert.equal(clm7.status, 'INSUFFICIENT EVIDENCE');
  assert.equal(clm7.validation_rule, 'MISSING_EVIDENCE');

  // CLM-008: Q3/2025 vs FY2025 -> MISMATCH (PERIOD)
  const clm8 = verifyClaimDeterministic(
    DEMO_SELLER_CLAIMS[7],
    DEMO_REFERENCE_DATASET,
  );
  assert.equal(clm8.status, 'MISMATCH');
  assert.equal(clm8.validation_rule, 'PERIOD');

  // CLM-010: Revenue Growth 18.5% vs recalculated 12.3% -> MISMATCH (FORMULA)
  const clm10 = verifyClaimDeterministic(
    DEMO_SELLER_CLAIMS[9],
    DEMO_REFERENCE_DATASET,
  );
  assert.equal(clm10.status, 'MISMATCH');
  assert.equal(clm10.validation_rule, 'FORMULA');
  assert.equal(clm10.recalculated_formula_value, 12.3);
});

test('buildEvidenceReport matches exact 5/2/1/2 demo distribution and tracks HITL audit trail', async () => {
  const { evidenceReport } = await buildEvidenceReport({
    report_id: 'RPT-DEMO-FPT-2025',
    company: 'FPT Corporation (DEMO DATA)',
    ticker: 'FPT',
    exchange: 'HOSE',
    reporting_period: 'FY2025',
    report_type: 'Consolidated',
    document_hash: '0x' + 'a'.repeat(64),
    tolerance_percent: 0.5,
    claims: DEMO_SELLER_CLAIMS,
    reference_dataset: DEMO_REFERENCE_DATASET,
    is_demo_data: true,
  });

  assert.equal(evidenceReport.summary.total_claims, 10);
  assert.equal(evidenceReport.summary.verified, 5);
  assert.equal(evidenceReport.summary.mismatch, 2);
  assert.equal(evidenceReport.summary.insufficient_evidence, 1);
  assert.equal(evidenceReport.summary.needs_human_review, 2);
  assert.match(evidenceReport.evidence_hash, /^0x[0-9a-f]{64}$/);

  // Resolve one HITL claim and verify verification_source becomes HUMAN_APPROVED
  const { evidenceReport: updated } = await buildEvidenceReport({
    report_id: 'RPT-DEMO-FPT-2025',
    company: 'FPT Corporation (DEMO DATA)',
    ticker: 'FPT',
    exchange: 'HOSE',
    reporting_period: 'FY2025',
    report_type: 'Consolidated',
    document_hash: '0x' + 'a'.repeat(64),
    tolerance_percent: 0.5,
    claims: DEMO_SELLER_CLAIMS,
    reference_dataset: DEMO_REFERENCE_DATASET,
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
    is_demo_data: true,
  });

  assert.equal(updated.summary.verified, 6);
  assert.equal(updated.summary.needs_human_review, 1);
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
    originalFilename: 'sample-test.csv',
    mimeType: 'text/csv',
  });

  assert.match(processed.documentHash, /^0x[0-9a-f]{64}$/);
  assert.ok(processed.structuredJsonClaims && processed.structuredJsonClaims.length === 2);

  const extracted = await extractFinancialClaims({
    extractedText: processed.extractedText,
    structuredRows: processed.structuredJsonClaims,
    companyName: 'Công ty Cổ phần FPT (DỮ LIỆU MẪU)',
    period: 'FY2025',
    reportType: 'Consolidated',
    currency: 'VND',
    unit: 'Tỷ VND',
    sourceDocument: processed.originalFilename,
  });

  assert.equal(extracted.extractor, 'STRUCTURED_PARSER');
  assert.equal(extracted.claims.length, 2);

  const revRes = verifyClaimDeterministic(extracted.claims[0], DEMO_REFERENCE_DATASET);
  const growthRes = verifyClaimDeterministic(extracted.claims[1], DEMO_REFERENCE_DATASET);
  assert.equal(revRes.status, 'VERIFIED');
  assert.equal(growthRes.status, 'MISMATCH');
});

