import { desc, eq } from 'drizzle-orm';
import {
  buildEvidenceReport,
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

export async function loadPostgresWorkspace(params: {
  uid: string;
  email: string;
  name?: string;
  tolerancePercent: number;
  blockchainStatus: BlockchainNetworkStatus;
}): Promise<WorkspacePayload> {
  try {
    const user = await getOrCreateUser(params.uid, params.email, params.name);

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
        company: comp?.name ?? 'Doanh nghiệp chưa xác định',
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

      const isDemo = false;
      const { results, evidenceReport } = await buildEvidenceReport({
        report_id: rep.reportCode,
        company: comp?.name ?? 'Doanh nghiệp chưa xác định',
        ticker: comp?.ticker ?? 'N/A',
        exchange: comp?.exchange ?? 'HOSE',
        reporting_period: rep.reportingPeriod,
        report_type: (rep.reportType as ReportType) || 'Consolidated',
        document_hash: rep.documentHash,
        tolerance_percent: params.tolerancePercent,
        claims: claimInputs,
        reference_dataset: [],
        human_reviews: reviewsForReport,
        blockchain_record: latestBc,
        is_demo_data: isDemo,
        timestamp: rep.createdAt.toISOString(),
      });

      builtReports.push({
        id: rep.reportCode,
        company_name: comp?.name ?? 'Doanh nghiệp chưa xác định',
        ticker: comp?.ticker ?? 'N/A',
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
        title: `Đã lưu báo cáo ${rep.reportCode} trong PostgreSQL`,
        description: `${results.length} chỉ tiêu · ${evidenceReport.summary.verified} Đã xác minh, ${evidenceReport.summary.mismatch} Sai lệch`,
        status: evidenceReport.summary.mismatch > 0 ? 'warning' : 'verified',
        timestamp: rep.createdAt.toISOString(),
      });
    }

    return {
      active_report_id: builtReports[0]?.id ?? '',
      tolerance_percent: params.tolerancePercent,
      reports: builtReports,
      reference_dataset: [],
      activities,
      blockchain_records: allBcRecords,
      blockchain_status: params.blockchainStatus,
      persistence_mode: 'POSTGRES_CLOUDSQL',
    };
  } catch (error) {
    console.error('Database query failed in loadPostgresWorkspace:', error);
    throw new Error('Không thể tải dữ liệu từ PostgreSQL.', {
      cause: error,
    });
  }
}
