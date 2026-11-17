import React, { useState } from 'react';
import { RefreshCw, Save, Shield, SlidersHorizontal } from 'lucide-react';
import type { ReferenceMetric } from '../types/stockproof';

interface SettingsPageProps {
  tolerancePercent: number;
  referenceDataset: ReferenceMetric[];
  onToleranceSaved: (newTolerance: number) => Promise<void>;
  onResetDemo: () => Promise<void>;
}

export function SettingsPage({
  tolerancePercent,
  referenceDataset,
  onToleranceSaved,
  onResetDemo,
}: SettingsPageProps) {
  const [toleranceInput, setToleranceInput] = useState(
    String(tolerancePercent),
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveTolerance = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(toleranceInput);
    if (!Number.isFinite(val) || val < 0 || val > 25) {
      setErrorMsg('Ngưỡng sai số phải nằm trong khoảng từ 0% đến 25%.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await onToleranceSaved(val);
      setFeedback(
        `Đã cập nhật ngưỡng sai số thành +/-${val}% và chạy xác minh lại các báo cáo.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Cập nhật ngưỡng sai số thất bại.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await onResetDemo();
      setFeedback(
        'Đã khôi phục không gian làm việc mẫu về kịch bản FPT FY2025 ban đầu.',
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Khôi phục thất bại.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#F8FAFC]">Cài đặt hệ thống</h1>
        <p className="text-xs text-[#94A3B8] mt-1">
          Cấu hình ngưỡng sai số cho bộ máy xác minh và kiểm tra bộ dữ liệu
          tham chiếu chuẩn của doanh nghiệp niêm yết Việt Nam.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-6 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#3B82F6]" />
            <h2 className="text-sm font-semibold text-[#F8FAFC]">
              Ngưỡng sai số xác minh
            </h2>
          </div>

          <form onSubmit={handleSaveTolerance} className="space-y-4">
            <label className="block space-y-1.5 text-xs">
              <span className="text-[#94A3B8] block">
                Sai số làm tròn số liệu cho phép (%)
              </span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="25"
                value={toleranceInput}
                onChange={(e) => setToleranceInput(e.target.value)}
                className="w-40 px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] font-mono tabular-nums"
              />
            </label>

            {errorMsg && <div className="text-xs text-[#EF4444]">{errorMsg}</div>}
            {feedback && <div className="text-xs text-[#22C55E]">{feedback}</div>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-60 text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Đang lưu...' : 'Lưu & Xác minh lại'}</span>
              </button>

              <button
                type="button"
                disabled={resetting}
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-[#CBD5E1] whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>
                  {resetting ? 'Đang khôi phục...' : 'Đặt lại kịch bản mẫu'}
                </span>
              </button>
            </div>
          </form>
        </section>

        <section className="lg:col-span-6 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#06B6D4]" />
            <h2 className="text-sm font-semibold text-[#F8FAFC]">
              Kiến trúc & Bảo mật khóa hệ thống
            </h2>
          </div>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Lớp AI trích xuất chỉ tiêu chạy ở phía máy chủ bằng biến môi trường
            bảo mật, trong khi kiểm tra đối chiếu số liệu thực hiện hoàn toàn
            độc lập bằng các quy tắc xác định TypeScript. Mọi khóa API, thông
            tin cơ sở dữ liệu và khóa ký giao dịch được quản lý qua biến môi
            trường máy chủ và ví EVM trên trình duyệt.
          </p>
        </section>
      </div>

      {/* Reference Dataset Table */}
      <section className="bg-[#172033] border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#F8FAFC]">
              Bộ dữ liệu tham chiếu chuẩn (DỮ LIỆU MẪU)
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Số liệu đối chiếu gốc của Công ty Cổ phần FPT (HOSE: FPT · FY2025
              Hợp nhất) được bộ máy xác minh sử dụng.
            </p>
          </div>
          <span className="text-xs font-medium text-[#F59E0B] whitespace-nowrap">
            DỮ LIỆU MẪU
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[#94A3B8] bg-[#111827]/60">
                <th className="py-3 px-4 font-medium">Chỉ tiêu</th>
                <th className="py-3 px-4 font-medium">Kỳ / Loại báo cáo</th>
                <th className="py-3 px-4 font-medium">Giá trị chuẩn</th>
                <th className="py-3 px-4 font-medium">Công thức</th>
                <th className="py-3 px-4 font-medium">Nguồn trích dẫn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {referenceDataset.map((ref) => (
                <tr key={ref.metric} className="hover:bg-[#111827]/40">
                  <td className="py-3 px-4 font-medium text-[#F8FAFC] whitespace-nowrap">
                    {ref.metric}
                  </td>
                  <td className="py-3 px-4 text-[#CBD5E1] whitespace-nowrap">
                    {ref.period} ·{' '}
                    {ref.report_type === 'Consolidated'
                      ? 'Hợp nhất'
                      : 'Công ty mẹ'}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-[#22C55E] whitespace-nowrap">
                    {ref.reference_value.toLocaleString()} {ref.unit}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-[#94A3B8]">
                    {ref.formula || 'Chỉ tiêu trực tiếp'}
                  </td>
                  <td className="py-3 px-4 text-[#94A3B8]">
                    {ref.source_document} (Tr.{ref.source_page}) —{' '}
                    {ref.source_location}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
