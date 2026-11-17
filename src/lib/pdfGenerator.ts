import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import type { EvidenceReport } from '../types/stockproof.ts';

const FONT_REGULAR_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

export async function generateEvidenceReportPdf(
  report: EvidenceReport,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: 'A4' });
    const chunks: Buffer[] = [];

    const hasRegular = fs.existsSync(FONT_REGULAR_PATH);
    const hasBold = fs.existsSync(FONT_BOLD_PATH);
    if (hasRegular) {
      doc.registerFont('ViRegular', FONT_REGULAR_PATH);
      doc.font('ViRegular');
    }
    if (hasBold) {
      doc.registerFont('ViBold', FONT_BOLD_PATH);
    }

    const useBold = () => {
      if (hasBold) doc.font('ViBold');
    };
    const useRegular = () => {
      if (hasRegular) doc.font('ViRegular');
    };

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Tiêu đề
    useBold();
    doc
      .fontSize(17)
      .fillColor('#0F172A')
      .text('STOCKPROOF — BÁO CÁO BẰNG CHỨNG XÁC MINH', { align: 'left' });
    useRegular();
    doc
      .fontSize(9.5)
      .fillColor('#475569')
      .text('Xác minh mọi chỉ tiêu tài chính · Kiểm toán theo từng chỉ tiêu');

    if (report.is_demo_data) {
      doc
        .moveDown(0.3)
        .fontSize(9)
        .fillColor('#B45309')
        .text('DỮ LIỆU MẪU — Bộ dữ liệu minh họa doanh nghiệp niêm yết Việt Nam');
    }

    doc.moveDown(0.8);
    doc
      .strokeColor('#CBD5E1')
      .lineWidth(1)
      .moveTo(42, doc.y)
      .lineTo(553, doc.y)
      .stroke();
    doc.moveDown(0.8);

    // 1-7 Thông tin định danh
    useBold();
    doc.fontSize(11).fillColor('#0F172A').text('1. Thông tin báo cáo & Mã băm');
    doc.moveDown(0.3);
    useRegular();
    doc.fontSize(8.5).fillColor('#334155');
    const metaLines = [
      `Mã báo cáo: ${report.report_id}`,
      `Doanh nghiệp: ${report.company} (${report.exchange}: ${report.ticker})`,
      `Kỳ & Loại báo cáo: ${report.reporting_period} (${report.report_type === 'Consolidated' ? 'Hợp nhất' : 'Công ty mẹ'})`,
      `Thời điểm xác minh: ${report.verification_timestamp}`,
      `Phiên bản bộ máy: ${report.verification_engine_version} (Ngưỡng sai số: +/-${report.tolerance_percent}%)`,
      `Mã băm SHA-256 tài liệu: ${report.document_hash}`,
      `Mã băm SHA-256 gói bằng chứng: ${report.evidence_hash}`,
    ];
    metaLines.forEach((line) => doc.text(line));

    doc.moveDown(0.8);
    useBold();
    doc.fontSize(11).fillColor('#0F172A').text('2. Tổng hợp kết quả xác minh');
    doc.moveDown(0.3);
    useRegular();
    doc.fontSize(8.5).fillColor('#334155');
    doc.text(
      `Tổng chỉ tiêu: ${report.summary.total_claims}   |   ĐÃ XÁC MINH: ${report.summary.verified}   |   SAI LỆCH: ${report.summary.mismatch}   |   THIẾU BẰNG CHỨNG: ${report.summary.insufficient_evidence}   |   CẦN DUYỆT THỦ CÔNG: ${report.summary.needs_human_review}`,
    );
    doc.text(`Trạng thái tổng thể: ${report.summary.overall_status}`);

    // Kết quả từng chỉ tiêu
    doc.moveDown(0.8);
    useBold();
    doc.fontSize(11).fillColor('#0F172A').text('3. Kết quả kiểm toán từng chỉ tiêu');
    doc.moveDown(0.4);

    report.claims.forEach((c) => {
      if (doc.y > 710) {
        doc.addPage();
      }
      useBold();
      doc
        .fontSize(9)
        .fillColor('#0F172A')
        .text(`${c.claim_id} — ${c.metric} [${c.status}] (${c.verification_source})`);
      useRegular();
      doc
        .fontSize(8.5)
        .fillColor('#334155')
        .text(
          `Giá trị Seller: ${c.reported_value ?? 'N/A'} ${c.unit} (${c.period})   |   Chuẩn: ${c.reference_value ?? 'N/A'} ${c.reference_unit}   |   Lệch: ${c.difference_label}`,
        )
        .text(
          `Quy tắc: ${c.validation_rule}   |   Nguồn: ${c.source_document || 'Không có'} (Tr.${c.source_page ?? 'N/A'})`,
        )
        .text(`Giải thích: ${c.explanation}`);
      doc.moveDown(0.5);
    });

    // Nhật ký HITL
    if (report.human_reviews.length > 0) {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.5);
      useBold();
      doc.fontSize(11).fillColor('#0F172A').text('4. Nhật ký kiểm toán viên duyệt thủ công (HITL)');
      doc.moveDown(0.3);
      useRegular();
      report.human_reviews.forEach((hr) => {
        doc
          .fontSize(8.5)
          .fillColor('#334155')
          .text(
            `${hr.claim_id}: ${hr.decision} bởi ${hr.reviewer_name} (${hr.reviewer_id}) lúc ${hr.created_at}`,
          )
          .text(
            `Nhận xét: ${hr.comment} | Giá trị: ${hr.previous_value ?? 'N/A'} -> ${hr.updated_value ?? 'N/A'}`,
          );
        doc.moveDown(0.3);
      });
    }

    // Bản ghi Blockchain
    if (doc.y > 700) doc.addPage();
    doc.moveDown(0.6);
    useBold();
    doc.fontSize(11).fillColor('#0F172A').text('5. Bản ghi xác minh Blockchain');
    doc.moveDown(0.3);
    useRegular();
    doc.fontSize(8.5).fillColor('#334155');
    if (report.blockchain_record) {
      doc.text(
        `Mạng lưới: ${report.blockchain_record.network} (Chain ID ${report.blockchain_record.chain_id})`,
      );
      doc.text(`Chế độ: ${report.blockchain_record.mode}`);
      doc.text(`Địa chỉ hợp đồng: ${report.blockchain_record.contract_address}`);
      doc.text(`Mã giao dịch (Tx Hash): ${report.blockchain_record.transaction_hash}`);
      doc.text(`Thời gian: ${report.blockchain_record.created_at}`);
      if (report.blockchain_record.explorer_url) {
        doc.text(`Trình duyệt khối: ${report.blockchain_record.explorer_url}`);
      }
    } else {
      doc.text('Chưa được ghi nhận lên Blockchain.');
    }

    doc.end();
  });
}
