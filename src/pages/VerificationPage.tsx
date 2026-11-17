import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import type { AppRoute } from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import type {
  HumanReviewRecord,
  ReportRecord,
  VerificationResultItem,
  VerificationStatus,
} from '../types/stockproof';

interface VerificationPageProps {
  reports: ReportRecord[];
  activeReportId: string;
  tolerancePercent: number;
  onSelectReport: (reportId: string) => void;
  onReportUpdated: (report: ReportRecord) => void;
  onNavigate: (route: AppRoute) => void;
}

const FILTER_OPTIONS: Array<{ value: 'ALL' | VerificationStatus; label: string }> =
  [
    { value: 'ALL', label: 'Tất cả' },
    { value: 'VERIFIED', label: 'Đã xác minh' },
    { value: 'MISMATCH', label: 'Sai lệch' },
    { value: 'INSUFFICIENT EVIDENCE', label: 'Thiếu bằng chứng' },
    { value: 'NEEDS HUMAN REVIEW', label: 'Cần duyệt thủ công' },
  ];

export function VerificationPage({
  reports,
  activeReportId,
  tolerancePercent,
  onSelectReport,
  onReportUpdated,
  onNavigate,
}: VerificationPageProps) {
  const { user, getAuthHeaders } = useAuth();
  const activeReport =
    reports.find((r) => r.id === activeReportId) || reports[0];

  const results = activeReport?.verification_results ?? [];
  const summary = activeReport?.evidence_report?.summary ?? {
    total_claims: 0,
    verified: 0,
    mismatch: 0,
    insufficient_evidence: 0,
    needs_human_review: 0,
    overall_status: 'PENDING_REVIEW' as const,
  };

  const [statusFilter, setStatusFilter] = useState<'ALL' | VerificationStatus>(
    'ALL',
  );
  const [selectedClaimId, setSelectedClaimId] = useState<string>(
    results[0]?.claim_id ?? '',
  );

  // HITL Form State
  const [reviewerName, setReviewerName] = useState(
    user?.displayName || 'Nguyễn Minh Tuấn, CPA',
  );
  const [updatedValueStr, setUpdatedValueStr] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (
      results.length > 0 &&
      !results.some((r) => r.claim_id === selectedClaimId)
    ) {
      setSelectedClaimId(results[0].claim_id);
    }
  }, [activeReport?.id, results, selectedClaimId]);

  const selectedClaim: VerificationResultItem | undefined = results.find(
    (r) => r.claim_id === selectedClaimId,
  );

  useEffect(() => {
    if (selectedClaim) {
      setUpdatedValueStr(
        selectedClaim.reported_value !== null
          ? String(selectedClaim.reported_value)
          : '',
      );
      setReviewComment(selectedClaim.human_review?.comment || '');
      setReviewError(null);
      setReviewSuccess(null);
    }
  }, [selectedClaimId, selectedClaim?.reported_value]);

  const filteredClaims = results.filter(
    (c) => statusFilter === 'ALL' || c.status === statusFilter,
  );

  const handleSubmitReview = async (
    decision: HumanReviewRecord['decision'],
  ) => {
    if (!activeReport || !selectedClaim) return;
    if (!reviewerName.trim() || !reviewComment.trim()) {
      setReviewError('Vui lòng nhập tên kiểm toán viên và nhận xét kiểm tra.');
      return;
    }

    setSubmittingReview(true);
    setReviewError(null);
    setReviewSuccess(null);

    try {
      const authHeaders = await getAuthHeaders();
      const parsedVal =
        updatedValueStr.trim() === '' ? null : Number(updatedValueStr);
      const bodyPayload: Record<string, unknown> = {
        reviewer_id: user?.uid || 'auditor-demo-01',
        reviewer_name: reviewerName.trim(),
        decision,
        comment: reviewComment.trim(),
      };
      if (parsedVal !== null && Number.isFinite(parsedVal)) {
        bodyPayload.updated_value = parsedVal;
      }

      const res = await fetch(
        `/api/reports/${activeReport.id}/claims/${selectedClaim.claim_id}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify(bodyPayload),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lưu đánh giá HITL thất bại.');
      }

      if (data.report) {
        onReportUpdated(data.report as ReportRecord);
      }
      setReviewSuccess(
        `Đã ghi nhận quyết định duyệt thủ công (${decision}) — đánh dấu kiểm toán viên phê duyệt trong nhật ký.`,
      );
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : 'Không thể lưu đánh giá.',
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  if (!activeReport) {
    return (
      <div className="bg-[#172033] border border-slate-800/80 rounded-xl p-8 text-center text-sm text-[#94A3B8]">
        Chưa có báo cáo tài chính nào. Hãy tải báo cáo lên để bắt đầu xác minh.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Report Selector */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-[#F8FAFC]">
              Kết quả xác minh
            </h1>
            {activeReport.is_demo_data && (
              <span className="text-xs font-medium text-[#F59E0B]">
                DỮ LIỆU MẪU
              </span>
            )}
          </div>
          <p className="text-xs text-[#94A3B8] mt-1">
            {activeReport.company_name} ({activeReport.exchange}:{' '}
            {activeReport.ticker}) · {activeReport.reporting_period} ·{' '}
            {activeReport.report_type === 'Consolidated'
              ? 'Hợp nhất'
              : 'Công ty mẹ'}{' '}
            · Ngưỡng sai số +/-{tolerancePercent}%
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            aria-label="Chọn báo cáo cần kiểm tra"
            value={activeReport.id}
            onChange={(e) => onSelectReport(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#172033] border border-slate-700 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#3B82F6]"
          >
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} ({r.ticker} · {r.reporting_period})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onNavigate('/evidence')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] text-xs font-medium text-white whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Báo cáo bằng chứng</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Top Summary Bar */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          {
            label: 'Tổng chỉ tiêu',
            value: summary.total_claims,
            color: 'text-[#F8FAFC]',
          },
          {
            label: 'Đã xác minh',
            value: summary.verified,
            color: 'text-[#22C55E]',
          },
          {
            label: 'Sai lệch',
            value: summary.mismatch,
            color: 'text-[#EF4444]',
          },
          {
            label: 'Thiếu bằng chứng',
            value: summary.insufficient_evidence,
            color: 'text-[#F59E0B]',
          },
          {
            label: 'Cần duyệt thủ công',
            value: summary.needs_human_review,
            color: 'text-[#06B6D4]',
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[#172033] border border-slate-800/80 rounded-xl px-4 py-3"
          >
            <div className="text-[11px] text-[#94A3B8]">{item.label}</div>
            <div
              className={`text-2xl font-semibold tabular-nums mt-0.5 ${item.color}`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </section>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              statusFilter === opt.value
                ? 'bg-[#3B82F6] text-white'
                : 'bg-[#172033] text-[#94A3B8] hover:text-[#F8FAFC] border border-slate-800'
            }`}
          >
            {opt.value === 'ALL' ? `${opt.label} (${results.length})` : opt.label}
          </button>
        ))}
      </div>

      {/* Main Claims Table */}
      <div className="bg-[#172033] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[#94A3B8] bg-[#111827]/60">
                <th className="py-3 px-3.5 font-medium">Mã</th>
                <th className="py-3 px-3.5 font-medium">Chỉ tiêu tài chính</th>
                <th className="py-3 px-3.5 font-medium">Giá trị Seller</th>
                <th className="py-3 px-3.5 font-medium">Giá trị đối chiếu</th>
                <th className="py-3 px-3.5 font-medium">Chênh lệch</th>
                <th className="py-3 px-3.5 font-medium">Trạng thái</th>
                <th className="py-3 px-3.5 font-medium text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredClaims.map((c) => {
                const isSelected = c.claim_id === selectedClaim?.claim_id;
                return (
                  <tr
                    key={c.claim_id}
                    onClick={() => setSelectedClaimId(c.claim_id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#3B82F6]/12'
                        : 'hover:bg-[#111827]/50'
                    }`}
                  >
                    <td className="py-3 px-3.5 font-mono text-[#CBD5E1] whitespace-nowrap">
                      <div>{c.claim_id}</div>
                      {c.verification_source === 'HUMAN_APPROVED' && (
                        <span className="text-[10px] font-sans text-[#06B6D4]">
                          KIỂM TOÁN DUYỆT
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="font-medium text-[#F8FAFC]">{c.metric}</div>
                      <div className="text-[11px] text-[#94A3B8]">
                        {c.period} · {c.validation_rule}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 font-mono tabular-nums text-[#F8FAFC] whitespace-nowrap">
                      {c.reported_value !== null
                        ? `${c.reported_value.toLocaleString()} ${c.unit}`
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-3.5 font-mono tabular-nums text-[#CBD5E1] whitespace-nowrap">
                      {c.reference_value !== null
                        ? `${c.reference_value.toLocaleString()} ${c.reference_unit}`
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-3.5 font-mono tabular-nums text-[#94A3B8] whitespace-nowrap">
                      {c.difference_label}
                    </td>
                    <td className="py-3 px-3.5">
                      <StatusBadge status={c.status} compact />
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClaimId(c.claim_id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-[#F8FAFC]"
                      >
                        <Eye className="h-3 w-3 text-[#3B82F6]" />
                        <span>Kiểm tra</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Claim Split Detail Panel & HITL Review */}
      {selectedClaim && (
        <section
          aria-label="Chi tiết đối chiếu chỉ tiêu"
          className="bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-[#3B82F6]">
                  {selectedClaim.claim_id}
                </span>
                <h2 className="text-base font-semibold text-[#F8FAFC]">
                  {selectedClaim.metric}
                </h2>
                <StatusBadge status={selectedClaim.status} />
                <span className="text-[11px] font-mono text-[#94A3B8]">
                  [
                  {selectedClaim.verification_source === 'HUMAN_APPROVED'
                    ? 'KIỂM TOÁN VIÊN DUYỆT'
                    : 'ĐỐI CHIẾU TỰ ĐỘNG'}
                  ]
                </span>
              </div>
              <p className="text-xs text-[#94A3B8]">
                Quy tắc áp dụng: {selectedClaim.validation_rule} · Thời gian kiểm
                tra: {new Date(selectedClaim.timestamp).toLocaleString('vi-VN')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedClaimId('')}
              aria-label="Đóng bảng chi tiết"
              className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-slate-800 self-start sm:self-center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* LEFT vs RIGHT Split Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* LEFT: Seller Agent Data */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#3B82F6]">
                Dữ liệu Seller Agent báo cáo
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[#94A3B8]">Giá trị trích xuất</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#F8FAFC] mt-0.5">
                    {selectedClaim.reported_value !== null
                      ? `${selectedClaim.reported_value.toLocaleString()} ${selectedClaim.unit}`
                      : 'Chưa cung cấp'}
                  </div>
                </div>
                <div>
                  <div className="text-[#94A3B8]">Giá trị đã quy đổi</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#CBD5E1] mt-0.5">
                    {selectedClaim.normalized_reported_value !== null
                      ? `${selectedClaim.normalized_reported_value.toLocaleString()} ${selectedClaim.reference_unit}`
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[#94A3B8]">Kỳ báo cáo</div>
                  <div className="text-[#F8FAFC] mt-0.5">
                    {selectedClaim.period}
                  </div>
                </div>
                <div>
                  <div className="text-[#94A3B8]">Loại báo cáo</div>
                  <div className="text-[#F8FAFC] mt-0.5">
                    {selectedClaim.report_type === 'Consolidated'
                      ? 'Hợp nhất'
                      : 'Công ty mẹ'}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                <div className="text-[#94A3B8]">Nguồn & Trích dẫn</div>
                <div className="text-[#F8FAFC]">
                  {selectedClaim.source_document ||
                    'Không có tài liệu trích dẫn'}
                  {selectedClaim.source_page
                    ? ` (Trang ${selectedClaim.source_page})`
                    : ''}
                  {selectedClaim.source_location
                    ? ` — ${selectedClaim.source_location}`
                    : ''}
                </div>
                <div className="text-[#94A3B8] pt-1">Nội dung bằng chứng</div>
                <div className="text-[#CBD5E1] leading-relaxed">
                  {selectedClaim.evidence || 'Không có đoạn trích dẫn bằng chứng.'}
                </div>
              </div>
            </div>

            {/* RIGHT: Reference Data & Formula Recalculation */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#06B6D4]">
                Dữ liệu chuẩn & Tính toán lại công thức
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[#94A3B8]">Giá trị tham chiếu</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#F8FAFC] mt-0.5">
                    {selectedClaim.reference_value !== null
                      ? `${selectedClaim.reference_value.toLocaleString()} ${selectedClaim.reference_unit}`
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[#94A3B8]">Độ lệch / Chênh lệch</div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-[#CBD5E1] mt-0.5">
                    {selectedClaim.difference_label}
                  </div>
                </div>
                <div>
                  <div className="text-[#94A3B8]">Công thức</div>
                  <div className="font-mono text-[#F8FAFC] mt-0.5">
                    {selectedClaim.formula || 'Chỉ tiêu trực tiếp trên BCTC'}
                  </div>
                </div>
                <div>
                  <div className="text-[#94A3B8]">Kết quả tính lại</div>
                  <div className="font-mono tabular-nums text-[#06B6D4] mt-0.5">
                    {selectedClaim.recalculated_formula_value !== null
                      ? `${selectedClaim.recalculated_formula_value.toLocaleString()} ${selectedClaim.reference_unit}`
                      : 'N/A'}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                <div className="text-[#94A3B8]">Nguồn đối chiếu chuẩn</div>
                <div className="text-[#F8FAFC]">
                  {selectedClaim.reference_source || 'Không có'}
                  {selectedClaim.reference_page
                    ? ` (Trang ${selectedClaim.reference_page})`
                    : ''}
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM: Verification Explanation & Rules Breakdown */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#CBD5E1]">
              Giải thích kết quả xác minh
            </div>
            <p className="text-xs text-[#F8FAFC] leading-relaxed">
              {selectedClaim.explanation}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2">
              {selectedClaim.rules.map((rule) => (
                <div
                  key={rule.rule + rule.label}
                  className="flex items-start gap-2.5 text-xs bg-[#172033]/70 border border-slate-800/80 rounded-lg p-2.5"
                >
                  {rule.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-[#22C55E] shrink-0 mt-0.5" />
                  ) : rule.warning ? (
                    <AlertTriangle className="h-4 w-4 text-[#F59E0B] shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-[#EF4444] shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-[#F8FAFC]">
                      {rule.label}
                    </div>
                    <div className="text-[#94A3B8] text-[11px] leading-relaxed">
                      {rule.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Human-in-the-Loop (HITL) Review Panel */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-[#06B6D4]" />
                <h3 className="text-sm font-semibold text-[#F8FAFC]">
                  Kiểm toán viên duyệt thủ công (HITL)
                </h3>
              </div>
              {selectedClaim.human_review && (
                <span className="text-xs text-[#06B6D4] font-mono">
                  Đã duyệt bởi {selectedClaim.human_review.reviewer_name} ·{' '}
                  {selectedClaim.human_review.decision}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[#94A3B8] block">Tên kiểm toán viên</span>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#172033] border border-slate-700 text-[#F8FAFC]"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[#94A3B8] block">
                  Giá trị xác nhận / chỉnh sửa ({selectedClaim.unit})
                </span>
                <input
                  type="number"
                  step="any"
                  value={updatedValueStr}
                  onChange={(e) => setUpdatedValueStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#172033] border border-slate-700 text-[#F8FAFC] font-mono tabular-nums"
                />
              </label>

              <label className="space-y-1 sm:col-span-1">
                <span className="text-[#94A3B8] block">
                  Nhận xét kiểm toán (bắt buộc)
                </span>
                <input
                  type="text"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Ghi chú thuyết minh hoặc lý do duyệt..."
                  className="w-full px-3 py-2 rounded-lg bg-[#172033] border border-slate-700 text-[#F8FAFC]"
                />
              </label>
            </div>

            {reviewError && (
              <div className="text-xs text-[#EF4444]">{reviewError}</div>
            )}
            {reviewSuccess && (
              <div className="text-xs text-[#22C55E]">{reviewSuccess}</div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={submittingReview}
                onClick={() => handleSubmitReview('VERIFIED')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#22C55E]/15 hover:bg-[#22C55E]/25 border border-[#22C55E]/40 text-xs font-medium text-[#22C55E] whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Chấp nhận (Đã xác minh)</span>
              </button>

              <button
                type="button"
                disabled={submittingReview}
                onClick={() => handleSubmitReview('MISMATCH')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/40 text-xs font-medium text-[#EF4444] whitespace-nowrap shrink-0"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Từ chối (Sai lệch)</span>
              </button>

              <button
                type="button"
                disabled={submittingReview}
                onClick={() => handleSubmitReview('INSUFFICIENT EVIDENCE')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 border border-[#F59E0B]/40 text-xs font-medium text-[#F59E0B] whitespace-nowrap shrink-0"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Yêu cầu bổ sung bằng chứng</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
