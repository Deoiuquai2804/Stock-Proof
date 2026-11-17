import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { FinancialClaimInput, ReportType } from '../types/stockproof.ts';

const TARGET_METRICS = [
  'Doanh thu thuần',
  'Giá vốn hàng bán',
  'Lợi nhuận gộp',
  'Lợi nhuận thuần từ HĐKD',
  'Lợi nhuận sau thuế',
  'Tổng tài sản',
  'Nợ phải trả',
  'Vốn chủ sở hữu',
  'Lưu chuyển tiền tệ từ HĐKD',
  'Tăng trưởng doanh thu',
] as const;

export interface ExtractionContext {
  extractedText: string;
  structuredRows?: Record<string, unknown>[];
  companyName: string;
  period: string;
  reportType: ReportType;
  currency: string;
  unit: string;
  sourceDocument: string;
  pageCount?: number;
  isScannedPdf?: boolean;
  pdfBase64?: string;
}

export interface ExtractionResult {
  claims: FinancialClaimInput[];
  extractor: 'GEMINI_AI' | 'STRUCTURED_PARSER';
}

function tryStructuredClaimMapping(
  ctx: ExtractionContext,
): FinancialClaimInput[] | null {
  if (!ctx.structuredRows || ctx.structuredRows.length === 0) return null;

  const first = ctx.structuredRows[0];
  const keys = Object.keys(first).map((k) => k.toLowerCase());
  const hasMetricCol =
    keys.includes('metric') || keys.includes('chỉ tiêu') || keys.includes('item');
  const hasValueCol =
    keys.includes('reported_value') ||
    keys.includes('value') ||
    keys.includes('amount') ||
    keys.includes('giá trị');

  if (!hasMetricCol || !hasValueCol) return null;

  const mapped: FinancialClaimInput[] = [];
  ctx.structuredRows.forEach((row, idx) => {
    const getVal = (...candidates: string[]): unknown => {
      for (const c of candidates) {
        const matchKey = Object.keys(row).find(
          (k) => k.toLowerCase() === c.toLowerCase(),
        );
        if (matchKey !== undefined) return row[matchKey];
      }
      return undefined;
    };

    const metricRaw = String(
      getVal('metric', 'chỉ tiêu', 'item') ?? '',
    ).trim();
    if (!metricRaw) return;

    const rawVal = getVal('reported_value', 'value', 'amount', 'giá trị');
    const numericVal =
      rawVal === null || rawVal === undefined || rawVal === ''
        ? null
        : Number(String(rawVal).replace(/,/g, ''));

    const claimId = String(
      getVal('claim_id', 'id') ?? `CLM-${String(idx + 1).padStart(3, '0')}`,
    );
    const periodVal = String(getVal('period', 'kỳ') ?? ctx.period);
    const unitVal = String(getVal('unit', 'đơn vị') ?? ctx.unit);
    const pageVal = getVal('source_page', 'page');
    const sourcePage =
      pageVal !== undefined &&
      pageVal !== null &&
      String(pageVal).trim() !== '' &&
      !Number.isNaN(Number(pageVal))
        ? Number(pageVal)
        : null;
    const rawSourceDoc = getVal('source_document');
    const hasSourceDocCol = keys.includes('source_document');
    const sourceDocument =
      rawSourceDoc !== undefined && rawSourceDoc !== null
        ? String(rawSourceDoc).trim()
        : hasSourceDocCol
          ? ''
          : ctx.sourceDocument;
    const rawSourceLoc = getVal('source_location');
    const sourceLocation =
      rawSourceLoc !== undefined && rawSourceLoc !== null
        ? String(rawSourceLoc).trim()
        : '';
    const rawEvidence = getVal('evidence');
    const evidence =
      rawEvidence !== undefined && rawEvidence !== null
        ? String(rawEvidence).trim()
        : '';

    mapped.push({
      claim_id: claimId,
      claim_type:
        String(getVal('claim_type') ?? '') === 'financial_ratio'
          ? 'financial_ratio'
          : String(getVal('claim_type') ?? '') === 'subjective_claim'
            ? 'subjective_claim'
            : metricRaw.toLowerCase().includes('growth') ||
                metricRaw.toLowerCase().includes('tăng trưởng') ||
                metricRaw.toLowerCase().includes('biên') ||
                metricRaw.toLowerCase().includes('margin')
              ? 'financial_ratio'
              : 'financial_metric',
      metric: metricRaw,
      company: String(getVal('company') ?? ctx.companyName),
      period: periodVal,
      report_type:
        String(getVal('report_type') ?? ctx.reportType) === 'Separate'
          ? 'Separate'
          : 'Consolidated',
      reported_value: Number.isFinite(numericVal) ? numericVal : null,
      currency: String(getVal('currency') ?? ctx.currency),
      unit: unitVal,
      formula: getVal('formula') ? String(getVal('formula')) : null,
      source_document: sourceDocument,
      source_page: sourcePage,
      source_location: sourceLocation,
      evidence,
      verification_status: 'PENDING',
      uncertain: numericVal === null || !Number.isFinite(numericVal),
    });
  });

  return mapped.length > 0 ? mapped : null;
}

