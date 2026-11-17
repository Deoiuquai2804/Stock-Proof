import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AppRoute } from '../components/Sidebar';
import type {
  FinancialClaimInput,
  ReportRecord,
  ReportType,
} from '../types/stockproof';

interface UploadPageProps {
  onReportUploaded: (report: ReportRecord) => void;
  onClaimsSaved: (report: ReportRecord) => void;
  onNavigate: (route: AppRoute) => void;
}

export function UploadPage({
  onReportUploaded,
  onClaimsSaved,
  onNavigate,
}: UploadPageProps) {
  const { getAuthHeaders } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [companyName, setCompanyName] = useState(
    'Công ty Cổ phần FPT (DỮ LIỆU MẪU)',
  );
  const [ticker, setTicker] = useState('FPT');
  const [reportingPeriod, setReportingPeriod] = useState('FY2025');
  const [reportType, setReportType] = useState<ReportType>('Consolidated');
  const [fiscalYear, setFiscalYear] = useState('2025');
  const [currency, setCurrency] = useState('VND');
  const [unit, setUnit] = useState('Tỷ VND');

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [analyzedReport, setAnalyzedReport] = useState<ReportRecord | null>(
    null,
  );
  const [extractorUsed, setExtractorUsed] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [editableClaims, setEditableClaims] = useState<FinancialClaimInput[]>(
    [],
  );
  const [savingClaims, setSavingClaims] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setSaveSuccess(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const handleLoadSampleCsv = async () => {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/sample-report?format=csv');
      if (!res.ok) throw new Error('Không thể tải tệp CSV mẫu.');
      const text = await res.text();
      const file = new File([text], 'FPT_FY2025_Sample_Claims.csv', {
        type: 'text/csv',
      });
      setSelectedFile(file);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể nạp tệp mẫu.',
      );
    }
  };

  const handleUploadAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg(
        'Vui lòng chọn tệp báo cáo định dạng PDF, XLSX, XLS, CSV hoặc JSON.',
      );
      return;
    }

    setUploading(true);
    setUploadProgress(25);
    setErrorMsg(null);
    setSaveSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('company_name', companyName);
      formData.append('ticker', ticker);
      formData.append('reporting_period', reportingPeriod);
      formData.append('report_type', reportType);
      formData.append('fiscal_year', fiscalYear);
      formData.append('currency', currency);
      formData.append('unit', unit);

      const authHeaders = await getAuthHeaders();
      setUploadProgress(60);

      const res = await fetch('/api/reports/upload', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Phân tích tài liệu thất bại.');
      }

      setUploadProgress(100);
      const uploadedReport = data.report as ReportRecord;
      setAnalyzedReport(uploadedReport);
      setEditableClaims(uploadedReport.extracted_claims.map((c) => ({ ...c })));
      setExtractorUsed(data.extractor || 'STRUCTURED_PARSER');
      setPageCount(data.page_count ?? 1);
      onReportUploaded(uploadedReport);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Tải lên và phân tích thất bại.',
      );
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleClaimFieldChange = (
    idx: number,
    field: keyof FinancialClaimInput,
    raw: string,
  ) => {
    setEditableClaims((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        if (field === 'reported_value') {
          const parsed = raw.trim() === '' ? null : Number(raw);
          return {
            ...c,
            reported_value:
              parsed !== null && Number.isFinite(parsed) ? parsed : null,
          };
        }
        if (field === 'source_page') {
          const parsed = raw.trim() === '' ? null : Number(raw);
          return {
            ...c,
            source_page:
              parsed !== null && Number.isFinite(parsed) ? parsed : null,
          };
        }
        return { ...c, [field]: raw };
      }),
    );
  };

  const handleSaveAndVerify = async () => {
    if (!analyzedReport) return;
    setSavingClaims(true);
    setErrorMsg(null);
    setSaveSuccess(null);

    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/reports/${analyzedReport.id}/claims`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ claims: editableClaims }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lưu và xác minh lại thất bại.');
      }
      if (data.report) {
        setAnalyzedReport(data.report);
        onClaimsSaved(data.report);
      }
      setSaveSuccess(
        'Đã lưu chỉnh sửa chỉ tiêu và chạy lại bộ máy xác minh xác định.',
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể lưu chỉ tiêu.',
      );
    } finally {
      setSavingClaims(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#F8FAFC]">
            Tải lên báo cáo tài chính
          </h1>
          <p className="text-xs text-[#94A3B8] mt-1">
            Tải lên tệp PDF, Excel (XLSX/XLS), CSV hoặc JSON. StockProof tạo mã
            băm SHA-256 ngoài chuỗi và trích xuất các chỉ tiêu có cấu trúc.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleLoadSampleCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-[#CBD5E1] whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#06B6D4]" />
            <span>Nạp CSV mẫu</span>
          </button>
          <a
            href="/api/sample-report?format=json"
            download="FPT_FY2025_Sample_Claims.json"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#172033] hover:bg-slate-800 border border-slate-700 text-xs font-medium text-[#CBD5E1] whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5 text-[#3B82F6]" />
            <span>Tải JSON mẫu</span>
          </a>
        </div>
      </div>

      <form
        onSubmit={handleUploadAnalyze}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* Drag-and-drop Upload Zone */}
        <section className="lg:col-span-5 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            1. Tài liệu nguồn
          </h2>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                fileInputRef.current?.click();
              }
            }}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-[#3B82F6] bg-[#3B82F6]/10'
                : 'border-slate-700 hover:border-slate-600 bg-[#111827]/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.json"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />
            <UploadCloud className="h-8 w-8 mx-auto text-[#3B82F6] mb-3" />
            <div className="text-sm font-medium text-[#F8FAFC]">
              Kéo thả tệp báo cáo vào đây, hoặc bấm để chọn tệp
            </div>
            <div className="text-xs text-[#94A3B8] mt-1">
              Hỗ trợ PDF, XLSX, XLS, CSV, JSON (tối đa 15 MB)
            </div>
          </div>

          {selectedFile && (
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-4 w-4 text-[#06B6D4] shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#F8FAFC] truncate">
                    {selectedFile.name}
                  </div>
                  <div className="text-[11px] text-[#94A3B8] tabular-nums">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setUploadProgress(0);
                }}
                aria-label="Xóa tệp đã chọn"
                className="p-1.5 rounded-md text-[#94A3B8] hover:text-[#EF4444] hover:bg-slate-800 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}

          {uploadProgress > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-[#94A3B8] tabular-nums">
                <span>
                  {uploading
                    ? 'Đang tạo mã băm & trích xuất chỉ tiêu...'
                    : 'Hoàn tất trích xuất'}
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-[#111827] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3B82F6] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Metadata Form */}
        <section className="lg:col-span-7 bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            2. Thông tin báo cáo
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1.5">
              <span className="text-[#94A3B8] font-medium block">
                Tên doanh nghiệp
              </span>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] focus:outline-none focus:border-[#3B82F6]"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[#94A3B8] font-medium block">
                Mã chứng khoán (HOSE / HNX)
              </span>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                required
                className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] font-mono focus:outline-none focus:border-[#3B82F6]"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[#94A3B8] font-medium block">
                Kỳ báo cáo
              </span>
              <input
                type="text"
                value={reportingPeriod}
                onChange={(e) => setReportingPeriod(e.target.value)}
                placeholder="FY2025"
                required
                className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] focus:outline-none focus:border-[#3B82F6]"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[#94A3B8] font-medium block">
                Loại báo cáo
              </span>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] focus:outline-none focus:border-[#3B82F6]"
              >
                <option value="Consolidated">Hợp nhất (Consolidated)</option>
                <option value="Separate">Công ty mẹ (Separate)</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[#94A3B8] font-medium block">
                Năm tài chính
              </span>
              <input
                type="text"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] tabular-nums focus:outline-none focus:border-[#3B82F6]"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-[#94A3B8] font-medium block">
                  Tiền tệ
                </span>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] focus:outline-none focus:border-[#3B82F6]"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-[#94A3B8] font-medium block">
                  Đơn vị mặc định
                </span>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-slate-700 text-[#F8FAFC] focus:outline-none focus:border-[#3B82F6]"
                >
                  <option value="Tỷ VND">Tỷ VND</option>
                  <option value="Triệu VND">Triệu VND</option>
                  <option value="VND">VND</option>
                </select>
              </label>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 text-xs text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0"
            >
              <UploadCloud className="h-4 w-4" />
              <span>
                {uploading ? 'Đang phân tích báo cáo...' : 'Tải lên & Phân tích'}
              </span>
            </button>
          </div>
        </section>
      </form>

      {/* Extracted Claims Editor */}
      {analyzedReport && (
        <section className="bg-[#172033] border border-slate-800/80 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#22C55E]" />
                <h2 className="text-base font-semibold text-[#F8FAFC]">
                  3. Kiểm tra chỉ tiêu trích xuất ({analyzedReport.id})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#94A3B8] font-mono">
                <span>Mã băm: {analyzedReport.document_hash.slice(0, 18)}...</span>
                <span>Bộ trích xuất: {extractorUsed}</span>
                <span>Số trang/sheet: {pageCount}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSaveAndVerify}
                disabled={savingClaims}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-60 text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {savingClaims
                    ? 'Đang xác minh lại...'
                    : 'Lưu & Xác minh lại'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/verification')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-[#111827] hover:bg-slate-800 text-xs font-medium text-[#F8FAFC] whitespace-nowrap shrink-0"
              >
                <span>Mở kết quả xác minh</span>
              </button>
            </div>
          </div>

          {saveSuccess && (
            <div className="text-xs text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg px-3 py-2">
              {saveSuccess}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[#94A3B8]">
                  <th className="py-2 pr-3 font-medium">Mã</th>
                  <th className="py-2 pr-3 font-medium">Chỉ tiêu</th>
                  <th className="py-2 pr-3 font-medium">Giá trị báo cáo</th>
                  <th className="py-2 pr-3 font-medium">Đơn vị</th>
                  <th className="py-2 pr-3 font-medium">Kỳ</th>
                  <th className="py-2 pr-3 font-medium">Trang</th>
                  <th className="py-2 font-medium">Trích dẫn bằng chứng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {editableClaims.map((claim, idx) => (
                  <tr key={claim.claim_id}>
                    <td className="py-2 pr-3 font-mono text-[#CBD5E1] whitespace-nowrap">
                      {claim.claim_id}
                    </td>
                    <td className="py-2 pr-3 text-[#F8FAFC] font-medium whitespace-nowrap">
                      {claim.metric}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        step="any"
                        value={claim.reported_value ?? ''}
                        onChange={(e) =>
                          handleClaimFieldChange(
                            idx,
                            'reported_value',
                            e.target.value,
                          )
                        }
                        className="w-28 px-2 py-1 rounded bg-[#111827] border border-slate-700 text-[#F8FAFC] font-mono tabular-nums"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={claim.unit}
                        onChange={(e) =>
                          handleClaimFieldChange(idx, 'unit', e.target.value)
                        }
                        className="w-28 px-2 py-1 rounded bg-[#111827] border border-slate-700 text-[#F8FAFC]"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="text"
                        value={claim.period}
                        onChange={(e) =>
                          handleClaimFieldChange(idx, 'period', e.target.value)
                        }
                        className="w-24 px-2 py-1 rounded bg-[#111827] border border-slate-700 text-[#F8FAFC]"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        value={claim.source_page ?? ''}
                        onChange={(e) =>
                          handleClaimFieldChange(
                            idx,
                            'source_page',
                            e.target.value,
                          )
                        }
                        className="w-16 px-2 py-1 rounded bg-[#111827] border border-slate-700 text-[#F8FAFC] tabular-nums"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="text"
                        value={claim.evidence}
                        onChange={(e) =>
                          handleClaimFieldChange(idx, 'evidence', e.target.value)
                        }
                        className="w-full min-w-[220px] px-2 py-1 rounded bg-[#111827] border border-slate-700 text-[#CBD5E1]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
