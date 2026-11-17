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
  isScannedPdf?: boolean;
  pdfBase64?: string;
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
      `Định dạng tệp "${ext || 'không xác định'}" chưa được hỗ trợ. Các định dạng hợp lệ: PDF, XLSX, XLS, CSV, JSON.`,
    );
  }

  if (params.buffer.length === 0) {
    throw new Error('Tệp tải lên đang bị rỗng.');
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
      throw new Error('Cú pháp tệp JSON không hợp lệ.');
    }

    const claimsArray = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray((parsed as { claims?: unknown[] }).claims)
        ? (parsed as { claims: Record<string, unknown>[] }).claims
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
    const workbook =
      ext === '.csv'
        ? XLSX.read(params.buffer.toString('utf-8').replace(/^\uFEFF/, ''), {
            type: 'string',
          })
        : XLSX.read(params.buffer, { type: 'buffer', codepage: 65001 });
    if (workbook.SheetNames.length === 0) {
      throw new Error('Tệp bảng tính không có trang dữ liệu nào.');
    }
    const sheetTexts: string[] = [];
    const tableRows: Record<string, unknown>[] = [];

    workbook.SheetNames.forEach((sheetName, idx) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      sheetTexts.push(`[Trang ${idx + 1} | Sheet: ${sheetName}]\n${csv}`);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      rows.forEach((r) =>
        tableRows.push({ ...r, __sheet: sheetName, __page: idx + 1 }),
      );
    });

    const combined = sheetTexts.join('\n\n');
    if (!combined.trim()) {
      throw new Error('Không đọc được dữ liệu ô nào từ bảng tính.');
    }

    return {
      originalFilename: params.originalFilename,
      fileType:
        params.mimeType ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: params.buffer.length,
      documentHash,
      storagePath,
      extractedText: combined.slice(0, 60000),
      pageCount: workbook.SheetNames.length,
      structuredJsonClaims: tableRows.length > 0 ? tableRows : undefined,
    };
  }

  // Trích xuất PDF bằng pdfjs-dist cho Node.js ESM
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(params.buffer),
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;
  const pageTexts: string[] = [];
  let rawTextChars = 0;

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? item.str.trim() : ''))
      .filter(Boolean);
    const pageBody = strings.join(' ');
    rawTextChars += pageBody.length;
    if (pageBody.length > 0) {
      pageTexts.push(`[Trang ${pageNum}]\n${pageBody}`);
    }
  }

  const combinedText = pageTexts.join('\n\n').trim();
  const isScannedPdf = rawTextChars < 50;

  return {
    originalFilename: params.originalFilename,
    fileType: 'application/pdf',
    fileSize: params.buffer.length,
    documentHash,
    storagePath,
    extractedText: isScannedPdf ? '' : combinedText.slice(0, 60000),
    pageCount: pdfDoc.numPages,
    isScannedPdf,
    pdfBase64: isScannedPdf ? params.buffer.toString('base64') : undefined,
  };
}
