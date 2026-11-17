import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  CONTRACT_ADDRESS_FUJI,
  DEMO_COMPANY,
  DEMO_INITIAL_ACTIVITIES,
  DEMO_REFERENCE_DATASET,
  DEMO_SELLER_CLAIMS,
  createSeedReportSkeleton,
} from './src/data/fptSeedData.ts';
import { db, isSqlConfigured } from './src/db/index.ts';
import { loadPostgresWorkspace, ensureCompany } from './src/db/repository.ts';
import {
  blockchainRecords,
  claims as claimsTable,
  evidences as evidencesTable,
  humanReviews as humanReviewsTable,
  reports as reportsTable,
  verifications as verificationsTable,
} from './src/db/schema.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { processUploadedDocument } from './src/lib/documentProcessor.ts';
import { extractFinancialClaims } from './src/lib/geminiExtractor.ts';
import { generateEvidenceReportPdf } from './src/lib/pdfGenerator.ts';
import {
  buildEvidenceReport,
  computeSha256Hex,
  DEFAULT_TOLERANCE_PERCENT,
} from './src/lib/verification.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import type {
  ActivityEvent,
  BlockchainNetworkStatus,
  BlockchainRecord,
  FinancialClaimInput,
  HumanReviewRecord,
  ReportRecord,
  ReportType,
  WorkspacePayload,
} from './src/types/stockproof.ts';

dotenv.config();

const PORT = 3000;
const FUJI_RPC_URL =
  process.env.AVALANCHE_FUJI_RPC_URL ||
  'https://api.avax-test.network/ext/bc/C/rpc';
const FUJI_CHAIN_ID = 43113;
const DB_DIR = path.resolve(process.cwd(), 'data');
const DEMO_DB_FILE = path.resolve(DB_DIR, 'stockproof-demo.json');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

interface DemoDatabase {
  active_report_id: string;
  tolerance_percent: number;
  reports: ReportRecord[];
  activities: ActivityEvent[];
  blockchain_records: BlockchainRecord[];
}

async function fetchFujiNetworkStatus(): Promise<BlockchainNetworkStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(FUJI_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = (await res.json()) as { result?: string };
      if (json.result && json.result.startsWith('0x')) {
        return {
          network: 'Avalanche Fuji Testnet',
          chain_id: FUJI_CHAIN_ID,
          connected: true,
          rpc_url: FUJI_RPC_URL,
          contract_address: CONTRACT_ADDRESS_FUJI,
          block_number: Number.parseInt(json.result, 16),
          explorer_base_url: 'https://testnet.snowtrace.io',
          mode_label: 'Đã kết nối RPC (Ký bằng ví để ghi trực tiếp hoặc dùng Chế độ Demo)',
        };
      }
    }
  } catch {
    // RPC không khả dụng trong môi trường ngoại tuyến
  }

  return {
    network: 'Avalanche Fuji Testnet',
    chain_id: FUJI_CHAIN_ID,
    connected: false,
    rpc_url: FUJI_RPC_URL,
    contract_address: CONTRACT_ADDRESS_FUJI,
    block_number: null,
    explorer_base_url: 'https://testnet.snowtrace.io',
    mode_label: 'Chưa kết nối (Có sẵn chế độ Demo)',
  };
}

async function createInitialDemoDatabase(): Promise<DemoDatabase> {
  const skeleton = createSeedReportSkeleton();
  const { results, evidenceReport } = await buildEvidenceReport({
    report_id: skeleton.id,
    company: skeleton.company_name,
    ticker: skeleton.ticker,
    exchange: skeleton.exchange,
    reporting_period: skeleton.reporting_period,
    report_type: skeleton.report_type,
    document_hash: skeleton.document_hash,
    tolerance_percent: DEFAULT_TOLERANCE_PERCENT,
    claims: skeleton.extracted_claims,
    reference_dataset: DEMO_REFERENCE_DATASET,
    human_reviews: [],
    blockchain_record: null,
    is_demo_data: true,
    timestamp: skeleton.created_at,
  });

  const seededReport: ReportRecord = {
    ...skeleton,
    status:
      evidenceReport.summary.needs_human_review > 0
        ? 'PENDING_REVIEW'
        : evidenceReport.summary.mismatch > 0
          ? 'MISMATCH'
          : 'VERIFIED',
    verification_results: results,
    evidence_report: evidenceReport,
  };

  return {
    active_report_id: seededReport.id,
    tolerance_percent: DEFAULT_TOLERANCE_PERCENT,
    reports: [seededReport],
    activities: [...DEMO_INITIAL_ACTIVITIES],
    blockchain_records: [],
  };
}

