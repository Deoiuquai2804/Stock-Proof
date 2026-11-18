import { useState } from 'react';
import { Blocks, FileCheck2, FileSpreadsheet, Search, Upload } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import type { AppRoute } from '../components/Sidebar';
import type { ReportRecord } from '../types/stockproof';

interface ReportsPageProps {
  reports: ReportRecord[];
  activeReportId: string;
  onSelectReport: (reportId: string) => void;
  onNavigate: (route: AppRoute) => void;
}

const FILTER_LABELS: Record<string, string> = {
  ALL: 'Tất cả',
  PENDING_REVIEW: 'Chờ duyệt HITL',
  MISMATCH: 'Có sai lệch',
  VERIFIED: 'Đã xác minh',
};

export function ReportsPage({
  reports,
  activeReportId,
  onSelectReport,
  onNavigate,
}: ReportsPageProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const filtered = reports.filter((r) => {
    const matchesStatus =
      statusFilter === 'ALL' || r.status.toUpperCase() === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      r.id.toLowerCase().includes(q) ||
      r.company_name.toLowerCase().includes(q) ||
      r.ticker.toLowerCase().includes(q) ||
      r.original_filename.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#F8FAFC]">
            Tất cả báo cáo
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Danh sách báo cáo tài chính đã tải lên, xem tóm tắt xác minh hoặc
            lưu mã băm lên Avalanche Fuji.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('/upload')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white whitespace-nowrap shrink-0 self-start"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Tải báo cáo lên</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#172033] border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo mã báo cáo, công ty, mã CK..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-xs text-[#F8FAFC] placeholder:text-slate-500 focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'PENDING_REVIEW', 'MISMATCH', 'VERIFIED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-[#3B82F6] text-white'
                  : 'bg-[#111827] text-[#94A3B8] hover:text-[#F8FAFC] border border-slate-800'
              }`}
            >
              {FILTER_LABELS[st]}
            </button>
          ))}
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-[#172033] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[#94A3B8] bg-[#111827]/60">
                <th className="py-3 px-3 font-medium">Mã báo cáo</th>
                <th className="py-3 px-3 font-medium">Doanh nghiệp</th>
                <th className="py-3 px-3 font-medium">Kỳ</th>
                <th className="py-3 px-3 font-medium">Mã băm</th>
                <th className="py-3 px-3 font-medium">Đ/S/T/H</th>
                <th className="py-3 px-3 font-medium">Trạng thái</th>
                <th className="py-3 px-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-xs text-[#94A3B8]"
                  >
                    {reports.length === 0
                      ? 'Chưa có báo cáo nào. Hãy tải lên báo cáo tài chính đầu tiên để bắt đầu xác minh.'
                      : 'Không có báo cáo nào phù hợp với bộ lọc hiện tại.'}
                  </td>
                </tr>
              ) : (
                filtered.map((rep) => {
                  const s = rep.evidence_report?.summary;
                  const isActive = rep.id === activeReportId;
                  return (
                    <tr
                      key={rep.id}
                      className={`hover:bg-[#111827]/50 ${
                        isActive ? 'bg-[#3B82F6]/5' : ''
                      }`}
                    >
                      <td className="py-3.5 px-3 font-mono text-[#CBD5E1] whitespace-nowrap">
                        <div>{rep.id}</div>
                      </td>
                      <td className="py-3.5 px-3 max-w-[210px]">
                        <div className="font-medium text-[#F8FAFC] truncate">
                          {rep.company_name}
                        </div>
                        <div className="text-[11px] text-[#94A3B8] truncate">
                          {rep.exchange}: {rep.ticker} · {rep.original_filename}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-[#CBD5E1] whitespace-nowrap">
                        <div>{rep.reporting_period}</div>
                        <div className="text-[11px] text-[#94A3B8]">
                          {rep.report_type === 'Consolidated'
                            ? 'Hợp nhất'
                            : 'Công ty mẹ'}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-[#94A3B8] whitespace-nowrap">
                        {rep.document_hash.slice(0, 12)}...
                      </td>
                      <td className="py-3.5 px-3 tabular-nums whitespace-nowrap">
                        {s ? (
                          <div className="flex items-center gap-1 font-mono">
                            <span className="text-[#22C55E]">{s.verified}</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-[#EF4444]">{s.mismatch}</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-[#F59E0B]">
                              {s.insufficient_evidence}
                            </span>
                            <span className="text-slate-600">/</span>
                            <span className="text-[#06B6D4]">
                              {s.needs_human_review}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        <StatusBadge status={rep.status} compact />
                      </td>
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectReport(rep.id);
                              onNavigate('/verification');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-[#F8FAFC]"
                          >
                            <FileCheck2 className="h-3 w-3 text-[#3B82F6]" />
                            <span>Xác minh</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectReport(rep.id);
                              onNavigate('/evidence');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-[#F8FAFC]"
                          >
                            <FileSpreadsheet className="h-3 w-3 text-[#06B6D4]" />
                            <span>Bằng chứng</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectReport(rep.id);
                              onNavigate('/blockchain');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-[#F8FAFC]"
                          >
                            <Blocks className="h-3 w-3 text-[#22C55E]" />
                            <span>Chuỗi</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
