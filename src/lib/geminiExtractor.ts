import { GoogleGenAI, Type } from '@google/genai';
import type { FinancialClaimInput, ReportType } from '../types/stockproof.ts';

const TARGET_METRICS = [
  'Revenue',
  'Cost of Goods Sold',
  'Gross Profit',
  'Operating Profit',
  'Net Profit After Tax',
  'Total Assets',
  'Total Liabilities',
  'Total Equity',
  'Operating Cash Flow',
  'Revenue Growth',
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
    const pageVal = getVal('source_page', 'page', '__page');
    const sourcePage =
      pageVal !== undefined && pageVal !== null && !Number.isNaN(Number(pageVal))
        ? Number(pageVal)
        : null;

    mapped.push({
      claim_id: claimId,
      claim_type:
        String(getVal('claim_type') ?? '') === 'financial_ratio'
          ? 'financial_ratio'
          : String(getVal('claim_type') ?? '') === 'subjective_claim'
            ? 'subjective_claim'
            : metricRaw.toLowerCase().includes('growth') ||
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
      source_document: String(
        getVal('source_document') ?? ctx.sourceDocument,
      ),
      source_page: sourcePage,
      source_location: String(
        getVal('source_location', '__sheet') ?? 'Financial Statement Table',
      ),
      evidence: String(
        getVal('evidence') ??
          `${metricRaw}: ${numericVal ?? 'N/A'} ${unitVal} (${periodVal})`,
      ),
      verification_status: 'PENDING',
      uncertain: numericVal === null || !Number.isFinite(numericVal),
    });
  });

  return mapped.length > 0 ? mapped : null;
}

export async function extractFinancialClaims(
  ctx: ExtractionContext,
): Promise<ExtractionResult> {
  // 1. If the uploaded JSON/XLSX/CSV already uses structured claim columns, parse deterministically
  const directMapped = tryStructuredClaimMapping(ctx);
  if (directMapped) {
    return { claims: directMapped, extractor: 'STRUCTURED_PARSER' };
  }

  // 2. Otherwise use Gemini API (server-side) for structured extraction
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in environment secrets. Upload a structured JSON/CSV claim template or configure GEMINI_API_KEY to extract unstructured PDFs.',
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

  const prompt = `Extract structured financial claims from the following financial document text.
Company: ${ctx.companyName}
Expected Reporting Period: ${ctx.period}
Expected Report Type: ${ctx.reportType}
Default Currency: ${ctx.currency}
Default Unit: ${ctx.unit}
Source Filename: ${ctx.sourceDocument}

Prioritize extracting these 10 financial metrics where explicitly present in the document:
${TARGET_METRICS.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Rules:
- Extract ONLY values and citations that explicitly appear in the text.
- NEVER fabricate, guess, or interpolate missing numbers. If a metric is missing or ambiguous, either omit it or set uncertain=true and reported_value=null.
- Map each claim to its exact [Page N] marker if present, table/section name in source_location, and a brief verbatim evidence excerpt.
- Identify exact units (VND, Million VND, Billion VND, %) and reporting period shown in the text (even if it differs from the expected metadata).
- Distinguish factual metrics ("financial_metric"), ratios ("financial_ratio"), and subjective/uncertain commentary ("subjective_claim").

Document text:
${ctx.extractedText.slice(0, 40000)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are a strict financial data extraction engine. Extract structured financial claims in JSON format without inventing or modifying numbers.',
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
      'Gemini extraction returned zero structured financial claims from this document.',
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
    source_location: item.source_location || 'Financial Statement',
    evidence: item.evidence || '',
    verification_status: 'PENDING',
    uncertain: Boolean(item.uncertain) || item.reported_value === null,
    ambiguous_reason: item.ambiguous_reason ?? undefined,
  }));

  return { claims, extractor: 'GEMINI_AI' };
}