async function loadDemoDatabase(): Promise<DemoDatabase> {
  try {
    const raw = await fs.readFile(DEMO_DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DemoDatabase;
    if (parsed && Array.isArray(parsed.reports) && parsed.reports.length > 0) {
      return parsed;
    }
  } catch {
    // Seed initial demo DB
  }
  const initial = await createInitialDemoDatabase();
  await saveDemoDatabase(initial);
  return initial;
}

async function saveDemoDatabase(data: DemoDatabase): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.writeFile(DEMO_DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function tryResolveUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !isSqlConfigured()) {
    return null;
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
}

async function recomputeReport(
  report: ReportRecord,
  tolerancePercent: number,
): Promise<ReportRecord> {
  const { results, evidenceReport } = await buildEvidenceReport({
    report_id: report.id,
    company: report.company_name,
    ticker: report.ticker,
    exchange: report.exchange,
    reporting_period: report.reporting_period,
    report_type: report.report_type,
    document_hash: report.document_hash,
    tolerance_percent: tolerancePercent,
    claims: report.extracted_claims,
    reference_dataset: DEMO_REFERENCE_DATASET,
    human_reviews: report.human_reviews,
    blockchain_record: report.blockchain_record,
    is_demo_data: report.is_demo_data,
  });

  const nextStatus: ReportRecord['status'] =
    evidenceReport.summary.needs_human_review > 0
      ? 'PENDING_REVIEW'
      : evidenceReport.summary.mismatch > 0 ||
          evidenceReport.summary.insufficient_evidence > 0
        ? 'MISMATCH'
        : 'VERIFIED';

  return {
    ...report,
    status: nextStatus,
    verification_results: results,
    evidence_report: evidenceReport,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'stockproof-mvp-api' });
  });

  app.post('/api/auth/session', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user?.uid) {
        res.status(401).json({ error: 'Danh tính người dùng không hợp lệ.' });
        return;
      }
      if (!isSqlConfigured()) {
        res.json({
          uid: req.user.uid,
          email: req.user.email ?? '',
          name: req.user.name ?? 'Kiểm toán viên',
          persistence_mode: 'LOCAL_DEMO_PERSISTENCE',
        });
        return;
      }
      const user = await getOrCreateUser(
        req.user.uid,
        req.user.email ?? '',
        req.user.name,
      );
      res.json({
        ...user,
        persistence_mode: 'POSTGRES_CLOUDSQL',
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Đồng bộ phiên đăng nhập thất bại.',
      });
    }
  });

  app.get('/api/fuji-status', async (_req, res) => {
    const status = await fetchFujiNetworkStatus();
    res.json(status);
  });

  app.get('/api/contract-source', async (_req, res) => {
    try {
      const solPath = path.resolve(
        process.cwd(),
        'contracts/StockProofRegistry.sol',
      );
      const source = await fs.readFile(solPath, 'utf-8');
      res.json({
        contract_name: 'StockProofRegistry',
        contract_address: CONTRACT_ADDRESS_FUJI,
        chain_id: FUJI_CHAIN_ID,
        source,
      });
    } catch {
      res.status(404).json({ error: 'Không tìm thấy mã nguồn hợp đồng.' });
    }
  });

  app.get('/api/sample-report', (req, res) => {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="FPT_FY2025_Sample_Claims.json"',
      );
      res.send(
        JSON.stringify(
          {
            company: DEMO_COMPANY.name,
            period: 'FY2025',
            report_type: 'Consolidated',
            claims: DEMO_SELLER_CLAIMS,
          },
          null,
          2,
        ),
      );
      return;
    }

    const headers = [
      'claim_id',
      'claim_type',
      'metric',
      'company',
      'period',
      'report_type',
      'reported_value',
      'currency',
      'unit',
      'formula',
      'source_document',
      'source_page',
      'source_location',
      'evidence',
    ];
    const escapeCsv = (val: unknown) => {
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };
    const rows = DEMO_SELLER_CLAIMS.map((c) =>
      [
        c.claim_id,
        c.claim_type,
        c.metric,
        c.company,
        c.period,
        c.report_type,
        c.reported_value ?? '',
        c.currency,
        c.unit,
        c.formula ?? '',
        c.source_document,
        c.source_page ?? '',
        c.source_location,
        c.evidence,
      ]
        .map(escapeCsv)
        .join(','),
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="FPT_FY2025_Sample_Claims.csv"',
    );
    res.send(csvContent);
  });

  app.get('/api/workspace', async (req, res) => {
    try {
      const bcStatus = await fetchFujiNetworkStatus();
      const user = await tryResolveUser(req);

      if (user && user.email) {
        const pgWorkspace = await loadPostgresWorkspace({
          uid: user.uid,
          email: user.email,
          name: user.name,
          tolerancePercent: DEFAULT_TOLERANCE_PERCENT,
          blockchainStatus: bcStatus,
        });
        res.json(pgWorkspace);
        return;
      }

      const demo = await loadDemoDatabase();
      const payload: WorkspacePayload = {
        active_report_id: demo.active_report_id,
        tolerance_percent: demo.tolerance_percent,
        reports: demo.reports,
        reference_dataset: DEMO_REFERENCE_DATASET,
        activities: demo.activities,
        blockchain_records: demo.blockchain_records,
        blockchain_status: bcStatus,
        persistence_mode: 'LOCAL_DEMO_PERSISTENCE',
      };
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Không thể tải không gian làm việc.',
      });
    }
  });

  app.post('/api/settings/tolerance', async (req, res) => {
    const { tolerance_percent } = req.body as { tolerance_percent?: number };
    const val = Number(tolerance_percent);
    if (!Number.isFinite(val) || val < 0 || val > 25) {
      res.status(400).json({ error: 'Ngưỡng sai số phải nằm trong khoảng từ 0% đến 25%.' });
      return;
    }

    const demo = await loadDemoDatabase();
    demo.tolerance_percent = val;
    demo.reports = await Promise.all(
      demo.reports.map((r) => recomputeReport(r, val)),
    );
    demo.activities.unshift({
      id: `ACT-${Date.now()}`,
      report_id: demo.active_report_id,
      title: 'Đã cập nhật ngưỡng sai số xác minh',
      description: `Ngưỡng sai số đặt thành +/-${val}% và đã xác minh lại toàn bộ báo cáo.`,
      status: 'info',
      timestamp: new Date().toISOString(),
    });
    await saveDemoDatabase(demo);
    res.json({ tolerance_percent: val });
  });

  interface UploadJobState {
    job_id: string;
    status: 'processing' | 'completed' | 'failed';
    progress: number;
    created_at: number;
    report?: ReportRecord;
    extractor?: string;
    page_count?: number;
    error?: string;
  }

  const uploadJobs = new Map<string, UploadJobState>();

  function pruneOldUploadJobs() {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [k, v] of uploadJobs.entries()) {
      if (v.created_at < cutoff) uploadJobs.delete(k);
    }
  }

  async function runReportUploadPipeline(params: {
    file: Express.Multer.File;
    body: {
      company_name?: string;
      ticker?: string;
      reporting_period?: string;
      report_type?: ReportType;
      fiscal_year?: string;
      currency?: string;
      unit?: string;
    };
    authUser: Awaited<ReturnType<typeof tryResolveUser>>;
    onProgress?: (pct: number) => void;
  }) {
    const { file, body, authUser, onProgress } = params;
    const companyName = body.company_name?.trim() || DEMO_COMPANY.name;
    const ticker = (body.ticker?.trim() || 'FPT').toUpperCase();
    const reportingPeriod = body.reporting_period?.trim() || 'FY2025';
    const reportType: ReportType =
      body.report_type === 'Separate' ? 'Separate' : 'Consolidated';
    const fiscalYear = body.fiscal_year?.trim() || '2025';
    const currency = body.currency?.trim() || 'VND';
    const unit = body.unit?.trim() || 'Tỷ VND';

    onProgress?.(35);
    const processed = await processUploadedDocument({
      buffer: file.buffer,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
    });

    onProgress?.(55);
    const extraction = await extractFinancialClaims({
      extractedText: processed.extractedText,
      structuredRows: processed.structuredJsonClaims,
      companyName,
      period: reportingPeriod,
      reportType,
      currency,
      unit,
      sourceDocument: processed.originalFilename,
      pageCount: processed.pageCount,
      isScannedPdf: processed.isScannedPdf,
      pdfBase64: processed.pdfBase64,
    });

    onProgress?.(85);
    const reportId = `RPT-${ticker}-${Date.now().toString(36).toUpperCase()}`;
    const newReportBase: ReportRecord = {
      id: reportId,
      company_name: companyName,
      ticker,
      exchange: 'HOSE',
      original_filename: processed.originalFilename,
      file_size: processed.fileSize,
      file_type: processed.fileType,
      document_hash: processed.documentHash,
      reporting_period: reportingPeriod,
      report_type: reportType,
      fiscal_year: fiscalYear,
      currency,
      unit,
      storage_path: processed.storagePath,
      status: 'EXTRACTED',
      buyer_decision: 'Pending',
      buyer_note: '',
      is_demo_data: false,
      created_at: new Date().toISOString(),
      extracted_claims: extraction.claims,
      verification_results: [],
      evidence_report: null,
      blockchain_record: null,
      human_reviews: [],
    };

    const demo = await loadDemoDatabase();
    const verifiedReport = await recomputeReport(
      newReportBase,
      demo.tolerance_percent,
    );

    if (authUser && authUser.email) {
      const dbUser = await getOrCreateUser(
        authUser.uid,
        authUser.email,
        authUser.name,
      );
      const comp = await ensureCompany(companyName, ticker, 'HOSE');
      const [insertedReport] = await db
        .insert(reportsTable)
        .values({
          reportCode: verifiedReport.id,
          userId: dbUser.id,
          companyId: comp.id,
          originalFilename: verifiedReport.original_filename,
          documentHash: verifiedReport.document_hash,
          reportingPeriod: verifiedReport.reporting_period,
          reportType: verifiedReport.report_type,
          fiscalYear: verifiedReport.fiscal_year,
          currency: verifiedReport.currency,
          unit: verifiedReport.unit,
          storagePath: verifiedReport.storage_path,
          status: verifiedReport.status,
          buyerDecision: 'Pending',
          buyerNote: '',
        })
        .returning();

      for (let i = 0; i < verifiedReport.extracted_claims.length; i++) {
        const c = verifiedReport.extracted_claims[i];
        const v = verifiedReport.verification_results[i];
        const [insertedClaim] = await db
          .insert(claimsTable)
          .values({
            reportId: insertedReport.id,
            claimCode: c.claim_id,
            claimType: c.claim_type,
            metric: c.metric,
            reportedValue: c.reported_value,
            referenceValue: v.reference_value,
            period: c.period,
            reportType: c.report_type,
            currency: c.currency,
            unit: c.unit,
            formula: c.formula,
            sourcePage: c.source_page,
            sourceLocation: c.source_location,
            evidence: c.evidence,
            verificationStatus: v.status,
          })
          .returning();

        const evHash = await computeSha256Hex(
          `${c.source_document}:${c.source_page ?? ''}:${c.evidence}`,
        );
        await db.insert(evidencesTable).values({
          claimId: insertedClaim.id,
          sourceName: c.source_document,
          sourcePage: c.source_page,
          sourceLocation: c.source_location,
          evidenceHash: evHash,
        });
        await db.insert(verificationsTable).values({
          reportId: insertedReport.id,
          claimId: insertedClaim.id,
          result: v.status,
          explanation: v.explanation,
          difference: v.difference_label,
          validationRule: v.validation_rule,
        });
      }
    } else {
      demo.reports = [verifiedReport, ...demo.reports];
      demo.active_report_id = verifiedReport.id;
      demo.activities.unshift({
        id: `ACT-${Date.now()}`,
        report_id: verifiedReport.id,
        title: `Đã tải lên & phân tích ${processed.originalFilename}`,
        description: `Đã trích xuất ${extraction.claims.length} chỉ tiêu (${extraction.extractor}) và chạy xác minh.`,
        status:
          verifiedReport.status === 'VERIFIED' ? 'verified' : 'warning',
        timestamp: new Date().toISOString(),
      });
      await saveDemoDatabase(demo);
    }

    return {
      report: verifiedReport,
      extractor: extraction.extractor,
      page_count: processed.pageCount,
    };
  }

  app.get('/api/reports/upload-jobs/:jobId', (req, res) => {
    const job = uploadJobs.get(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Không tìm thấy tiến trình phân tích tài liệu.' });
      return;
    }
    res.json(job);
  });

  app.post('/api/reports/upload', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Vui lòng chọn tệp báo cáo PDF, Excel, CSV hoặc JSON.' });
        return;
      }

      const body = req.body as {
        company_name?: string;
        ticker?: string;
        reporting_period?: string;
        report_type?: ReportType;
        fiscal_year?: string;
        currency?: string;
        unit?: string;
      };
      const authUser = await tryResolveUser(req);

      if (String(req.query.async || '') === 'true') {
        pruneOldUploadJobs();
        const jobId = `JOB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex')}`;
        const job: UploadJobState = {
          job_id: jobId,
          status: 'processing',
          progress: 25,
          created_at: Date.now(),
        };
        uploadJobs.set(jobId, job);

        void runReportUploadPipeline({
          file,
          body,
          authUser,
          onProgress: (pct) => {
            job.progress = pct;
          },
        })
          .then((result) => {
            job.status = 'completed';
            job.progress = 100;
            job.report = result.report;
            job.extractor = result.extractor;
            job.page_count = result.page_count;
          })
          .catch((err) => {
            job.status = 'failed';
            job.error =
              err instanceof Error
                ? err.message
                : 'Trích xuất tài liệu thất bại.';
          });

        res.status(202).json({
          job_id: jobId,
          status: 'processing',
          progress: 25,
        });
        return;
      }

      const result = await runReportUploadPipeline({
        file,
        body,
        authUser,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : 'Trích xuất tài liệu thất bại.',
      });
    }
  });

  app.post('/api/reports/:reportId/claims', async (req, res) => {
    try {
      const { reportId } = req.params;
      const { claims } = req.body as { claims?: FinancialClaimInput[] };
      if (!Array.isArray(claims)) {
        res.status(400).json({ error: 'Cần danh sách chỉ tiêu hợp lệ.' });
        return;
      }

      const authUser = await tryResolveUser(req);
      if (authUser && authUser.email) {
        const repRows = await db
          .select()
          .from(reportsTable)
          .where(eq(reportsTable.reportCode, reportId));
        if (repRows.length === 0) {
          res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
          return;
        }
        const repRow = repRows[0];
        const existingClaims = await db
          .select()
          .from(claimsTable)
          .where(eq(claimsTable.reportId, repRow.id));

        const { results, evidenceReport } = await buildEvidenceReport({
          report_id: repRow.reportCode,
          company: claims[0]?.company || DEMO_COMPANY.name,
          ticker: 'FPT',
          exchange: 'HOSE',
          reporting_period: repRow.reportingPeriod,
          report_type: (repRow.reportType as ReportType) || 'Consolidated',
          document_hash: repRow.documentHash,
          tolerance_percent: DEFAULT_TOLERANCE_PERCENT,
          claims,
          reference_dataset: DEMO_REFERENCE_DATASET,
          is_demo_data: repRow.reportCode.startsWith('RPT-DEMO-'),
        });

        for (let i = 0; i < claims.length; i++) {
          const updatedClaim = claims[i];
          const verifiedItem = results[i];
          const match = existingClaims.find(
            (ec) => ec.claimCode === updatedClaim.claim_id,
          );
          if (match) {
            await db
              .update(claimsTable)
              .set({
                reportedValue: updatedClaim.reported_value,
                referenceValue: verifiedItem.reference_value,
                period: updatedClaim.period,
                unit: updatedClaim.unit,
                sourcePage: updatedClaim.source_page,
                sourceLocation: updatedClaim.source_location,
                evidence: updatedClaim.evidence,
                verificationStatus: verifiedItem.status,
              })
              .where(eq(claimsTable.id, match.id));
            await db
              .update(verificationsTable)
              .set({
                result: verifiedItem.status,
                explanation: verifiedItem.explanation,
                difference: verifiedItem.difference_label,
                validationRule: verifiedItem.validation_rule,
              })
              .where(eq(verificationsTable.claimId, match.id));
          }
        }

        const nextReportStatus: ReportRecord['status'] =
          evidenceReport.summary.needs_human_review > 0
            ? 'PENDING_REVIEW'
            : evidenceReport.summary.mismatch > 0 ||
                evidenceReport.summary.insufficient_evidence > 0
              ? 'MISMATCH'
              : 'VERIFIED';

        await db
          .update(reportsTable)
          .set({ status: nextReportStatus })
          .where(eq(reportsTable.id, repRow.id));

        const pgWorkspace = await loadPostgresWorkspace({
          uid: authUser.uid,
          email: authUser.email,
          name: authUser.name,
          tolerancePercent: DEFAULT_TOLERANCE_PERCENT,
          blockchainStatus: await fetchFujiNetworkStatus(),
        });
        const updatedReport = pgWorkspace.reports.find((r) => r.id === reportId);
        res.json({ ok: true, report: updatedReport });
        return;
      }

      const demo = await loadDemoDatabase();
      const idx = demo.reports.findIndex((r) => r.id === reportId);
      if (idx === -1) {
        res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
        return;
      }

      const updated = await recomputeReport(
        {
          ...demo.reports[idx],
          extracted_claims: claims,
          blockchain_record: null,
        },
        demo.tolerance_percent,
      );
      demo.reports[idx] = updated;
      demo.activities.unshift({
        id: `ACT-${Date.now()}`,
        report_id: reportId,
        title: `Đã sửa & xác minh lại chỉ tiêu (${reportId})`,
        description: `Đã cập nhật ${claims.length} chỉ tiêu và chạy lại quy tắc xác minh.`,
        status: updated.status === 'VERIFIED' ? 'verified' : 'warning',
        timestamp: new Date().toISOString(),
      });
      await saveDemoDatabase(demo);
      res.json({ report: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Cập nhật chỉ tiêu thất bại',
      });
    }
  });

  app.post('/api/reports/:reportId/claims/:claimId/review', async (req, res) => {
    try {
      const { reportId, claimId } = req.params;
      const body = req.body as {
        reviewer_id?: string;
        reviewer_name?: string;
        decision?: HumanReviewRecord['decision'];
        comment?: string;
        updated_value?: number | null;
      };

      if (
        body.decision !== 'VERIFIED' &&
        body.decision !== 'MISMATCH' &&
        body.decision !== 'INSUFFICIENT EVIDENCE'
      ) {
        res.status(400).json({ error: 'Quyết định kiểm toán thủ công không hợp lệ.' });
        return;
      }
      if (!body.reviewer_name?.trim() || !body.comment?.trim()) {
        res.status(400).json({
          error: 'Vui lòng nhập tên kiểm toán viên và nhận xét kiểm tra.',
        });
        return;
      }

      const authUser = await tryResolveUser(req);
      if (authUser && authUser.email) {
        const repRows = await db
          .select()
          .from(reportsTable)
          .where(eq(reportsTable.reportCode, reportId));
        if (repRows.length === 0) {
          res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
          return;
        }
        const repClaims = await db
          .select()
          .from(claimsTable)
          .where(eq(claimsTable.reportId, repRows[0].id));
        const target = repClaims.find((c) => c.claimCode === claimId);
        if (!target) {
          res.status(404).json({ error: 'Không tìm thấy chỉ tiêu.' });
          return;
        }
        const prevVal = target.reportedValue;
        const nextVal =
          body.updated_value !== undefined ? body.updated_value : prevVal;

        await db.insert(humanReviewsTable).values({
          claimId: target.id,
          reviewerId: body.reviewer_id?.trim() || authUser.uid,
          reviewerName: body.reviewer_name.trim(),
          decision: body.decision,
          comment: body.comment.trim(),
          previousValue: prevVal,
          updatedValue: nextVal,
        });

        await db
          .update(claimsTable)
          .set({
            reportedValue: nextVal,
            verificationStatus: body.decision,
          })
          .where(eq(claimsTable.id, target.id));

        const pgWorkspace = await loadPostgresWorkspace({
          uid: authUser.uid,
          email: authUser.email,
          name: authUser.name,
          tolerancePercent: DEFAULT_TOLERANCE_PERCENT,
          blockchainStatus: await fetchFujiNetworkStatus(),
        });
        const updatedReport = pgWorkspace.reports.find((r) => r.id === reportId);
        if (updatedReport?.evidence_report) {
          const s = updatedReport.evidence_report.summary;
          const nextReportStatus: ReportRecord['status'] =
            s.needs_human_review > 0
              ? 'PENDING_REVIEW'
              : s.mismatch > 0 || s.insufficient_evidence > 0
                ? 'MISMATCH'
                : 'VERIFIED';
          await db
            .update(reportsTable)
            .set({ status: nextReportStatus })
            .where(eq(reportsTable.id, repRows[0].id));
        }

        res.json({ ok: true, report: updatedReport });
        return;
      }

      const demo = await loadDemoDatabase();
      const idx = demo.reports.findIndex((r) => r.id === reportId);
      if (idx === -1) {
        res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
        return;
      }
      const report = demo.reports[idx];
      const claimIdx = report.extracted_claims.findIndex(
        (c) => c.claim_id === claimId,
      );
      if (claimIdx === -1) {
        res.status(404).json({ error: 'Không tìm thấy chỉ tiêu.' });
        return;
      }

      const previousValue = report.extracted_claims[claimIdx].reported_value;
      const updatedValue =
        body.updated_value !== undefined ? body.updated_value : previousValue;

      if (body.updated_value !== undefined) {
        report.extracted_claims[claimIdx].reported_value = body.updated_value;
      }

      const reviewRecord: HumanReviewRecord = {
        id: `REV-${Date.now().toString(36).toUpperCase()}`,
        claim_id: claimId,
        reviewer_id: body.reviewer_id?.trim() || 'auditor-demo-01',
        reviewer_name: body.reviewer_name.trim(),
        decision: body.decision,
        comment: body.comment.trim(),
        previous_value: previousValue,
        updated_value: updatedValue,
        created_at: new Date().toISOString(),
      };

      const filteredReviews = report.human_reviews.filter(
        (hr) => hr.claim_id !== claimId,
      );
      report.human_reviews = [reviewRecord, ...filteredReviews];
      report.blockchain_record = null;

      const updatedReport = await recomputeReport(report, demo.tolerance_percent);
      demo.reports[idx] = updatedReport;
      demo.activities.unshift({
        id: `ACT-${Date.now()}`,
        report_id: reportId,
        title: `Đã lưu đánh giá HITL cho ${claimId}`,
        description: `${body.decision} bởi ${reviewRecord.reviewer_name}: ${reviewRecord.comment}`,
        status: body.decision === 'VERIFIED' ? 'verified' : 'error',
        timestamp: new Date().toISOString(),
      });
      await saveDemoDatabase(demo);
      res.json({ report: updatedReport });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Không thể lưu đánh giá HITL',
      });
    }
  });

  app.post('/api/reports/:reportId/blockchain', async (req, res) => {
    try {
      const { reportId } = req.params;
      const body = req.body as {
        tx_hash?: string;
        contract_address?: string;
        mode?: 'LIVE_FUJI_WALLET' | 'DEMO_SIMULATION';
      };

      const bcStatus = await fetchFujiNetworkStatus();
      const suppliedTx = body.tx_hash?.trim();
      const isLiveWalletTx =
        body.mode === 'LIVE_FUJI_WALLET' &&
        Boolean(suppliedTx && /^0x[0-9a-fA-F]{64}$/.test(suppliedTx));

      const authUser = await tryResolveUser(req);
      if (authUser) {
        const repRows = await db
          .select()
          .from(reportsTable)
          .where(eq(reportsTable.reportCode, reportId));
        if (repRows.length === 0) {
          res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
          return;
        }
        const repRow = repRows[0];
        const evidenceHash = await computeSha256Hex(
          `${repRow.reportCode}:${repRow.documentHash}:${Date.now()}`,
        );
        const txHash = isLiveWalletTx
          ? (suppliedTx as string)
          : `DEMO-SIM-${crypto
              .createHash('sha256')
              .update(`${repRow.documentHash}:${evidenceHash}`)
              .digest('hex')
              .slice(0, 40)}`;

        await db.insert(blockchainRecords).values({
          reportId: repRow.id,
          reportHash: repRow.documentHash,
          evidenceHash,
          transactionHash: txHash,
          contractAddress:
            body.contract_address?.trim() || CONTRACT_ADDRESS_FUJI,
          network: 'Avalanche Fuji Testnet',
          verificationStatus: repRow.status,
          blockNumber: isLiveWalletTx ? bcStatus.block_number ?? 1 : 0,
        });

        res.json({ ok: true, tx_hash: txHash });
        return;
      }

      const demo = await loadDemoDatabase();
      const idx = demo.reports.findIndex((r) => r.id === reportId);
      if (idx === -1) {
        res.status(404).json({ error: 'Không tìm thấy báo cáo.' });
        return;
      }

      const report = demo.reports[idx];
      if (!report.evidence_report) {
        res.status(400).json({ error: 'Vui lòng tạo Báo cáo bằng chứng trước.' });
        return;
      }

      const txHash = isLiveWalletTx
        ? (suppliedTx as string)
        : `DEMO-SIM-${crypto
            .createHash('sha256')
            .update(
              `${report.document_hash}:${report.evidence_report.evidence_hash}:${Date.now()}`,
            )
            .digest('hex')
            .slice(0, 48)}`;

      const record: BlockchainRecord = {
        id: `BC-${Date.now().toString(36).toUpperCase()}`,
        report_id: report.id,
        report_hash: report.document_hash,
        evidence_hash: report.evidence_report.evidence_hash,
        verification_status: report.evidence_report.summary.overall_status,
        version: 1,
        transaction_hash: txHash,
        contract_address:
          body.contract_address?.trim() || CONTRACT_ADDRESS_FUJI,
        network: 'Avalanche Fuji Testnet',
        chain_id: FUJI_CHAIN_ID,
        block_number: isLiveWalletTx ? bcStatus.block_number ?? 0 : 0,
        explorer_url: isLiveWalletTx
          ? `https://testnet.snowtrace.io/tx/${txHash}`
          : null,
        mode: isLiveWalletTx ? 'LIVE_FUJI_WALLET' : 'DEMO_SIMULATION',
        created_at: new Date().toISOString(),
      };

      report.blockchain_record = record;
      if (report.evidence_report) {
        report.evidence_report.blockchain_record = record;
      }
      demo.reports[idx] = report;
      demo.blockchain_records = [record, ...demo.blockchain_records.slice(0, 19)];
      demo.activities.unshift({
        id: `ACT-${Date.now()}`,
        report_id: report.id,
        title: isLiveWalletTx
          ? `Đã ghi nhận lên Avalanche Fuji (${report.id})`
          : `Đã ghi bản mô phỏng Blockchain (${report.id})`,
        description: `Đã lưu mã băm báo cáo & bằng chứng (${record.mode}).`,
        status: 'verified',
        timestamp: new Date().toISOString(),
      });
      await saveDemoDatabase(demo);

      res.json({ report, blockchain_record: record });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Không thể ghi bản ghi Blockchain',
      });
    }
  });

  app.get('/api/reports/:reportId/evidence.pdf', async (req, res) => {
    try {
      const { reportId } = req.params;
      const demo = await loadDemoDatabase();
      let target = demo.reports.find((r) => r.id === reportId);

      if (!target) {
        const authUser = await tryResolveUser(req);
        if (authUser && authUser.email) {
          const pgWorkspace = await loadPostgresWorkspace({
            uid: authUser.uid,
            email: authUser.email,
            name: authUser.name,
            tolerancePercent: DEFAULT_TOLERANCE_PERCENT,
            blockchainStatus: await fetchFujiNetworkStatus(),
          });
          target = pgWorkspace.reports.find((r) => r.id === reportId);
        }
      }

      if (!target || !target.evidence_report) {
        res.status(404).json({ error: 'Không tìm thấy báo cáo bằng chứng.' });
        return;
      }

      const pdfBuffer = await generateEvidenceReportPdf(target.evidence_report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${reportId}-evidence-report.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Tạo tệp PDF thất bại.',
      });
    }
  });

  app.post('/api/reset', async (_req, res) => {
    const initial = await createInitialDemoDatabase();
    await saveDemoDatabase(initial);
    res.json({ ok: true });
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Không tìm thấy endpoint API.' });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: 'Tệp tải lên vượt quá giới hạn tối đa 15 MB.',
          });
          return;
        }
        res.status(400).json({
          error: `Lỗi tải tệp lên: ${err.message}`,
        });
        return;
      }
      res.status(500).json({
        error:
          err instanceof Error ? err.message : 'Lỗi nội bộ máy chủ API.',
      });
    },
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StockProof server listening on http://localhost:${PORT}`);
  });
}

startServer();
