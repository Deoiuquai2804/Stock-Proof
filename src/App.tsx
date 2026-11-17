import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Link2, RotateCcw } from 'lucide-react';
import { BuyerDecisionBar } from './components/BuyerDecisionBar.tsx';
import { ClaimInspector } from './components/ClaimInspector.tsx';
import { ClaimsTable, type StatusFilter } from './components/ClaimsTable.tsx';
import { EvidenceFujiView } from './components/EvidenceFujiView.tsx';
import { PipelineStepper } from './components/PipelineStepper.tsx';
import { SellerGroundTruthView } from './components/SellerGroundTruthView.tsx';
import { Sidebar, type ActiveTab } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { COPY } from './lib/i18n.ts';
import type {
  Language,
  ScenarioPresetId,
  SellerClaim,
  WorkspaceState,
} from './types/stockproof.ts';

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAnchoring, setIsAnchoring] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('workbench');
  const [lang, setLang] = useState<Language>('en');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>('CLM-10');

  const fetchWorkspace = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch('/api/workspace');
      if (!res.ok) throw new Error(`Failed to load workspace (${res.status})`);
      const data = (await res.json()) as WorkspaceState;
      setWorkspace(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to reach StockProof API',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const handleRunVerification = async (customClaims?: SellerClaim[]) => {
    if (!workspace) return;
    setActionError(null);
    setIsVerifying(true);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claims: customClaims ?? workspace.sellerClaims,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setWorkspace(data as WorkspaceState);
      if (customClaims) {
        setActiveTab('workbench');
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Verification failed',
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResetScenario = async (scenarioId: ScenarioPresetId) => {
    setActionError(null);
    setIsVerifying(true);
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setWorkspace(data as WorkspaceState);
      setStatusFilter('All');
      setSearchQuery('');
      setSelectedClaimId('CLM-10');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitHitl = async (
    claimId: string,
    payload: {
      decision: 'Verified' | 'Mismatch';
      reviewerName: string;
      reviewerRole: string;
      note: string;
    },
  ) => {
    setActionError(null);
    const res = await fetch(`/api/claims/${encodeURIComponent(claimId)}/hitl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'HITL submission failed');
    setWorkspace(data as WorkspaceState);
  };

  const handleAnchorFuji = async (txHash?: string) => {
    setActionError(null);
    setIsAnchoring(true);
    try {
      const res = await fetch('/api/anchor-fuji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fuji anchoring failed');
      setWorkspace(data as WorkspaceState);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Fuji anchoring failed',
      );
      throw err;
    } finally {
      setIsAnchoring(false);
    }
  };

  const handleBuyerDecision = async (payload: {
    decision: 'Accepted' | 'Revision Requested';
    buyerName: string;
    note: string;
  }) => {
    setActionError(null);
    const res = await fetch('/api/buyer-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Buyer decision failed');
    setWorkspace(data as WorkspaceState);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-4">
          <div className="h-10 bg-slate-200 rounded animate-pulse w-1/3" />
          <div className="h-24 bg-slate-200 rounded animate-pulse" />
          <div className="h-96 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError || !workspace) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-md w-full space-y-4">
          <h1 className="font-display text-lg font-semibold text-slate-900">
            Unable to load StockProof Workspace
          </h1>
          <p className="text-sm text-red-700">{loadError || 'Unknown error'}</p>
          <button
            type="button"
            onClick={fetchWorkspace}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const t = COPY[lang];
  const sectionLabel = t.nav[activeTab];
  const claims = workspace.evidenceReport?.claims ?? [];
  const selectedClaim =
    claims.find((c) => c.claimId === selectedClaimId) ?? null;
  const summary = workspace.evidenceReport?.summary;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        lang={lang}
        enterpriseName={workspace.enterprise.name}
        ticker={workspace.enterprise.ticker}
        exchange={workspace.enterprise.exchange}
        period={workspace.enterprise.reportingPeriod}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          ticker={workspace.enterprise.ticker}
          exchange={workspace.enterprise.exchange}
          period={workspace.enterprise.reportingPeriod}
          sectionLabel={sectionLabel}
          lang={lang}
          isVerifying={isVerifying}
          onRunVerification={() => handleRunVerification()}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto space-y-5">
          {actionError && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3 rounded-lg"
            >
              {actionError}
            </div>
          )}

          {/* Workspace Context & Controls Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-900 text-balance">
                {workspace.enterprise.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 mt-1">
                <span>
                  {workspace.enterprise.exchange}: {workspace.enterprise.ticker}
                </span>
                <span aria-hidden="true">·</span>
                <span>{workspace.enterprise.statementType}</span>
                <span aria-hidden="true">·</span>
                <span>{workspace.enterprise.auditor}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full lg:w-auto">
              <div className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleResetScenario('faulty-demo')}
                  disabled={isVerifying}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors truncate ${
                    workspace.scenarioId === 'faulty-demo'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.toolbar.presetFaulty}
                </button>
                <button
                  type="button"
                  onClick={() => handleResetScenario('clean-revised')}
                  disabled={isVerifying}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors truncate ${
                    workspace.scenarioId === 'clean-revised'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.toolbar.presetClean}
                </button>
              </div>

              <div
                role="group"
                aria-label="Language toggle"
                className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    lang === 'en'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang('vi')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    lang === 'vi'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  VI
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleResetScenario(workspace.scenarioId)}
                disabled={isVerifying}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.toolbar.resetDemo}</span>
              </button>
            </div>
          </div>

          {activeTab === 'workbench' && (
            <>
              <PipelineStepper
                lang={lang}
                report={workspace.evidenceReport}
                fujiAnchor={workspace.fujiAnchor}
                buyerDecision={workspace.buyerDecision}
              />

              {/* 4-column KPI Summary Strip (flat single-elevation bar, zero nested cards) */}
              {summary && (
                <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('Verified')}
                    className="p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-xs font-medium text-slate-500">
                      {t.kpi.verified}
                    </div>
                    <div className="text-2xl font-display font-semibold text-emerald-700 tabular-nums mt-1">
                      {summary.verifiedCount}
                      <span className="text-sm font-normal text-slate-400">
                        /{summary.totalClaims}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('Mismatch')}
                    className="p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-xs font-medium text-slate-500">
                      {t.kpi.mismatch}
                    </div>
                    <div className="text-2xl font-display font-semibold text-red-700 tabular-nums mt-1">
                      {summary.mismatchCount}
                      <span className="text-sm font-normal text-slate-400">
                        /{summary.totalClaims}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('Insufficient Evidence')}
                    className="p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-xs font-medium text-slate-500">
                      {t.kpi.insufficient}
                    </div>
                    <div className="text-2xl font-display font-semibold text-amber-700 tabular-nums mt-1">
                      {summary.insufficientEvidenceCount}
                      <span className="text-sm font-normal text-slate-400">
                        /{summary.totalClaims}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('Needs Human Review')}
                    className="p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-xs font-medium text-slate-500">
                      {t.kpi.needsReview}
                    </div>
                    <div className="text-2xl font-display font-semibold text-indigo-700 tabular-nums mt-1">
                      {summary.needsHumanReviewCount}
                      <span className="text-sm font-normal text-slate-400">
                        /{summary.totalClaims}
                      </span>
                    </div>
                  </button>
                </div>
              )}

              {/* Evidence Report & Quick Fuji Anchor Strip */}
              {workspace.evidenceReport && (
                <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-semibold text-slate-900">
                      Evidence Report {workspace.evidenceReport.reportId}
                    </span>
                    <span className="font-mono text-slate-600 truncate max-w-md">
                      SHA-256: {workspace.evidenceReport.reportHash}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {workspace.fujiAnchor ? (
                      <>
                        <span className="text-xs font-mono text-emerald-700">
                          Tx: {workspace.fujiAnchor.txHash.slice(0, 12)}...
                          {workspace.fujiAnchor.txHash.slice(-6)}
                        </span>
                        <a
                          href={workspace.fujiAnchor.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                        >
                          <span>{t.fuji.openExplorer}</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isAnchoring}
                        onClick={() => handleAnchorFuji()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors whitespace-nowrap"
                      >
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {isAnchoring ? t.fuji.anchoring : t.fuji.anchorBtn}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Main Full-Width Claims Grid (zero horizontal overflow on desktop) */}
              <ClaimsTable
                claims={claims}
                selectedClaimId={selectedClaimId}
                onSelectClaim={setSelectedClaimId}
                statusFilter={statusFilter}
                onChangeFilter={setStatusFilter}
                searchQuery={searchQuery}
                onChangeSearch={setSearchQuery}
                lang={lang}
              />

              {/* Audit Inspector + Buyer Final Decision Row */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 min-w-0">
                  <ClaimInspector
                    claim={selectedClaim}
                    lang={lang}
                    onClose={() => setSelectedClaimId(null)}
                    onSubmitHitl={handleSubmitHitl}
                  />
                </div>
                <div className="lg:col-span-5 min-w-0">
                  <BuyerDecisionBar
                    report={workspace.evidenceReport}
                    buyerDecision={workspace.buyerDecision}
                    lang={lang}
                    onSubmitDecision={handleBuyerDecision}
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'evidence' && (
            <EvidenceFujiView
              report={workspace.evidenceReport}
              fujiAnchor={workspace.fujiAnchor}
              anchorHistory={workspace.anchorHistory}
              lang={lang}
              onAnchorFuji={handleAnchorFuji}
            />
          )}

          {activeTab === 'seller' && (
            <SellerGroundTruthView
              sellerClaims={workspace.sellerClaims}
              groundTruth={workspace.groundTruth}
              lang={lang}
              isVerifying={isVerifying}
              onSubmitCustomClaims={handleRunVerification}
            />
          )}
        </main>
      </div>
    </div>
  );
}
