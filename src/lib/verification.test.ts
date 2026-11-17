import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FPT_GROUND_TRUTH,
  SELLER_REPORT_CLEAN_REVISED,
  SELLER_REPORT_FAULTY_DEMO,
} from '../data/fptSeedData.ts';
import {
  canAcceptBuyerReport,
  runVerificationEngine,
  verifySingleClaim,
} from './verification.ts';

test('verifySingleClaim marks exact matching claim as Verified', () => {
  const claim = SELLER_REPORT_FAULTY_DEMO[0]; // CLM-01 Net Revenue
  const truth = FPT_GROUND_TRUTH[0];
  const result = verifySingleClaim(claim, truth);

  assert.equal(result.finalStatus, 'Verified');
  assert.equal(result.faultType, 'None');
  assert.equal(result.variancePct, 0);
});

test('verifySingleClaim detects formula error, wrong unit, wrong period, missing source, and HITL', () => {
  // CLM-03: Gross margin 41.5% vs 37.8% (Formula Error)
  const clm03 = verifySingleClaim(
    SELLER_REPORT_FAULTY_DEMO[2],
    FPT_GROUND_TRUTH[2],
  );
  assert.equal(clm03.finalStatus, 'Mismatch');
  assert.equal(clm03.faultType, 'Formula Error');

  // CLM-04: Wrong unit (triệu VND vs tỷ VND)
  const clm04 = verifySingleClaim(
    SELLER_REPORT_FAULTY_DEMO[3],
    FPT_GROUND_TRUTH[3],
  );
  assert.equal(clm04.finalStatus, 'Mismatch');
  assert.equal(clm04.faultType, 'Wrong Unit');

  // CLM-06: Wrong period (Q3/2025 vs FY2025)
  const clm06 = verifySingleClaim(
    SELLER_REPORT_FAULTY_DEMO[5],
    FPT_GROUND_TRUTH[5],
  );
  assert.equal(clm06.finalStatus, 'Mismatch');
  assert.equal(clm06.faultType, 'Wrong Period');

  // CLM-07: Missing source -> Insufficient Evidence
  const clm07 = verifySingleClaim(
    SELLER_REPORT_FAULTY_DEMO[6],
    FPT_GROUND_TRUTH[6],
  );
  assert.equal(clm07.finalStatus, 'Insufficient Evidence');
  assert.equal(clm07.faultType, 'Missing Source');

  // CLM-10: Borderline R&D provision -> Needs Human Review
  const clm10 = verifySingleClaim(
    SELLER_REPORT_FAULTY_DEMO[9],
    FPT_GROUND_TRUTH[9],
  );
  assert.equal(clm10.finalStatus, 'Needs Human Review');
  assert.equal(clm10.faultType, 'Auditor Judgment');
});

test('runVerificationEngine produces expected counts for faulty demo and clean report', async () => {
  const faultyReport = await runVerificationEngine({
    reportId: 'RPT-TEST-1',
    enterpriseName: 'FPT Corporation',
    ticker: 'FPT',
    exchange: 'HOSE',
    statementType: 'Consolidated',
    reportingPeriod: 'FY2025',
    sellerAgentId: 'seller-agent-01',
    buyerAgentId: 'buyer-agent-01',
    sellerClaims: SELLER_REPORT_FAULTY_DEMO,
    groundTruth: FPT_GROUND_TRUTH,
  });

  assert.equal(faultyReport.summary.totalClaims, 10);
  assert.equal(faultyReport.summary.verifiedCount, 4); // CLM-01, 02, 05, 09
  assert.equal(faultyReport.summary.mismatchCount, 4); // CLM-03, 04, 06, 08
  assert.equal(faultyReport.summary.insufficientEvidenceCount, 1); // CLM-07
  assert.equal(faultyReport.summary.needsHumanReviewCount, 1); // CLM-10
  assert.equal(faultyReport.summary.overallVerdict, 'Pending HITL');
  assert.match(faultyReport.reportHash, /^0x[0-9a-f]{64}$/);
  assert.equal(canAcceptBuyerReport(faultyReport).allowed, false);

  // Applying HITL approval to CLM-10 changes hash and reduces pending HITL to 0
  const hitlApprovedReport = await runVerificationEngine({
    reportId: 'RPT-TEST-1',
    enterpriseName: 'FPT Corporation',
    ticker: 'FPT',
    exchange: 'HOSE',
    statementType: 'Consolidated',
    reportingPeriod: 'FY2025',
    sellerAgentId: 'seller-agent-01',
    buyerAgentId: 'buyer-agent-01',
    sellerClaims: SELLER_REPORT_FAULTY_DEMO,
    groundTruth: FPT_GROUND_TRUTH,
    hitlMap: {
      'CLM-10': {
        claimId: 'CLM-10',
        decision: 'Verified',
        reviewerName: 'Nguyen Minh Tuan, CPA',
        reviewerRole: 'Lead Auditor',
        note: 'Verified Note V.28 R&D add-back documentation.',
        resolvedAt: '2026-11-17T12:00:00.000Z',
      },
    },
  });

  assert.equal(hitlApprovedReport.summary.needsHumanReviewCount, 0);
  assert.equal(hitlApprovedReport.summary.verifiedCount, 5);
  assert.equal(hitlApprovedReport.summary.overallVerdict, 'Rejected');
  assert.notEqual(hitlApprovedReport.reportHash, faultyReport.reportHash);

  // Clean report passes all 10 claims and allows Buyer acceptance
  const cleanReport = await runVerificationEngine({
    reportId: 'RPT-TEST-2',
    enterpriseName: 'FPT Corporation',
    ticker: 'FPT',
    exchange: 'HOSE',
    statementType: 'Consolidated',
    reportingPeriod: 'FY2025',
    sellerAgentId: 'seller-agent-01',
    buyerAgentId: 'buyer-agent-01',
    sellerClaims: SELLER_REPORT_CLEAN_REVISED,
    groundTruth: FPT_GROUND_TRUTH,
  });

  assert.equal(cleanReport.summary.verifiedCount, 10);
  assert.equal(cleanReport.summary.overallVerdict, 'Approved');
  assert.equal(canAcceptBuyerReport(cleanReport).allowed, true);
});
