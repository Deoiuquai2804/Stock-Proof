import { desc, eq } from 'drizzle-orm';
import {
  DEMO_COMPANY,
  DEMO_REFERENCE_DATASET,
  createSeedReportSkeleton,
} from '../data/fptSeedData.ts';
import {
  buildEvidenceReport,
  computeSha256Hex,
  DEFAULT_TOLERANCE_PERCENT,
} from '../lib/verification.ts';
import type {
  ActivityEvent,
  BlockchainNetworkStatus,
  BlockchainRecord,
  FinancialClaimInput,
  HumanReviewRecord,
  ReportRecord,
  ReportType,
  WorkspacePayload,
} from '../types/stockproof.ts';
import { db } from './index.ts';
import {
  blockchainRecords,
  claims,
  companies,
  evidences,
  humanReviews,
  reports,
  verifications,
} from './schema.ts';
import { getOrCreateUser } from './users.ts';

export async function ensureCompany(
  name: string,
  ticker: string,
  exchange = 'HOSE',
) {
  const existing = await db
    .select()
    .from(companies)
    .where(eq(companies.ticker, ticker));
  if (existing.length > 0) return existing[0];

  const inserted = await db
    .insert(companies)
    .values({ name, ticker, exchange })
    .returning();
  return inserted[0];
}

export async function seedInitialPostgresReportForUser(userId: number) {
  const existingReports = await db
    .select()
    .from(reports)
    .where(eq(reports.userId, userId));
  if (existingReports.length > 0) return;

  const company = await ensureCompany(
    DEMO_COMPANY.name,
    DEMO_COMPANY.ticker,
    DEMO_COMPANY.exchange,
  );
  const seed = createSeedReportSkeleton();
  const reportCode = `${seed.id}-U${userId}`;

  const [insertedReport] = await db
    .insert(reports)
    .values({
      reportCode,
      userId,
      companyId: company.id,
      originalFilename: seed.original_filename,
      documentHash: seed.document_hash,
      reportingPeriod: seed.reporting_period,
      reportType: seed.report_type,
      fiscalYear: seed.fiscal_year,
      currency: seed.currency,
      unit: seed.unit,
      storagePath: seed.storage_path,
      status: seed.status,
      buyerDecision: seed.buyer_decision,
      buyerNote: seed.buyer_note,
    })
    .returning();

  const { results } = await buildEvidenceReport({
    report_id: reportCode,
    company: DEMO_COMPANY.name,
    ticker: DEMO_COMPANY.ticker,
    exchange: DEMO_COMPANY.exchange,
    reporting_period: seed.reporting_period,
    report_type: seed.report_type,
    document_hash: seed.document_hash,
    tolerance_percent: DEFAULT_TOLERANCE_PERCENT,
    claims: seed.extracted_claims,
    reference_dataset: DEMO_REFERENCE_DATASET,
    is_demo_data: true,
  });

  for (let i = 0; i < seed.extracted_claims.length; i++) {
    const rawClaim = seed.extracted_claims[i];
    const verifiedItem = results[i];

    const [insertedClaim] = await db
      .insert(claims)
      .values({
        reportId: insertedReport.id,
        claimCode: rawClaim.claim_id,
        claimType: rawClaim.claim_type,
        metric: rawClaim.metric,
        reportedValue: rawClaim.reported_value,
        referenceValue: verifiedItem.reference_value,
        period: rawClaim.period,
        reportType: rawClaim.report_type,
        currency: rawClaim.currency,
        unit: rawClaim.unit,
        formula: rawClaim.formula,
        sourcePage: rawClaim.source_page,
        sourceLocation: rawClaim.source_location,
        evidence: rawClaim.evidence,
        verificationStatus: verifiedItem.status,
      })
      .returning();

    const evHash = await computeSha256Hex(
      `${rawClaim.source_document}:${rawClaim.source_page ?? ''}:${rawClaim.evidence}`,
    );

    await db.insert(evidences).values({
      claimId: insertedClaim.id,
      sourceName: rawClaim.source_document || 'None',
      sourcePage: rawClaim.source_page,
      sourceLocation: rawClaim.source_location || '',
      evidenceHash: evHash,
    });

    await db.insert(verifications).values({
      reportId: insertedReport.id,
      claimId: insertedClaim.id,
      ruleVersion: '2.0.0',
      verifierVersion: 'stockproof-engine-2.0',
      result: verifiedItem.status,
      explanation: verifiedItem.explanation,
      difference: verifiedItem.difference_label,
      validationRule: verifiedItem.validation_rule,
    });
  }
}

