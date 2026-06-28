import { prisma } from '../../db/prisma';
import { CreateReportBody } from './report.types';
import PDFDocument from 'pdfkit';

export const reportService = {
  async list(organizationId: string) {
    return prisma.complianceReport.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        format: true,
        status: true,
        dateRangeStart: true,
        dateRangeEnd: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async create(organizationId: string, data: CreateReportBody) {
    // Create the record immediately as ready — generation is synchronous.
    // The status field is kept for API compatibility; it is set to 'ready'
    // once the record exists so callers can download straight away.
    const report = await prisma.complianceReport.create({
      data: {
        organizationId,
        name: data.name,
        format: data.format,
        dateRangeStart: new Date(data.dateRangeStart),
        dateRangeEnd: new Date(data.dateRangeEnd),
        status: 'ready',
      },
    });
    return report;
  },

  async get(organizationId: string, id: string) {
    return prisma.complianceReport.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        name: true,
        format: true,
        status: true,
        dateRangeStart: true,
        dateRangeEnd: true,
        downloadUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  async download(organizationId: string, id: string) {
    const report = await prisma.complianceReport.findFirst({
      where: { id, organizationId, status: 'ready' },
    });

    if (!report) {
      return null;
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: report.dateRangeStart,
          lte: report.dateRangeEnd,
        },
      },
      include: { agent: { select: { name: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (report.format === 'pdf') {
      const data = await generatePdf(report, logs);
      return {
        data,
        contentType: 'application/pdf',
        filename: `report-${report.name}.pdf`,
      };
    }

    if (report.format === 'csv') {
      const headers = ['id', 'action', 'agentId', 'agentName', 'prompt', 'response', 'complianceFlags', 'metadata', 'createdAt'];
      const rows = logs.map((log) => [
        log.id,
        log.action,
        log.agentId || '',
        log.agent?.name || '',
        (log.prompt || '').replace(/\n/g, ' '),
        (log.response || '').replace(/\n/g, ' '),
        log.complianceFlags.join(';'),
        log.metadata ? JSON.stringify(log.metadata).replace(/\n/g, ' ') : '',
        log.createdAt.toISOString(),
      ]);
      return {
        data: [headers.join(','), ...rows.map((r) => r.join(','))].join('\n'),
        contentType: 'text/csv',
        filename: `report-${report.name}.csv`,
      };
    }

    return {
      data: JSON.stringify({
        report: {
          id: report.id,
          name: report.name,
          dateRangeStart: report.dateRangeStart,
          dateRangeEnd: report.dateRangeEnd,
          generatedAt: new Date().toISOString(),
        },
        logs,
      }, null, 2),
      contentType: 'application/json',
      filename: `report-${report.name}.json`,
    };
  },

  async remove(organizationId: string, id: string) {
    const report = await prisma.complianceReport.findFirst({
      where: { id, organizationId },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    await prisma.complianceReport.delete({ where: { id } });
  },
};

// ─── PDF Generation ───────────────────────────────────────────────────────────

// Colours
const RED    = '#dc2626';
const BLACK  = '#111111';
const GRAY1  = '#444444';  // body text
const GRAY2  = '#777777';  // labels / muted
const GRAY3  = '#e8e8e8';  // table header bg
const GRAY4  = '#f4f4f4';  // alternating row bg / meta block
const BORDER = '#d0d0d0';

// Layout constants (A4: 595 × 842pt, margins 48pt each side → content = 499pt wide)
const ML = 48;  // margin left
const MR = 48;  // margin right

type AuditLogWithAgent = {
  id: string;
  action: string;
  agentId: string | null;
  prompt: string | null;
  response: string | null;
  complianceFlags: string[];
  metadata: unknown;
  createdAt: Date;
  agent?: { name: string; type: string } | null;
};

// Truncate a string to maxLen characters, appending '...' if cut
function trunc(s: string | null | undefined, maxLen: number): string {
  if (!s) return '';
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '...';
}

// Draw a horizontal rule
function hRule(doc: PDFKit.PDFDocument, y: number, color = BORDER): void {
  const w = doc.page.width - ML - MR;
  doc.moveTo(ML, y).lineTo(ML + w, y).strokeColor(color).lineWidth(0.5).stroke();
}

// Repeat the table column headers (used on page 1 and on continuation pages)
function drawTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: Array<{ label: string; x: number; w: number }>,
): number {
  const ROW_H = 18;
  doc.rect(ML, y, doc.page.width - ML - MR, ROW_H).fill(GRAY3);
  cols.forEach(({ label, x, w }) => {
    doc.fillColor(BLACK).fontSize(7.5).font('Helvetica-Bold')
       .text(label, x + 4, y + 5, { width: w - 8, lineBreak: false, ellipsis: true });
  });
  return y + ROW_H;
}

function generatePdf(
  report: { id: string; name: string; dateRangeStart: Date; dateRangeEnd: Date },
  logs: AuditLogWithAgent[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: ML, size: 'A4', autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const CW = doc.page.width - ML - MR;   // content width: 499pt
    const genDate  = new Date().toISOString().slice(0, 10);
    const dateFrom = report.dateRangeStart.toISOString().slice(0, 10);
    const dateTo   = report.dateRangeEnd.toISOString().slice(0, 10);
    const violations = logs.filter(l => l.complianceFlags.length > 0).length;

    // ── 1. Header bar ─────────────────────────────────────────────────
    const HDR_H = 60;
    doc.rect(ML, 40, CW, HDR_H).fill(BLACK);

    // Logo: red "A" + white "gentAudit"
    doc.fillColor(RED).fontSize(22).font('Helvetica-Bold')
       .text('A', ML + 18, 53);
    doc.fillColor('white').fontSize(22).font('Helvetica')
       .text('gentAudit', ML + 18 + doc.widthOfString('A') + 1, 53);

    // Sub-label left, generated date right — both on same baseline
    doc.fillColor('#aaaaaa').fontSize(8).font('Helvetica')
       .text('Compliance Report', ML + 18, 77);
    doc.fillColor('#aaaaaa').fontSize(8).font('Helvetica')
       .text(`Generated: ${genDate}`, ML, 77, { width: CW - 18, align: 'right' });

    // ── 2. Report title + meta block ──────────────────────────────────
    const META_Y  = 40 + HDR_H + 16;
    const META_H  = 74;
    doc.rect(ML, META_Y, CW, META_H).fillAndStroke(GRAY4, BORDER);

    // Report name
    doc.fillColor(BLACK).fontSize(15).font('Helvetica-Bold')
       .text(report.name, ML + 16, META_Y + 14, { width: CW - 32, lineBreak: false, ellipsis: true });

    // Two-column meta grid
    const metaRows = [
      { label: 'Report ID',    value: report.id },
      { label: 'Date range',   value: `${dateFrom}  to  ${dateTo}` },
      { label: 'Total events', value: String(logs.length) },
      { label: 'Violations',   value: String(violations) },
    ];
    const halfW = CW / 2 - 16;
    metaRows.forEach((row, i) => {
      const col = i % 2;
      const line = Math.floor(i / 2);
      const x = ML + 16 + col * (CW / 2);
      const y = META_Y + 36 + line * 17;
      doc.fillColor(GRAY2).fontSize(7.5).font('Helvetica')
         .text(row.label.toUpperCase(), x, y, { width: halfW, lineBreak: false });
      doc.fillColor(BLACK).fontSize(8).font('Helvetica-Bold')
         .text(row.value, x, y + 8, { width: halfW, lineBreak: false, ellipsis: true });
    });

    // ── 3. Summary stat cards ─────────────────────────────────────────
    const STAT_Y = META_Y + META_H + 14;
    const STAT_H = 56;
    const STAT_GAP = 8;
    const STAT_W = Math.floor((CW - STAT_GAP * 2) / 3);

    const stats = [
      { label: 'Total Events',  value: String(logs.length),                                      accent: false },
      { label: 'Violations',    value: String(violations),                                        accent: true  },
      { label: 'Clean Events',  value: String(logs.length - violations),                          accent: false },
    ];

    stats.forEach((stat, i) => {
      const x = ML + i * (STAT_W + STAT_GAP);
      const bg  = stat.accent && violations > 0 ? '#fff2f2' : GRAY4;
      const brd = stat.accent && violations > 0 ? RED       : BORDER;
      const fg  = stat.accent && violations > 0 ? RED       : BLACK;
      doc.rect(x, STAT_Y, STAT_W, STAT_H).fillAndStroke(bg, brd);
      doc.fillColor(fg).fontSize(26).font('Helvetica-Bold')
         .text(stat.value, x, STAT_Y + 8, { width: STAT_W, align: 'center' });
      doc.fillColor(GRAY2).fontSize(8).font('Helvetica')
         .text(stat.label, x, STAT_Y + 38, { width: STAT_W, align: 'center' });
    });

    // ── 4. Audit Log table ────────────────────────────────────────────
    const SECTION_Y = STAT_Y + STAT_H + 20;
    doc.fillColor(BLACK).fontSize(11).font('Helvetica-Bold')
       .text('Audit Log', ML, SECTION_Y);
    hRule(doc, SECTION_Y + 16);

    // Column definitions — widths must sum to CW exactly
    // CW = 499. We use: 80 + 110 + 80 + 44 + 92 + 93 = 499
    const cols = [
      { label: 'Timestamp',         x: ML,           w: 80  },
      { label: 'Action',            x: ML + 80,      w: 110 },
      { label: 'Agent',             x: ML + 190,     w: 80  },
      { label: 'Flags',             x: ML + 270,     w: 44  },
      { label: 'Prompt preview',    x: ML + 314,     w: 92  },
      { label: 'Response preview',  x: ML + 406,     w: 93  },
    ];

    let rowY = drawTableHeader(doc, SECTION_Y + 22, cols);
    const ROW_H   = 20;
    const CELL_FS = 7.5;
    const BOTTOM_MARGIN = 60;  // leave space for footer

    logs.forEach((log, idx) => {
      // Page overflow
      if (rowY + ROW_H > doc.page.height - BOTTOM_MARGIN) {
        drawFooter(doc, CW, report.id);
        doc.addPage();
        rowY = ML;
        hRule(doc, rowY);
        rowY += 8;
        rowY = drawTableHeader(doc, rowY, cols);
      }

      const hasFlag = log.complianceFlags.length > 0;
      const rowBg   = hasFlag ? '#fff6f6' : (idx % 2 === 0 ? 'white' : GRAY4);
      const rowBdr  = hasFlag ? '#f5c6c6' : BORDER;
      doc.rect(ML, rowY, CW, ROW_H).fillAndStroke(rowBg, rowBdr);

      // Timestamp — date and time on two lines to avoid overlap
      const ts = log.createdAt.toISOString();
      doc.fillColor(GRAY1).fontSize(CELL_FS).font('Helvetica')
         .text(ts.slice(0, 10), cols[0].x + 4, rowY + 3, { width: cols[0].w - 8, lineBreak: false });
      doc.fillColor(GRAY2).fontSize(6.5).font('Helvetica')
         .text(ts.slice(11, 19) + ' UTC', cols[0].x + 4, rowY + 11, { width: cols[0].w - 8, lineBreak: false });

      // Action
      doc.fillColor(GRAY1).fontSize(CELL_FS).font('Helvetica')
         .text(log.action, cols[1].x + 4, rowY + 6, { width: cols[1].w - 8, lineBreak: false, ellipsis: true });

      // Agent
      const agentLabel = log.agent?.name ?? (log.agentId ? trunc(log.agentId, 10) : '—');
      doc.fillColor(GRAY1).fontSize(CELL_FS).font('Helvetica')
         .text(agentLabel, cols[2].x + 4, rowY + 6, { width: cols[2].w - 8, lineBreak: false, ellipsis: true });

      // Flags
      if (hasFlag) {
        doc.fillColor(RED).fontSize(CELL_FS).font('Helvetica-Bold')
           .text(String(log.complianceFlags.length), cols[3].x + 4, rowY + 6, { width: cols[3].w - 8, align: 'center', lineBreak: false });
      } else {
        doc.fillColor(GRAY2).fontSize(CELL_FS).font('Helvetica')
           .text('—', cols[3].x + 4, rowY + 6, { width: cols[3].w - 8, align: 'center', lineBreak: false });
      }

      // Prompt preview
      doc.fillColor(GRAY1).fontSize(CELL_FS).font('Helvetica')
         .text(trunc(log.prompt, 38), cols[4].x + 4, rowY + 6, { width: cols[4].w - 8, lineBreak: false, ellipsis: true });

      // Response preview
      doc.fillColor(GRAY1).fontSize(CELL_FS).font('Helvetica')
         .text(trunc(log.response, 38), cols[5].x + 4, rowY + 6, { width: cols[5].w - 8, lineBreak: false, ellipsis: true });

      rowY += ROW_H;
    });

    // Empty state
    if (logs.length === 0) {
      doc.fillColor(GRAY2).fontSize(9).font('Helvetica')
         .text('No audit logs found for this date range.', ML, rowY + 12, { width: CW, align: 'center' });
    }

    // ── 5. Footer on last page ────────────────────────────────────────
    drawFooter(doc, CW, report.id);

    doc.end();
  });
}

function drawFooter(doc: PDFKit.PDFDocument, CW: number, reportId: string): void {
  const footerY = doc.page.height - 36;
  hRule(doc, footerY - 8);
  doc.fillColor(GRAY2).fontSize(7).font('Helvetica')
     .text('AgentAudit  —  agentaudit.online', ML, footerY, { width: CW / 2, lineBreak: false });
  doc.fillColor(GRAY2).fontSize(7).font('Helvetica')
     .text(`Report ID: ${reportId}`, ML, footerY, { width: CW, align: 'right', lineBreak: false });
}
