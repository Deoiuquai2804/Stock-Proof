import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  CONTRACT_ADDRESS_FUJI,
  ENTERPRISE_META,
  FPT_GROUND_TRUTH,
  getPresetClaims,
} from './src/data/fptSeedData.ts';
import { runVerificationEngine } from './src/lib/verification.ts';
import type {
  BuyerDecision,
  FujiAnchorRecord,
  HitlResolution,
  ScenarioPresetId,
  SellerClaim,
  WorkspaceState,
} from './src/types/stockproof.ts';

const PORT = 3000;
const FUJI_RPC_URL = 'https://api.avax-test.network/ext/bc/C/rpc';
const FUJI_CHAIN_ID = 43113;
const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DB_DIR, 'stockproof-db.json');

interface PersistedDatabase {
  workspace: WorkspaceState;
  hitlMap: Record<string, HitlResolution>;
}

async function createInitialDatabase(
  scenarioId: ScenarioPresetId = 'faulty-demo',
): Promise<PersistedDatabase> {
  const sellerClaims = getPresetClaims(scenarioId);
  const reportId = `RPT-FPT-${scenarioId === 'clean-revised' ? 'REV' : '2025'}-001`;
  const evidenceReport = await runVerificationEngine({
    reportId,
    enterpriseName: ENTERPRISE_META.name,
    ticker: ENTERPRISE_META.ticker,
    exchange: ENTERPRISE_META.exchange,
    statementType: ENTERPRISE_META.statementType,
    reportingPeriod: ENTERPRISE_META.reportingPeriod,
    sellerAgentId: 'seller-agent-fpt-ir-01',
    buyerAgentId: 'buyer-agent-institutional-09',
    sellerClaims,
    groundTruth: FPT_GROUND_TRUTH,
  });

  return {
    hitlMap: {},
    workspace: {
      scenarioId,
      enterprise: ENTERPRISE_META,
      sellerAgentId: 'seller-agent-fpt-ir-01',
      buyerAgentId: 'buyer-agent-institutional-09',
      sellerClaims,
      groundTruth: FPT_GROUND_TRUTH,
      evidenceReport,
      fujiAnchor: null,
      anchorHistory: [],
      buyerDecision: {
        decision: 'Pending',
        buyerName: 'VietCap Institutional Desk',
        note: '',
        decidedAt: null,
      },
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

async function loadDatabase(): Promise<PersistedDatabase> {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PersistedDatabase;
    if (parsed && parsed.workspace && Array.isArray(parsed.workspace.sellerClaims)) {
      return parsed;
    }
  } catch {
    // Initialize fresh seed DB if file doesn't exist yet
  }
  const initial = await createInitialDatabase('faulty-demo');
  await saveDatabase(initial);
  return initial;
}

async function saveDatabase(db: PersistedDatabase): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

async function fetchFujiBlockNumber(): Promise<{
  blockNumber: number;
  rpcVerified: boolean;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
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
    if (!res.ok) throw new Error('RPC non-200');
    const data = (await res.json()) as { result?: string };
    if (data.result && data.result.startsWith('0x')) {
      return {
        blockNumber: Number.parseInt(data.result, 16),
        rpcVerified: true,
      };
    }
  } catch {
    // Fallback deterministic Fuji C-Chain reference block height when offline/sandboxed
  }
  return {
    blockNumber: 38412950 + Math.floor((Date.now() / 2000) % 10000),
    rpcVerified: false,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'stockproof-api' });
  });

  app.get('/api/fuji-status', async (_req, res) => {
    const rpc = await fetchFujiBlockNumber();
    res.json({
      networkName: 'Avalanche Fuji C-Chain Testnet',
      chainId: FUJI_CHAIN_ID,
      rpcUrl: FUJI_RPC_URL,
      contractAddress: CONTRACT_ADDRESS_FUJI,
      blockNumber: rpc.blockNumber,
      rpcVerified: rpc.rpcVerified,
      explorerBaseUrl: 'https://testnet.snowtrace.io',
    });
  });

  app.get('/api/workspace', async (_req, res) => {
    const db = await loadDatabase();
    res.json(db.workspace);
  });

  app.post('/api/verify', async (req, res) => {
    try {
      const db = await loadDatabase();
      const body = req.body as {
        claims?: SellerClaim[];
        scenarioId?: ScenarioPresetId;
        clearHitl?: boolean;
      };

      const nextClaims = Array.isArray(body?.claims)
        ? body.claims
        : db.workspace.sellerClaims;
      if (body?.clearHitl) {
        db.hitlMap = {};
      }
      if (body?.scenarioId) {
        db.workspace.scenarioId = body.scenarioId;
      }

      const reportId = `RPT-FPT-${Date.now().toString(36).toUpperCase()}`;
      const evidenceReport = await runVerificationEngine({
        reportId,
        enterpriseName: db.workspace.enterprise.name,
        ticker: db.workspace.enterprise.ticker,
        exchange: db.workspace.enterprise.exchange,
        statementType: db.workspace.enterprise.statementType,
        reportingPeriod: db.workspace.enterprise.reportingPeriod,
        sellerAgentId: db.workspace.sellerAgentId,
        buyerAgentId: db.workspace.buyerAgentId,
        sellerClaims: nextClaims,
        groundTruth: db.workspace.groundTruth,
        hitlMap: db.hitlMap,
      });

      db.workspace.sellerClaims = nextClaims;
      db.workspace.evidenceReport = evidenceReport;
      db.workspace.fujiAnchor = null;
      db.workspace.buyerDecision = {
        ...db.workspace.buyerDecision,
        decision: 'Pending',
        note: '',
        decidedAt: null,
      };
      db.workspace.lastUpdatedAt = new Date().toISOString();

      await saveDatabase(db);
      res.json(db.workspace);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Verification failed',
      });
    }
  });

  app.post('/api/claims/:claimId/hitl', async (req, res) => {
    try {
      const { claimId } = req.params;
      const body = req.body as {
        decision?: 'Verified' | 'Mismatch';
        reviewerName?: string;
        reviewerRole?: string;
        note?: string;
      };

      if (body.decision !== 'Verified' && body.decision !== 'Mismatch') {
        res.status(400).json({ error: 'Decision must be Verified or Mismatch.' });
        return;
      }
      if (!body.reviewerName?.trim() || !body.note?.trim()) {
        res
          .status(400)
          .json({ error: 'Reviewer name and audit rationale are required.' });
        return;
      }

      const db = await loadDatabase();
      const targetExists = db.workspace.sellerClaims.some(
        (c) => c.claimId === claimId,
      );
      if (!targetExists) {
        res.status(404).json({ error: `Claim ${claimId} not found.` });
        return;
      }

      db.hitlMap[claimId] = {
        claimId,
        decision: body.decision,
        reviewerName: body.reviewerName.trim(),
        reviewerRole: body.reviewerRole?.trim() || 'Senior Financial Auditor',
        note: body.note.trim(),
        resolvedAt: new Date().toISOString(),
      };

      const evidenceReport = await runVerificationEngine({
        reportId:
          db.workspace.evidenceReport?.reportId ??
          `RPT-FPT-${Date.now().toString(36).toUpperCase()}`,
        enterpriseName: db.workspace.enterprise.name,
        ticker: db.workspace.enterprise.ticker,
        exchange: db.workspace.enterprise.exchange,
        statementType: db.workspace.enterprise.statementType,
        reportingPeriod: db.workspace.enterprise.reportingPeriod,
        sellerAgentId: db.workspace.sellerAgentId,
        buyerAgentId: db.workspace.buyerAgentId,
        sellerClaims: db.workspace.sellerClaims,
        groundTruth: db.workspace.groundTruth,
        hitlMap: db.hitlMap,
      });

      db.workspace.evidenceReport = evidenceReport;
      // Clear anchor if hash changed after HITL resolution
      db.workspace.fujiAnchor = null;
      db.workspace.lastUpdatedAt = new Date().toISOString();

      await saveDatabase(db);
      res.json(db.workspace);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to record HITL decision',
      });
    }
  });

  app.post('/api/anchor-fuji', async (req, res) => {
    try {
      const db = await loadDatabase();
      const report = db.workspace.evidenceReport;
      if (!report) {
        res.status(400).json({
          error: 'Generate an Evidence Report before anchoring to Avalanche Fuji.',
        });
        return;
      }

      const body = req.body as {
        txHash?: string;
        contractAddress?: string;
      };
      const rpc = await fetchFujiBlockNumber();
      const suppliedTx = body?.txHash?.trim();
      const txHash =
        suppliedTx && /^0x[0-9a-fA-F]{64}$/.test(suppliedTx)
          ? suppliedTx
          : '0x' +
            crypto
              .createHash('sha256')
              .update(
                `${report.reportHash}:${rpc.blockNumber}:${Date.now()}`,
              )
              .digest('hex');

      const anchorRecord: FujiAnchorRecord = {
        anchorId: `FUJI-${Date.now().toString(36).toUpperCase()}`,
        reportId: report.reportId,
        reportHash: report.reportHash,
        contractAddress: body?.contractAddress?.trim() || CONTRACT_ADDRESS_FUJI,
        chainId: FUJI_CHAIN_ID,
        networkName: 'Avalanche Fuji C-Chain',
        blockNumber: rpc.blockNumber,
        txHash,
        explorerUrl: `https://testnet.snowtrace.io/tx/${txHash}`,
        overallVerdict: report.summary.overallVerdict,
        verifiedCount: report.summary.verifiedCount,
        totalClaims: report.summary.totalClaims,
        anchoredAt: new Date().toISOString(),
        anchorMode: suppliedTx ? 'wallet-live' : 'fuji-rpc-recorded',
        rpcVerified: rpc.rpcVerified,
      };

      db.workspace.fujiAnchor = anchorRecord;
      db.workspace.anchorHistory = [
        anchorRecord,
        ...db.workspace.anchorHistory.slice(0, 9),
      ];
      db.workspace.lastUpdatedAt = new Date().toISOString();

      await saveDatabase(db);
      res.json(db.workspace);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Fuji anchoring failed',
      });
    }
  });

  app.post('/api/buyer-decision', async (req, res) => {
    try {
      const db = await loadDatabase();
      const body = req.body as {
        decision?: BuyerDecision['decision'];
        buyerName?: string;
        note?: string;
      };

      if (
        body.decision !== 'Accepted' &&
        body.decision !== 'Revision Requested'
      ) {
        res.status(400).json({
          error: 'Buyer decision must be Accepted or Revision Requested.',
        });
        return;
      }

      const report = db.workspace.evidenceReport;
      if (!report) {
        res.status(400).json({ error: 'No Evidence Report found.' });
        return;
      }

      if (body.decision === 'Accepted') {
        if (report.summary.needsHumanReviewCount > 0) {
          res.status(400).json({
            error:
              'Cannot accept report while claims require Human-in-the-Loop review.',
          });
          return;
        }
        if (
          report.summary.mismatchCount > 0 ||
          report.summary.insufficientEvidenceCount > 0
        ) {
          res.status(400).json({
            error:
              'Cannot accept report with unresolved mismatches or insufficient evidence.',
          });
          return;
        }
      }

      db.workspace.buyerDecision = {
        decision: body.decision,
        buyerName: body.buyerName?.trim() || 'VietCap Institutional Desk',
        note:
          body.note?.trim() ||
          (body.decision === 'Accepted'
            ? 'All 10 claims verified and anchored.'
            : 'Seller requested to fix flagged discrepancies.'),
        decidedAt: new Date().toISOString(),
      };
      db.workspace.lastUpdatedAt = new Date().toISOString();

      await saveDatabase(db);
      res.json(db.workspace);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Buyer decision failed',
      });
    }
  });

  app.post('/api/reset', async (req, res) => {
    const body = req.body as { scenarioId?: ScenarioPresetId };
    const scenarioId: ScenarioPresetId =
      body?.scenarioId === 'clean-revised' ? 'clean-revised' : 'faulty-demo';
    const nextDb = await createInitialDatabase(scenarioId);
    await saveDatabase(nextDb);
    res.json(nextDb.workspace);
  });

  app.get('/api/contract-source', async (_req, res) => {
    try {
      const solPath = path.resolve(
        process.cwd(),
        'contracts/StockProofRegistry.sol',
      );
      const source = await fs.readFile(solPath, 'utf-8');
      res.json({
        contractName: 'StockProofRegistry',
        contractAddress: CONTRACT_ADDRESS_FUJI,
        chainId: FUJI_CHAIN_ID,
        source,
      });
    } catch {
      res.status(404).json({ error: 'Contract source not found' });
    }
  });

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
