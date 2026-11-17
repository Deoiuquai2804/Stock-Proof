import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

export interface ProcessedDocument {
  originalFilename: string;
  fileType: string;
  fileSize: number;
  documentHash: string;
  storagePath: string;
  extractedText: string;
  pageCount: number;
  structuredJsonClaims?: Record<string, unknown>[];
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');

export async function processUploadedDocument(params: {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
}): Promise<ProcessedDocument> {
  const ext = path.extname(params.originalFilename).toLowerCase();
  const allowedExts = ['.pdf', '.xlsx', '.xls', '.csv', '.json'];
  if (!allowedExts.includes(ext)) {
    throw new Error(
      `Unsupported file format "${ext || 'unknown'}". Supported formats: PDF, XLSX, XLS, CSV, JSON.`,
    );
  }

  if (params.buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }

  const documentHash =
    '0x' + crypto.createHash('sha256').update(params.buffer).digest('hex');

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const safeName = `${Date.now()}-${params.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = path.resolve(UPLOADS_DIR, safeName);
  await fs.writeFile(storagePath, params.buffer);

  if (ext === '.json') {
    const raw = params.buffer.toString('utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON file syntax.');
    }

    const claimsArray = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray((parsed as { claims?: unknown[] }).claims)
        ? ((parsed as { claims: Record<string, unknown>[] }).claims)
        : undefined;

    return {
      originalFilename: params.originalFilename,
      fileType: 'application/json',
      fileSize: params.buffer.length,
      documentHash,
      storagePath,
      extractedText: raw.slice(0, 60000),
      pageCount: 1,
      structuredJsonClaims: claimsArray,
    };
  }

  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
    const workbook = XLSX.read(params.buffer, { type: 'buffer' });
    if (workbook.SheetNames.length === 0) {
      throw new Error('Spreadsheet contains no worksheets.');
    }
    const sheetTexts: string[] = [];
    const tableRows: Record<string, unknown>[] = [];

    workbook.SheetNames.forEach((sheetName, idx) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheetTexts.push(`[Page ${idx + 1} | Sheet: ${sheetName}]\n${csv}`);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      rows.forEach((r) => tableRows.push({ ...r, __sheet: sheetName, __page: idx + 1 }));
    });

    const combined = sheetTexts.join('\n\n');
    if (!combined.trim()) {
      throw new Error('Spreadsheet extraction yielded no readable cells.');
    }

    return {
      originalFilename: params.originalFilename,
      fileType: params.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: params.buffer.length,
      documentHash,
      storagePath,
      extractedText: combined.slice(0, 60000),
      pageCount: workbook.SheetNames.length,
      structuredJsonClaims: tableRows.length > 0 ? tableRows : undefined,
    };
  }

  // PDF extraction using pdfjs-dist legacy build for Node.js ESM
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(params.buffer),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    pageTexts.push(`[Page ${pageNum}]\n${strings.join(' ')}`);
  }

  const combinedText = pageTexts.join('\n\n').trim();
  if (!combinedText) {
    throw new Error(
      'PDF text extraction yielded empty text. Scanned/image-only PDFs require OCR preprocessing.',
    );
  }

  return {
    originalFilename: params.originalFilename,
    fileType: 'application/pdf',
    fileSize: params.buffer.length,
    documentHash,
    storagePath,
    extractedText: combinedText.slice(0, 60000),
    pageCount: pdfDoc.numPages,
  };
}
