import PDFDocument from 'pdfkit';
import type { EvidenceReport } from '../types/stockproof.ts';

export async function generateEvidenceReportPdf(
  report: EvidenceReport,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fontSize(18)
      .fillColor('#0F172A')
      .text('STOCKPROOF — EVIDENCE REPORT', { align: 'left' });
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text('Trust Every Financial Claim · Claim-Level Financial Verification');

    if (report.is_demo_data) {
      doc
        .moveDown(0.3)
        .fontSize(9)
        .fillColor('#B45309')
        .text('DEMO DATA — Illustrative Vietnamese Listed Company Dataset');
    }

    doc.moveDown(0.8);
    doc
      .strokeColor('#CBD5E1')
      .lineWidth(1)
      .moveTo(42, doc.y)
      .lineTo(553, doc.y)
      .stroke();
    doc.moveDown(0.8);

    // 1-7 Metadata
    doc.fontSize(11).fillColor('#0F172A').text('1. Report & Verification Metadata');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#334155');
    const metaLines = [
      `Report ID: ${report.report_id}`,
      `Company: ${report.company} (${report.exchange}: ${report.ticker})`,
      `Reporting Period: ${report.reporting_period} (${report.report_type})`,
      `Verification Timestamp: ${report.verification_timestamp}`,
      `Verification Engine Version: ${report.verification_engine_version} (Tolerance: +/-${report.tolerance_percent}%)`,
      `Document SHA-256 Hash: ${report.document_hash}`,
      `Evidence Bundle SHA-256 Hash: ${report.evidence_hash}`,
    ];
    metaLines.forEach((line) => doc.text(line));

    doc.moveDown(0.8);
    doc.fontSize(11).fillColor('#0F172A').text('2. Verification Summary');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#334155');
    doc.text(
      `Total Claims: ${report.summary.total_claims}   |   VERIFIED: ${report.summary.verified}   |   MISMATCH: ${report.summary.mismatch}   |   INSUFFICIENT EVIDENCE: ${report.summary.insufficient_evidence}   |   NEEDS HUMAN REVIEW: ${report.summary.needs_human_review}`,
    );
    doc.text(`Overall Status: ${report.summary.overall_status}`);

    // Individual Claim Results
    doc.moveDown(0.8);
    doc.fontSize(11).fillColor('#0F172A').text('3. Claim-Level Audit Results');
    doc.moveDown(0.4);

    report.claims.forEach((c) => {
      if (doc.y > 710) {
        doc.addPage();
      }
      doc
        .fontSize(9.5)
        .fillColor('#0F172A')
        .text(`${c.claim_id} — ${c.metric} [${c.status}] (${c.verification_source})`);
      doc
        .fontSize(8.5)
        .fillColor('#334155')
        .text(
          `Seller Value: ${c.reported_value ?? 'N/A'} ${c.unit} (${c.period})   |   Reference Value: ${c.reference_value ?? 'N/A'} ${c.reference_unit}   |   Diff: ${c.difference_label}`,
        )
        .text(
          `Rule: ${c.validation_rule}   |   Source: ${c.source_document || 'None'} (p.${c.source_page ?? 'N/A'})`,
        )
        .text(`Explanation: ${c.explanation}`);
      doc.moveDown(0.5);
    });

    // Human Reviews
    if (report.human_reviews.length > 0) {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#0F172A').text('4. Human-in-the-Loop Audit Trail');
      doc.moveDown(0.3);
      report.human_reviews.forEach((hr) => {
        doc
          .fontSize(8.5)
          .fillColor('#334155')
          .text(
            `${hr.claim_id}: ${hr.decision} by ${hr.reviewer_name} (${hr.reviewer_id}) at ${hr.created_at}`,
          )
          .text(`Comment: ${hr.comment} | Value: ${hr.previous_value ?? 'N/A'} -> ${hr.updated_value ?? 'N/A'}`);
        doc.moveDown(0.3);
      });
    }

    // Blockchain Record
    if (doc.y > 700) doc.addPage();
    doc.moveDown(0.6);
    doc.fontSize(11).fillColor('#0F172A').text('5. Blockchain Verification Record');
    doc.moveDown(0.3);
    doc.fontSize(8.5).fillColor('#334155');
    if (report.blockchain_record) {
      doc.text(`Network: ${report.blockchain_record.network} (Chain ID ${report.blockchain_record.chain_id})`);
      doc.text(`Mode: ${report.blockchain_record.mode}`);
      doc.text(`Contract Address: ${report.blockchain_record.contract_address}`);
      doc.text(`Transaction Hash: ${report.blockchain_record.transaction_hash}`);
      doc.text(`Timestamp: ${report.blockchain_record.created_at}`);
      if (report.blockchain_record.explorer_url) {
        doc.text(`Explorer: ${report.blockchain_record.explorer_url}`);
      }
    } else {
      doc.text('Not registered on blockchain yet.');
    }

    doc.end();
  });
}
