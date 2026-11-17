import { useCallback, useEffect, useState } from 'react';
import { Sidebar, type AppRoute } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BlockchainPage } from './pages/BlockchainPage';
import { DashboardPage } from './pages/DashboardPage';
import { EvidencePage } from './pages/EvidencePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UploadPage } from './pages/UploadPage';
import { VerificationPage } from './pages/VerificationPage';
import type {
  BlockchainRecord,
  ReportRecord,
  WorkspacePayload,
} from './types/stockproof';

const VALID_ROUTES: AppRoute[] = [
  '/dashboard',
  '/upload',
  '/reports',
  '/verification',
  '/evidence',
  '/blockchain',
  '/settings',
];

function resolveRouteFromPath(pathname: string): AppRoute {
  const cleaned = pathname.replace(/\/+$/, '') || '/dashboard';
  if (VALID_ROUTES.includes(cleaned as AppRoute)) {
    return cleaned as AppRoute;
  }
  return '/dashboard';
}

function StockProofAppShell() {
  const { user, loading: authLoading, getAuthHeaders } = useAuth();
  const [route, setRoute] = useState<AppRoute>(() =>
    resolveRouteFromPath(window.location.pathname),
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [activeReportId, setActiveReportId] = useState<string>('');
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    if (window.location.pathname !== nextRoute) {
      window.history.pushState({}, '', nextRoute);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const fetchWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch('/api/workspace', { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load StockProof workspace.');
      }
      const payload = data as WorkspacePayload;
      setWorkspace(payload);
      setActiveReportId((prev) =>
        prev && payload.reports.some((r) => r.id === prev)
          ? prev
          : payload.active_report_id || payload.reports[0]?.id || '',
      );
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Unable to reach StockProof API.',
      );
    } finally {
      setLoadingWorkspace(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!authLoading) {
      fetchWorkspace();
    }
  }, [authLoading, user?.uid, fetchWorkspace]);

  const handleReportUpdated = (updatedReport: ReportRecord) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const exists = prev.reports.some((r) => r.id === updatedReport.id);
      const nextReports = exists
        ? prev.reports.map((r) =>
            r.id === updatedReport.id ? updatedReport : r,
          )
        : [updatedReport, ...prev.reports];
      return {
        ...prev,
        active_report_id: updatedReport.id,
        reports: nextReports,
      };
    });
    setActiveReportId(updatedReport.id);
  };

  const handleRecordCreated = (
    updatedReport: ReportRecord,
    record: BlockchainRecord,
  ) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        reports: prev.reports.map((r) =>
          r.id === updatedReport.id ? updatedReport : r,
        ),
        blockchain_records: [record, ...prev.blockchain_records],
      };
    });
  };

  const handleToleranceSaved = async (newTolerance: number) => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/settings/tolerance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ tolerance_percent: newTolerance }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update tolerance.');
    await fetchWorkspace();
  };

  const handleResetDemo = async () => {
    const res = await fetch('/api/reset', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset demo scenario.');
    await fetchWorkspace();
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-[#F8FAFC] flex">
      <Sidebar
        currentRoute={route}
        onNavigate={navigate}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        activeReportId={activeReportId}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopNav
          currentRoute={route}
          onNavigate={navigate}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {loadingWorkspace && !workspace ? (
            <div className="bg-[#172033] border border-slate-800/80 rounded-xl p-10 text-center text-sm text-[#94A3B8]">
              Đang tải không gian làm việc xác minh StockProof...
            </div>
          ) : workspaceError ? (
            <div className="bg-[#172033] border border-[#EF4444]/40 rounded-xl p-6 space-y-3">
              <div className="text-sm font-semibold text-[#EF4444]">
                Lỗi tải dữ liệu hệ thống
              </div>
              <p className="text-xs text-[#CBD5E1]">{workspaceError}</p>
              <button
                type="button"
                onClick={fetchWorkspace}
                className="px-3.5 py-2 rounded-lg bg-[#3B82F6] text-xs font-medium text-white"
              >
                Thử kết nối lại
              </button>
            </div>
          ) : workspace ? (
            <>
              {route === '/dashboard' && (
                <DashboardPage
                  workspace={workspace}
                  activeReportId={activeReportId}
                  onSelectReport={setActiveReportId}
                  onNavigate={navigate}
                />
              )}

              {route === '/upload' && (
                <UploadPage
                  onReportUploaded={(rep) => {
                    handleReportUpdated(rep);
                    fetchWorkspace();
                  }}
                  onClaimsSaved={(rep) => {
                    handleReportUpdated(rep);
                    fetchWorkspace();
                  }}
                  onNavigate={navigate}
                />
              )}

              {route === '/reports' && (
                <ReportsPage
                  reports={workspace.reports}
                  activeReportId={activeReportId}
                  onSelectReport={setActiveReportId}
                  onNavigate={navigate}
                />
              )}

              {route === '/verification' && (
                <VerificationPage
                  reports={workspace.reports}
                  activeReportId={activeReportId}
                  tolerancePercent={workspace.tolerance_percent}
                  onSelectReport={setActiveReportId}
                  onReportUpdated={(rep) => {
                    handleReportUpdated(rep);
                    fetchWorkspace();
                  }}
                  onNavigate={navigate}
                />
              )}

              {route === '/evidence' && (
                <EvidencePage
                  reports={workspace.reports}
                  activeReportId={activeReportId}
                  onSelectReport={setActiveReportId}
                  onNavigate={navigate}
                />
              )}

              {route === '/blockchain' && (
                <BlockchainPage
                  reports={workspace.reports}
                  activeReportId={activeReportId}
                  blockchainStatus={workspace.blockchain_status}
                  blockchainRecords={workspace.blockchain_records}
                  onSelectReport={setActiveReportId}
                  onRecordCreated={(rep, rec) => {
                    handleRecordCreated(rep, rec);
                    fetchWorkspace();
                  }}
                />
              )}

              {route === '/settings' && (
                <SettingsPage
                  tolerancePercent={workspace.tolerance_percent}
                  referenceDataset={workspace.reference_dataset}
                  onToleranceSaved={handleToleranceSaved}
                  onResetDemo={handleResetDemo}
                />
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StockProofAppShell />
    </AuthProvider>
  );
}
