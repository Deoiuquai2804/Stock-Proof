import { GoogleGenAI, Type } from '@google/genai';
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
    throw new Error(
      'Chưa cấu hình GEMINI_API_KEY trong biến môi trường máy chủ. Hãy tải lên tệp CSV/JSON có cấu trúc hoặc cấu hình GEMINI_API_KEY để trích xuất PDF tự động.',
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

  const prompt = `Trích xuất các chỉ tiêu tài chính có cấu trúc từ nội dung báo cáo sau bằng tiếng Việt.
Doanh nghiệp: ${ctx.companyName}
Kỳ báo cáo dự kiến: ${ctx.period}
Loại báo cáo dự kiến: ${ctx.reportType}
Tiền tệ mặc định: ${ctx.currency}
Đơn vị mặc định: ${ctx.unit}
Tên tệp nguồn: ${ctx.sourceDocument}

Ưu tiên trích xuất 10 chỉ tiêu sau nếu xuất hiện rõ ràng trong văn bản:
${TARGET_METRICS.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Quy tắc bắt buộc:
- Chỉ trích xuất số liệu và trích dẫn thực sự có trong văn bản.
- TUYỆT ĐỐI KHÔNG tự bịa, đoán hoặc nội suy số liệu thiếu. Nếu thiếu hoặc mơ hồ, đặt uncertain=true và reported_value=null.
- Gắn đúng số [Trang N], tên bảng/mục trong source_location và đoạn trích dẫn nguyên văn vào evidence.
- Nhận diện chính xác đơn vị (VND, Triệu VND, Tỷ VND, %) và kỳ báo cáo thể hiện trong văn bản.
- Phân loại rõ "financial_metric" (chỉ tiêu số liệu), "financial_ratio" (tỷ lệ/tăng trưởng), và "subjective_claim" (nhận định chủ quan/mơ hồ).

Nội dung tài liệu:
${ctx.extractedText.slice(0, 40000)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'Bạn là bộ máy trích xuất dữ liệu tài chính nghiêm ngặt. Trích xuất chỉ tiêu tài chính sang JSON mà không tự sửa đổi hay bịa số liệu.',
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
    },
  });

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