export async function extractFinancialClaims(
  ctx: ExtractionContext,
): Promise<ExtractionResult> {
  // 1. Nếu tệp JSON/XLSX/CSV đã có cột chuẩn, phân tích xác định trực tiếp
  const directMapped = tryStructuredClaimMapping(ctx);
  if (directMapped) {
    return { claims: directMapped, extractor: 'STRUCTURED_PARSER' };
  }

  // 2. Ngược lại dùng Gemini API (phía máy chủ) để trích xuất chỉ tiêu có cấu trúc
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (ctx.isScannedPdf) {
      throw new Error(
        `Tệp "${ctx.sourceDocument}" là PDF dạng ảnh scan (${ctx.pageCount ?? '?'} trang, không có lớp văn bản để trích xuất trực tiếp). Hãy cấu hình GEMINI_API_KEY trong bảng Settings > Secrets để bật OCR đa phương thức, hoặc tải lên tệp PDF có lớp văn bản / Excel / CSV.`,
      );
    }
    throw new Error(
      'Chưa cấu hình GEMINI_API_KEY trong biến môi trường máy chủ. Hãy tải lên tệp CSV/JSON/Excel có cấu trúc hoặc cấu hình GEMINI_API_KEY để trích xuất PDF tự động.',
    );
  }

  if (ctx.isScannedPdf && !ctx.pdfBase64) {
    throw new Error(
      'Tệp PDF dạng ảnh scan nhưng thiếu dữ liệu nhị phân để gửi OCR đa phương thức.',
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `Trích xuất các chỉ tiêu tài chính có cấu trúc từ báo cáo tài chính sau (hỗ trợ cả tiếng Việt và tiếng Anh theo chuẩn VAS/Thông tư 200).
Doanh nghiệp: ${ctx.companyName}
Kỳ báo cáo dự kiến: ${ctx.period}
Loại báo cáo dự kiến: ${ctx.reportType}
Tiền tệ mặc định: ${ctx.currency}
Đơn vị mặc định: ${ctx.unit}
Tên tệp nguồn: ${ctx.sourceDocument}

Ưu tiên trích xuất và chuẩn hóa tên chỉ tiêu sang danh sách tiếng Việt sau nếu xuất hiện trong báo cáo (kể cả khi bản gốc viết bằng tiếng Anh như Net revenue, Cost of sales, Gross profit, Net operating profit, Net profit after tax, Total assets, Liabilities, Owners' equity, Net cash flows from operating activities):
${TARGET_METRICS.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Quy tắc bắt buộc:
- Chỉ trích xuất số liệu và trích dẫn thực sự nhìn thấy/đọc được trong tài liệu.
- TUYỆT ĐỐI KHÔNG tự bịa, đoán hoặc nội suy số liệu thiếu. Nếu thiếu hoặc mơ hồ, đặt uncertain=true và reported_value=null.
- Gắn đúng số trang thực tế của tệp PDF vào source_page, tên bảng/mục (ví dụ: Separate Statement of Income - Code 10) vào source_location, và đoạn trích dẫn nguyên văn vào evidence.
- Nhận diện chính xác đơn vị hiển thị trong bảng (VND, Triệu VND, Tỷ VND, %) và kỳ báo cáo (nếu là báo cáo năm cho kỳ dự kiến "${ctx.period}" như "năm kết thúc 31/12/2024" hay "2024" thì ghi thống nhất "${ctx.period}"; chỉ ghi kỳ khác như Q3/2025 nếu số liệu thực sự là báo cáo quý/năm khác) cũng như loại báo cáo ("Separate" nếu là Báo cáo riêng / Separate financial statements, "Consolidated" nếu là Hợp nhất).
- Phân loại rõ "financial_metric" (chỉ tiêu số liệu), "financial_ratio" (tỷ lệ/tăng trưởng), và "subjective_claim" (nhận định chủ quan/mơ hồ).

${ctx.isScannedPdf ? 'Tài liệu được đính kèm trực tiếp dưới dạng PDF scan nhiều trang. Hãy đọc toàn bộ các bảng báo cáo tài chính chính (Bảng cân đối kế toán, Báo cáo kết quả hoạt động kinh doanh, Báo cáo lưu chuyển tiền tệ) để trích xuất chính xác.' : `Nội dung tài liệu:\n${ctx.extractedText.slice(0, 40000)}`}`;

  const contents =
    ctx.isScannedPdf && ctx.pdfBase64
      ? {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: ctx.pdfBase64,
              },
            },
            { text: prompt },
          ],
        }
      : prompt;

  const requestConfig = {
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    systemInstruction:
      'Bạn là bộ máy trích xuất dữ liệu tài chính nghiêm ngặt (hỗ trợ OCR PDF đa phương thức cho BCTC Việt Nam song ngữ Anh/Việt). Trích xuất chỉ tiêu tài chính sang JSON mà không tự sửa đổi hay bịa số liệu.',
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric: { type: Type.STRING },
          claim_type: { type: Type.STRING },
          period: { type: Type.STRING },
          report_type: { type: Type.STRING },
          reported_value: { type: Type.NUMBER, nullable: true },
          currency: { type: Type.STRING },
          unit: { type: Type.STRING },
          formula: { type: Type.STRING, nullable: true },
          source_page: { type: Type.INTEGER, nullable: true },
          source_location: { type: Type.STRING },
          evidence: { type: Type.STRING },
          uncertain: { type: Type.BOOLEAN },
          ambiguous_reason: { type: Type.STRING, nullable: true },
        },
        required: ['metric', 'period', 'unit', 'source_location', 'evidence'],
      },
    },
  };

  const modelsToTry = [
    { model: 'gemini-4-hydrogen', delayMs: 0 },
    { model: 'gemini-4-hydrogen', delayMs: 1500 },
    { model: 'gemini-3.1-flash-lite', delayMs: 1500 },
  ];

  let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null =
    null;
  let lastError: unknown = null;

  for (const attempt of modelsToTry) {
    if (attempt.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt.delayMs));
    }
    try {
      response = await ai.models.generateContent({
        model: attempt.model,
        contents,
        config:
          attempt.model === 'gemini-4-hydrogen'
            ? requestConfig
            : {
                systemInstruction: requestConfig.systemInstruction,
                responseMimeType: requestConfig.responseMimeType,
                responseSchema: requestConfig.responseSchema,
              },
      });
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.toLowerCase().includes('high demand') ||
        msg.toLowerCase().includes('overloaded');
      if (!isTransient) {
        throw err;
      }
    }
  }

  if (!response) {
    const rawMsg =
      lastError instanceof Error ? lastError.message : String(lastError ?? '');
    if (
      rawMsg.includes('503') ||
      rawMsg.includes('UNAVAILABLE') ||
      rawMsg.toLowerCase().includes('high demand')
    ) {
      throw new Error(
        'Dịch vụ AI trích xuất (Gemini) đang quá tải tạm thời (HTTP 503). Vui lòng thử tải lên lại sau vài giây.',
      );
    }
    if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      throw new Error(
        'Vượt giới hạn tần suất gọi Gemini API (HTTP 429). Vui lòng đợi một lát rồi thử lại.',
      );
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Không thể kết nối dịch vụ Gemini AI để trích xuất tài liệu.');
  }

  const rawJson = (response.text ?? '[]').trim();
  const parsed = JSON.parse(rawJson) as Array<{
    metric: string;
    claim_type?: string;
    period?: string;
    report_type?: string;
    reported_value?: number | null;
    currency?: string;
    unit?: string;
    formula?: string | null;
    source_page?: number | null;
    source_location?: string;
    evidence?: string;
    uncertain?: boolean;
    ambiguous_reason?: string | null;
  }>;

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      'Gemini không trích xuất được chỉ tiêu tài chính có cấu trúc nào từ tài liệu này.',
    );
  }

  const claims: FinancialClaimInput[] = parsed.map((item, idx) => ({
    claim_id: `CLM-${String(idx + 1).padStart(3, '0')}`,
    claim_type:
      item.claim_type === 'financial_ratio'
        ? 'financial_ratio'
        : item.claim_type === 'subjective_claim'
          ? 'subjective_claim'
          : 'financial_metric',
    metric: item.metric,
    company: ctx.companyName,
    period: item.period || ctx.period,
    report_type: item.report_type === 'Separate' ? 'Separate' : 'Consolidated',
    reported_value:
      typeof item.reported_value === 'number' &&
      Number.isFinite(item.reported_value)
        ? item.reported_value
        : null,
    currency: item.currency || ctx.currency,
    unit: item.unit || ctx.unit,
    formula: item.formula ?? null,
    source_document: ctx.sourceDocument,
    source_page:
      typeof item.source_page === 'number' ? item.source_page : null,
    source_location: item.source_location || 'Báo cáo tài chính',
    evidence: item.evidence || '',
    verification_status: 'PENDING',
    uncertain: Boolean(item.uncertain) || item.reported_value === null,
    ambiguous_reason: item.ambiguous_reason ?? undefined,
  }));

  return { claims, extractor: 'GEMINI_AI' };
}