export async function loadPostgresWorkspace(params: {
  uid: string;
  email: string;
  name?: string;
  tolerancePercent: number;
  blockchainStatus: BlockchainNetworkStatus;
}): Promise<WorkspacePayload> {
  try {
    const user = await getOrCreateUser(params.uid, params.email, params.name);
    await seedInitialPostgresReportForUser(user.id);

    const userReports = await db
      .select()
      .from(reports)
      .where(eq(reports.userId, user.id))
      .orderBy(desc(reports.createdAt));

    const allCompanies = await db.select().from(companies);
    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));

    const builtReports: ReportRecord[] = [];
    const allBcRecords: BlockchainRecord[] = [];
    const activities: ActivityEvent[] = [];

    for (const rep of userReports) {
      const comp = companyMap.get(rep.companyId);
      const repClaims = await db
        .select()
        .from(claims)
        .where(eq(claims.reportId, rep.id));

      const reviewsForReport: HumanReviewRecord[] = [];
      for (const clm of repClaims) {
        const hrs = await db
          .select()
          .from(humanReviews)
          .where(eq(humanReviews.claimId, clm.id))
          .orderBy(desc(humanReviews.createdAt));
        if (hrs.length > 0) {
          const hr = hrs[0];
          reviewsForReport.push({
            id: `REV-${hr.id}`,
            claim_id: clm.claimCode,
            reviewer_id: hr.reviewerId,
            reviewer_name: hr.reviewerName,
            decision: hr.decision as HumanReviewRecord['decision'],
            comment: hr.comment,
            previous_value: hr.previousValue,
            updated_value: hr.updatedValue,
            created_at: hr.createdAt.toISOString(),
          });
        }
      }

      const bcRows = await db
        .select()
        .from(blockchainRecords)
        .where(eq(blockchainRecords.reportId, rep.id))
        .orderBy(desc(blockchainRecords.createdAt));

      let latestBc: BlockchainRecord | null = null;
      if (bcRows.length > 0) {
        const b = bcRows[0];
        const isLive = b.transactionHash.startsWith('0x') && b.blockNumber > 0;
        latestBc = {
          id: `BC-${b.id}`,
          report_id: rep.reportCode,
          report_hash: b.reportHash,
          evidence_hash: b.evidenceHash,
          verification_status: b.verificationStatus,
          version: 1,
          transaction_hash: b.transactionHash,
          contract_address: b.contractAddress,
          network: b.network,
          chain_id: 43113,
          block_number: b.blockNumber,
          explorer_url: isLive
            ? `https://testnet.snowtrace.io/tx/${b.transactionHash}`
            : null,
          mode: isLive ? 'LIVE_FUJI_WALLET' : 'DEMO_SIMULATION',
          created_at: b.createdAt.toISOString(),
        };
        allBcRecords.push(latestBc);
      }

      const claimInputs: FinancialClaimInput[] = repClaims.map((c) => ({
        claim_id: c.claimCode,
        claim_type: (c.claimType as FinancialClaimInput['claim_type']) || 'financial_metric',
        metric: c.metric,
        company: comp?.name ?? DEMO_COMPANY.name,
        period: c.period,
        report_type: (c.reportType as ReportType) || 'Consolidated',
        reported_value: c.reportedValue,
        currency: c.currency,
        unit: c.unit,
        formula: c.formula,
        source_document: rep.originalFilename,
        source_page: c.sourcePage,
        source_location: c.sourceLocation ?? '',
        evidence: c.evidence,
        verification_status:
          c.verificationStatus as FinancialClaimInput['verification_status'],
      }));

      const isDemo = rep.reportCode.startsWith('RPT-DEMO-');
      const { results, evidenceReport } = await buildEvidenceReport({
        report_id: rep.reportCode,
        company: comp?.name ?? DEMO_COMPANY.name,
        ticker: comp?.ticker ?? 'FPT',
        exchange: comp?.exchange ?? 'HOSE',
        reporting_period: rep.reportingPeriod,
        report_type: (rep.reportType as ReportType) || 'Consolidated',
        document_hash: rep.documentHash,
        tolerance_percent: params.tolerancePercent,
        claims: claimInputs,
        reference_dataset: DEMO_REFERENCE_DATASET,
        human_reviews: reviewsForReport,
        blockchain_record: latestBc,
        is_demo_data: isDemo,
        timestamp: rep.createdAt.toISOString(),
      });

      builtReports.push({
        id: rep.reportCode,
        company_name: comp?.name ?? DEMO_COMPANY.name,
        ticker: comp?.ticker ?? 'FPT',
        exchange: comp?.exchange ?? 'HOSE',
        original_filename: rep.originalFilename,
        file_size: 0,
        file_type: 'application/pdf',
        document_hash: rep.documentHash,
        reporting_period: rep.reportingPeriod,
        report_type: (rep.reportType as ReportType) || 'Consolidated',
        fiscal_year: rep.fiscalYear,
        currency: rep.currency,
        unit: rep.unit,
        storage_path: rep.storagePath,
        status: rep.status as ReportRecord['status'],
        buyer_decision: rep.buyerDecision as ReportRecord['buyer_decision'],
        buyer_note: rep.buyerNote,
        is_demo_data: isDemo,
        created_at: rep.createdAt.toISOString(),
        extracted_claims: claimInputs,
        verification_results: results,
        evidence_report: evidenceReport,
        blockchain_record: latestBc,
        human_reviews: reviewsForReport,
      });

      activities.push({
        id: `ACT-RPT-${rep.id}`,
        report_id: rep.reportCode,
        title: `Report ${rep.reportCode} Stored in PostgreSQL`,
        description: `${results.length} claims · ${evidenceReport.summary.verified} VERIFIED, ${evidenceReport.summary.mismatch} MISMATCH`,
        status: evidenceReport.summary.mismatch > 0 ? 'warning' : 'verified',
        timestamp: rep.createdAt.toISOString(),
      });
    }

    return {
      active_report_id: builtReports[0]?.id ?? '',
      tolerance_percent: params.tolerancePercent,
      reports: builtReports,
      reference_dataset: DEMO_REFERENCE_DATASET,
      activities,
      blockchain_records: allBcRecords,
      blockchain_status: params.blockchainStatus,
      persistence_mode: 'POSTGRES_CLOUDSQL',
    };
  } catch (error) {
    console.error('Database query failed in loadPostgresWorkspace:', error);
    throw new Error('Failed to load workspace from PostgreSQL.', {
      cause: error,
    });
  }
}
