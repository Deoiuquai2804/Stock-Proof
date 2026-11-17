import { useState } from 'react';
import {
  Blocks,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import type { AppRoute } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import type { ReportRecord } from '../types/stockproof';

interface EvidencePageProps {
  reports: ReportRecord[];
  activeReportId: string;
  onSelectReport: (reportId: string) => void;
  onNavigate: (route: AppRoute) => void;
}

export function EvidencePage({
  reports,
  activeReportId,
  onSelectReport,
  onNavigate,
}: EvidencePageProps) {
  const { getAuthHeaders } = useAuth();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const activeReport =
    reports.find((r) => r.id === activeReportId) || reports[0];
  const ev = activeReport?.evidence_report;

  const handleDownloadPdf = async () => {
    if (!activeReport) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/reports/${activeReport.id}/evidence.pdf`, {
        headers,
      });
      if (!res.ok) {
        throw new Error('Không thể tạo tệp PDF báo cáo bằng chứng.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeReport.id}-evidence-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Tải PDF thất bại.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleExportJson = () => {
    if (!ev) return;
    const blob = new Blob([JSON.stringify(ev, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ev.report_id}-evidence-report.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!activeReport || !ev) {
    return (
      <div className="bg-[#172033] border border-slate-800/80 rounded-xl p-8 text-center text-sm text-[#94A3B8]">
        Chưa có báo cáo bằng chứng nào. Hãy chọn hoặc tải lên báo cáo tài chính
        trước.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Exports */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-[#F8FAFC]">
              Hồ sơ bằng chứng kiểm toán
            </h1>
            {ev.is_demo_data && (
              <span className="text-xs font-medium text-[#F59E0B]">
                DỮ LIỆU MẪU
              </span>
            )}
          </div>
          <p className="text-xs text-[#94A3B8] mt-1">
            Báo cáo bằng chứng 15 phần chuẩn hóa kèm mã băm SHA-256 của tài
            liệu và gói bằng chứng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            aria-label="Chọn báo cáo để xem bằng chứng"
            value={activeReport.id}
            onChange={(e) => onSelectReport(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#172033] border border-slate-700 text-xs text-[#F8FAFC]"
          >
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} ({r.ticker})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-60 text-xs font-medium text-white whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{downloadingPdf ? 'Đang tạo PDF...' : 'Tải PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#172033] hover:bg-slate-800 text-xs font-medium text-[#F8FAFC] whitespace-nowrap shrink-0"
          >
            <FileJson className="h-3.5 w-3.5 text-[#06B6D4]" />
            <span>Xuất JSON</span>
          </button>
        </div>
      </div>

      {pdfError && (
        <div className="text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
          {pdfError}
        </div>
      )}

      {/* Sections 1-8: Metadata, Hashes & Summary */}
      <section className="bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <FileText className="h-4 w-4 text-[#3B82F6]" />
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            Phần 1–8: Định danh báo cáo, Mã băm SHA-256 & Tổng hợp xác minh
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-[#94A3B8]">1. Mã báo cáo</div>
            <div className="font-mono text-[#F8FAFC] mt-0.5">{ev.report_id}</div>
          </div>
          <div>
            <div className="text-[#94A3B8]">2. Doanh nghiệp & Mã CK</div>
            <div className="text-[#F8FAFC] font-medium mt-0.5">
              {ev.company} ({ev.exchange}: {ev.ticker})
            </div>
          </div>
          <div>
            <div className="text-[#94A3B8]">3. Kỳ & Loại báo cáo</div>
            <div className="text-[#F8FAFC] mt-0.5">
              {ev.reporting_period} ·{' '}
              {ev.report_type === 'Consolidated' ? 'Hợp nhất' : 'Công ty mẹ'}
            </div>
          </div>
          <div>
            <div className="text-[#94A3B8]">4. Thời điểm xác minh</div>
            <div className="font-mono text-[#CBD5E1] mt-0.5">
              {new Date(ev.verification_timestamp).toLocaleString('vi-VN')}
            </div>
          </div>
          <div>
            <div className="text-[#94A3B8]">5. Phiên bản & Ngưỡng sai số</div>
            <div className="font-mono text-[#CBD5E1] mt-0.5">
              {ev.verification_engine_version} (+/-{ev.tolerance_percent}%)
            </div>
          </div>
          <div>
            <div className="text-[#94A3B8]">8. Trạng thái tổng thể</div>
            <div className="mt-0.5">
              <StatusBadge status={ev.summary.overall_status} compact />
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[#94A3B8]">6. Mã băm SHA-256 tài liệu</div>
            <div className="font-mono text-[#06B6D4] break-all mt-0.5">
              {ev.document_hash}
            </div>
          </div>
          <div className="md:col-span-4">
            <div className="text-[#94A3B8]">
              7. Mã băm SHA-256 gói bằng chứng
            </div>
            <div className="font-mono text-[#22C55E] break-all mt-0.5">
              {ev.evidence_hash}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-800 text-xs tabular-nums">
          <div>
            <span className="text-[#94A3B8]">Tổng chỉ tiêu:</span>{' '}
            <span className="font-semibold text-[#F8FAFC]">
              {ev.summary.total_claims}
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8]">Đã xác minh:</span>{' '}
            <span className="font-semibold text-[#22C55E]">
              {ev.summary.verified}
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8]">Sai lệch:</span>{' '}
            <span className="font-semibold text-[#EF4444]">
              {ev.summary.mismatch}
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8]">Thiếu bằng chứng:</span>{' '}
            <span className="font-semibold text-[#F59E0B]">
              {ev.summary.insufficient_evidence}
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8]">Cần duyệt:</span>{' '}
            <span className="font-semibold text-[#06B6D4]">
              {ev.summary.needs_human_review}
            </span>
          </div>
        </div>
      </section>

      {/* Sections 9-12: Claim Results, Formulas, Citations & Rule Failure Reasons */}
      <section className="bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#F8FAFC]">
          Phần 9–12: Kết quả từng chỉ tiêu, Công thức, Nguồn trích dẫn & Quy tắc
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[#94A3B8]">
                <th className="py-2.5 pr-3 font-medium">Chỉ tiêu</th>
                <th className="py-2.5 pr-3 font-medium">Seller vs Đối chiếu</th>
                <th className="py-2.5 pr-3 font-medium">Công thức / Tính lại</th>
                <th className="py-2.5 pr-3 font-medium">Nguồn trích dẫn</th>
                <th className="py-2.5 pr-3 font-medium">Kết quả</th>
                <th className="py-2.5 font-medium">Giải thích quy tắc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {ev.claims.map((c) => (
                <tr key={c.claim_id} className="align-top">
                  <td className="py-3 pr-3 whitespace-nowrap">
                    <div className="font-mono text-[#CBD5E1]">{c.claim_id}</div>
                    <div className="font-medium text-[#F8FAFC]">{c.metric}</div>
                    <div className="text-[11px] text-[#94A3B8]">
                      {c.verification_source === 'HUMAN_APPROVED'
                        ? 'KIỂM TOÁN DUYỆT'
                        : 'ĐỐI CHIẾU TỰ ĐỘNG'}
                    </div>
                  </td>
                  <td className="py-3 pr-3 font-mono tabular-nums whitespace-nowrap">
                    <div className="text-[#F8FAFC]">
                      Seller:{' '}
                      {c.reported_value !== null
                        ? `${c.reported_value.toLocaleString()} ${c.unit}`
                        : 'N/A'}
                    </div>
                    <div className="text-[#94A3B8]">
                      Chuẩn:{' '}
                      {c.reference_value !== null
                        ? `${c.reference_value.toLocaleString()} ${c.reference_unit}`
                        : 'N/A'}
                    </div>
                    <div className="text-[11px] text-[#06B6D4]">
                      Lệch: {c.difference_label}
                    </div>
                  </td>
                  <td className="py-3 pr-3 font-mono text-[11px] text-[#CBD5E1]">
                    <div>{c.formula || 'Chỉ tiêu trực tiếp'}</div>
                    {c.recalculated_formula_value !== null && (
                      <div className="text-[#06B6D4]">
                        Tính lại: {c.recalculated_formula_value}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-[#CBD5E1] max-w-[180px]">
                    <div className="break-all">
                      {c.source_document || 'Không có'}
                    </div>
                    <div className="text-[11px] text-[#94A3B8]">
                      Trang {c.source_page ?? 'N/A'} ·{' '}
                      {c.source_location || 'Chưa xác định vị trí'}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <StatusBadge status={c.status} compact />
                    <div className="text-[11px] font-mono text-[#94A3B8] mt-1">
                      {c.validation_rule}
                    </div>
                  </td>
                  <td className="py-3 text-[#CBD5E1] max-w-[260px] [overflow-wrap:anywhere] leading-relaxed">
                    {c.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sections 13-15: Human Reviews, Blockchain Record & Immutability Disclaimer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            Phần 13: Nhật ký kiểm toán viên duyệt thủ công (HITL)
          </h2>
          {ev.human_reviews.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">
              Chưa có chỉnh sửa hoặc phê duyệt thủ công nào cho báo cáo này.
            </p>
          ) : (
            <div className="space-y-3">
              {ev.human_reviews.map((hr) => (
                <div
                  key={hr.id}
                  className="bg-[#111827] border border-slate-800 rounded-lg p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[#06B6D4]">
                      {hr.claim_id} · {hr.decision}
                    </span>
                    <span className="text-[11px] text-[#94A3B8]">
                      {new Date(hr.created_at).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  <div className="text-[#F8FAFC] font-medium">
                    Kiểm toán viên: {hr.reviewer_name}
                  </div>
                  <div className="text-[#CBD5E1]">{hr.comment}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#F8FAFC]">
              Phần 14: Bản ghi xác minh Blockchain
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('/blockchain')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#3B82F6] hover:text-[#60A5FA]"
            >
              <Blocks className="h-3.5 w-3.5" />
              <span>Quản lý On-Chain</span>
            </button>
          </div>

          {ev.blockchain_record ? (
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Mạng lưới</span>
                <span className="text-[#F8FAFC]">
                  {ev.blockchain_record.network} (ID{' '}
                  {ev.blockchain_record.chain_id})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#94A3B8]">Chế độ</span>
                <span
                  className={
                    ev.blockchain_record.mode === 'LIVE_FUJI_WALLET'
                      ? 'text-[#22C55E]'
                      : 'text-[#F59E0B]'
                  }
                >
                  {ev.blockchain_record.mode === 'LIVE_FUJI_WALLET'
                    ? 'Fuji Testnet thực tế'
                    : 'Mô phỏng Demo'}
                </span>
              </div>
              <div>
                <span className="text-[#94A3B8] block">Mã giao dịch (Tx Hash)</span>
                <span className="font-mono text-[#CBD5E1] break-all">
                  {ev.blockchain_record.transaction_hash}
                </span>
              </div>
              {ev.blockchain_record.explorer_url && (
                <a
                  href={ev.blockchain_record.explorer_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#3B82F6] hover:underline"
                >
                  <span>Xem trên Snowtrace Fuji Explorer</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-xs text-[#94A3B8]">
              Báo cáo bằng chứng này chưa được ghi nhận lên Avalanche Fuji
              Testnet.
            </p>
          )}
        </section>
      </div>

      {/* Section 15: Scope & Immutability Disclaimer */}
      <section className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex items-start gap-3 text-xs text-[#94A3B8]">
        <ShieldAlert className="h-4 w-4 text-[#F59E0B] shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-[#F8FAFC]">
            Phần 15 — Tuyên bố phạm vi bất biến & xác minh:{' '}
          </span>
          Việc ghi nhận trên Blockchain chứng minh rằng bản ghi xác minh, mã băm
          SHA-256 của tài liệu và mã băm gói bằng chứng không bị thay đổi sau
          khi đăng ký. Hệ thống không tự động đảm bảo báo cáo tài chính gốc
          ban đầu hoàn toàn không có sai sót từ nguồn phát hành.
        </div>
      </section>
    </div>
  );
}
