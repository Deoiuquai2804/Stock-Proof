import {
  Activity,
  ArrowRight,
  Blocks,
  FileCheck2,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { DonutChart } from '../components/DonutChart';
import { StatusBadge } from '../components/StatusBadge';
import type { AppRoute } from '../components/Sidebar';
import type { WorkspacePayload } from '../types/stockproof';

interface DashboardPageProps {
  workspace: WorkspacePayload;
  activeReportId: string;
  onSelectReport: (reportId: string) => void;
  onNavigate: (route: AppRoute) => void;
}

export function DashboardPage({
  workspace,
  activeReportId,
  onSelectReport,
  onNavigate,
}: DashboardPageProps) {
  const activeReport =
    workspace.reports.find((r) => r.id === activeReportId) ||
    workspace.reports[0];

  const summary = activeReport?.evidence_report?.summary ?? {
    total_claims: 0,
    verified: 0,
    mismatch: 0,
    insufficient_evidence: 0,
    needs_human_review: 0,
    overall_status: 'PENDING_REVIEW' as const,
  };

  const latestBc =
    activeReport?.blockchain_record || workspace.blockchain_records[0] || null;

  const kpis = [
    {
      label: 'Tổng số chỉ tiêu',
      value: summary.total_claims,
      accent: 'text-[#F8FAFC]',
      sub: activeReport
        ? `${activeReport.ticker} · ${activeReport.reporting_period}`
        : 'Chưa có báo cáo',
    },
    {
      label: 'Đã xác minh',
      value: summary.verified,
      accent: 'text-[#22C55E]',
      sub: 'Khớp số liệu & hợp lệ công thức',
    },
    {
      label: 'Sai lệch',
      value: summary.mismatch,
      accent: 'text-[#EF4444]',
      sub: 'Sai số liệu, kỳ báo cáo hoặc công thức',
    },
    {
      label: 'Thiếu bằng chứng',
      value: summary.insufficient_evidence,
      accent: 'text-[#F59E0B]',
      sub: 'Thiếu nguồn tài liệu hoặc trích dẫn',
    },
    {
      label: 'Cần duyệt thủ công',
      value: summary.needs_human_review,
      accent: 'text-[#06B6D4]',
      sub: 'Ghi chú mơ hồ hoặc có xung đột',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Pipeline Overview */}
      <section className="bg-[#172033] border border-slate-800/80 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8]">
            <span className="font-medium text-[#3B82F6]">
              Hệ thống xác minh StockProof
            </span>
            <span>·</span>
            <span>Kiểm toán theo từng chỉ tiêu</span>
            {activeReport?.is_demo_data && (
              <>
                <span>·</span>
                <span className="text-[#F59E0B] font-medium">DỮ LIỆU MẪU</span>
              </>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F8FAFC] text-balance">
            Dữ liệu tài chính. Xác minh độc lập.
          </h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Buyer Agent → Seller Agent → Bộ máy xác minh StockProof → Báo cáo
            bằng chứng → Bản ghi Blockchain. Từng chỉ tiêu trích xuất đều được
            đối chiếu theo quy tắc xác định trước khi lưu mã băm bất biến.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('/upload')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="h-4 w-4" />
            <span>Tải báo cáo lên</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/verification')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-sm font-medium text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
          >
            <FileCheck2 className="h-4 w-4 text-[#06B6D4]" />
            <span>Kiểm tra chỉ tiêu</span>
            <ArrowRight className="h-4 w-4 text-[#94A3B8]" />
          </button>
        </div>
      </section>

      {/* 5 KPI Summary Cards */}
      <section
        aria-label="Chỉ số tổng quan xác minh"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-[#172033] border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between gap-2"
          >
            <div className="text-xs font-medium text-[#94A3B8]">
              {kpi.label}
            </div>
            <div
              className={`text-3xl font-semibold tracking-tight tabular-nums ${kpi.accent}`}
            >
              {kpi.value}
            </div>
            <div className="text-[11px] text-[#94A3B8] truncate">{kpi.sub}</div>
          </div>
        ))}
      </section>

      {/* Chart + Blockchain Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#F8FAFC]">
                Thống kê xác minh
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Phân bổ trạng thái chỉ tiêu của báo cáo hiện tại (
                {activeReport?.id || 'Không có'})
              </p>
            </div>
            {activeReport && (
              <StatusBadge status={activeReport.status} compact />
            )}
          </div>
          <DonutChart
            verified={summary.verified}
            mismatch={summary.mismatch}
            insufficient={summary.insufficient_evidence}
            needsReview={summary.needs_human_review}
          />
        </section>

        <section className="lg:col-span-5 bg-[#172033] border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Blocks className="h-4 w-4 text-[#06B6D4]" />
                <h2 className="text-base font-semibold text-[#F8FAFC]">
                  Trạng thái Blockchain
                </h2>
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  workspace.blockchain_status.connected
                    ? 'text-[#22C55E]'
                    : 'text-[#F59E0B]'
                }`}
              >
                {workspace.blockchain_status.connected
                  ? 'Đã kết nối RPC'
                  : 'Chưa kết nối'}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-[#94A3B8]">Mạng lưới</span>
                <span className="text-[#F8FAFC] font-medium">
                  {workspace.blockchain_status.network} (ID{' '}
                  {workspace.blockchain_status.chain_id})
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-[#94A3B8]">Hợp đồng Registry</span>
                <span className="font-mono text-[#CBD5E1]">
                  {workspace.blockchain_status.contract_address.slice(0, 10)}...
                  {workspace.blockchain_status.contract_address.slice(-6)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/70">
                <span className="text-[#94A3B8]">Bản ghi mới nhất</span>
                <span className="font-mono text-[#CBD5E1] truncate max-w-[190px]">
                  {latestBc ? latestBc.transaction_hash : 'Chưa ghi nhận'}
                </span>
              </div>
              {latestBc && (
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-[#94A3B8]">Chế độ ghi</span>
                  <span
                    className={`font-medium ${
                      latestBc.mode === 'LIVE_FUJI_WALLET'
                        ? 'text-[#22C55E]'
                        : 'text-[#F59E0B]'
                    }`}
                  >
                    {latestBc.mode === 'LIVE_FUJI_WALLET'
                      ? 'Fuji Testnet thực tế'
                      : 'Mô phỏng Demo'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/70">
            <span className="text-[11px] text-[#94A3B8]">
              Chỉ lưu mã băm — không đưa báo cáo gốc lên chuỗi.
            </span>
            <button
              type="button"
              onClick={() => onNavigate('/blockchain')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA] whitespace-nowrap shrink-0"
            >
              <span>Mở sổ cái</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Recent Reports & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#F8FAFC]">
              Báo cáo gần đây
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/reports')}
              className="text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA] whitespace-nowrap"
            >
              Xem tất cả báo cáo
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[#94A3B8]">
                  <th className="py-2.5 pr-3 font-medium">Mã báo cáo</th>
                  <th className="py-2.5 pr-3 font-medium">Doanh nghiệp</th>
                  <th className="py-2.5 pr-3 font-medium">Kỳ</th>
                  <th className="py-2.5 pr-3 font-medium">Chỉ tiêu</th>
                  <th className="py-2.5 pr-3 font-medium">Trạng thái</th>
                  <th className="py-2.5 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {workspace.reports.slice(0, 5).map((rep) => (
                  <tr key={rep.id} className="hover:bg-[#111827]/50">
                    <td className="py-3 pr-3 font-mono text-[#CBD5E1] whitespace-nowrap">
                      {rep.id}
                    </td>
                    <td className="py-3 pr-3 text-[#F8FAFC] font-medium">
                      <div className="truncate max-w-[180px]">
                        {rep.company_name}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-[#94A3B8] whitespace-nowrap">
                      {rep.reporting_period}
                    </td>
                    <td className="py-3 pr-3 tabular-nums text-[#F8FAFC]">
                      {rep.extracted_claims.length}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={rep.status} compact />
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectReport(rep.id);
                          onNavigate('/verification');
                        }}
                        className="text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA]"
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-5 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#3B82F6]" />
            <h2 className="text-base font-semibold text-[#F8FAFC]">
              Hoạt động xác minh gần đây
            </h2>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {workspace.activities.slice(0, 8).map((act) => {
              const dotColor =
                act.status === 'verified'
                  ? 'bg-[#22C55E]'
                  : act.status === 'error'
                    ? 'bg-[#EF4444]'
                    : act.status === 'warning'
                      ? 'bg-[#F59E0B]'
                      : 'bg-[#3B82F6]';
              return (
                <div
                  key={act.id}
                  className="flex items-start gap-3 pb-3 border-b border-slate-800/60 last:border-b-0 last:pb-0"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dotColor}`}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-medium text-[#F8FAFC]">
                      {act.title}
                    </div>
                    <div className="text-xs text-[#94A3B8] leading-relaxed">
                      {act.description}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {new Date(act.timestamp).toLocaleString('vi-VN')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Immutability scope note */}
      <div className="flex items-center gap-2.5 text-xs text-[#94A3B8] px-1">
        <ShieldCheck className="h-4 w-4 text-[#06B6D4] shrink-0" />
        <span>
          Bản ghi Blockchain chứng minh kết quả xác minh và mã băm bằng chứng
          không bị sửa đổi sau khi ghi nhận; không chứng thực dữ liệu nguồn gốc
          tuyệt đối đúng.
        </span>
      </div>
    </div>
  );
}
