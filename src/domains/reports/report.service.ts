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
    // Force cursor to the correct y before each cell
    doc.y = y + 5;
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
    const HDR_H = 64;
    const HDR_Y = 40;
    doc.rect(ML, HDR_Y, CW, HDR_H).fill(BLACK);

    // Logo — measure "A" width at the correct font/size so placement is exact
    doc.font('Helvetica-Bold').fontSize(24);
    const aWidth = doc.widthOfString('A');
    const logoY = HDR_Y + 16;
    doc.y = logoY;
    doc.fillColor(RED).text('A', ML + 20, logoY, { lineBreak: false });
    doc.y = logoY;
    doc.fillColor('white').font('Helvetica').fontSize(24)
       .text('gentAudit', ML + 20 + aWidth + 1, logoY, { lineBreak: false });

    // Subtitle row — pinned to subY, one left, one right
    const subY = HDR_Y + 44;
    doc.y = subY;
    doc.fillColor('#999999').font('Helvetica').fontSize(8)
       .text('Compliance Report', ML + 20, subY, { lineBreak: false });
    doc.y = subY;
    doc.fillColor('#999999').font('Helvetica').fontSize(8)
       .text(`Generated: ${genDate}`, ML, subY, { width: CW, align: 'right', lineBreak: false });

    // ── 2. Report title + meta block ──────────────────────────────────
    // Layout: title row (24pt) + 2 label rows × 20pt each + padding = 96pt total
    const META_Y = HDR_Y + HDR_H + 14;
    const META_H = 96;
    doc.rect(ML, META_Y, CW, META_H).fillAndStroke(GRAY4, BORDER);

    // Report name on its own row
    const titleY = META_Y + 14;
    doc.y = titleY;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(14)
       .text(report.name, ML + 16, titleY, { width: CW - 32, lineBreak: false, ellipsis: true });

    // Divider under title
    doc.moveTo(ML + 16, META_Y + 36).lineTo(ML + CW - 16, META_Y + 36)
       .strokeColor(BORDER).lineWidth(0.5).stroke();

    // Two-column grid — all 4 items at fully explicit absolute coordinates
    // Row 0: Report ID (left col) | Date range (right col)
    // Row 1: Total events (left col) | Violations (right col)
    const COL_L = ML + 16;
    const COL_R = ML + 16 + Math.floor(CW / 2) + 8;
    const HALF  = Math.floor(CW / 2) - 24;
    const R0_LABEL_Y = META_Y + 44;
    const R0_VAL_Y   = META_Y + 54;
    const R1_LABEL_Y = META_Y + 68;
    const R1_VAL_Y   = META_Y + 78;

    // Row 0 — each call explicitly resets doc.y first
    doc.y = R0_LABEL_Y;
    doc.fillColor(GRAY2).font('Helvetica').fontSize(7)
       .text('REPORT ID', COL_L, R0_LABEL_Y, { width: HALF, lineBreak: false });
    doc.y = R0_VAL_Y;
    doc.fillColor(BLACK).font('Helvetica').fontSize(8)
       .text(report.id, COL_L, R0_VAL_Y, { width: HALF, lineBreak: false, ellipsis: true });

    doc.y = R0_LABEL_Y;
    doc.fillColor(GRAY2).font('Helvetica').fontSize(7)
       .text('DATE RANGE', COL_R, R0_LABEL_Y, { width: HALF, lineBreak: false });
    doc.y = R0_VAL_Y;
    doc.fillColor(BLACK).font('Helvetica').fontSize(8)
       .text(`${dateFrom}  –  ${dateTo}`, COL_R, R0_VAL_Y, { width: HALF, lineBreak: false });

    // Row 1
    doc.y = R1_LABEL_Y;
    doc.fillColor(GRAY2).font('Helvetica').fontSize(7)
       .text('TOTAL EVENTS', COL_L, R1_LABEL_Y, { width: HALF, lineBreak: false });
    doc.y = R1_VAL_Y;
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(8)
       .text(String(logs.length), COL_L, R1_VAL_Y, { width: HALF, lineBreak: false });

    doc.y = R1_LABEL_Y;
    doc.fillColor(GRAY2).font('Helvetica').fontSize(7)
       .text('VIOLATIONS', COL_R, R1_LABEL_Y, { width: HALF, lineBreak: false });
    doc.y = R1_VAL_Y;
    doc.fillColor(violations > 0 ? RED : BLACK).font('Helvetica-Bold').fontSize(8)
       .text(String(violations), COL_R, R1_VAL_Y, { width: HALF, lineBreak: false });

    // ── 3. Summary stat cards ─────────────────────────────────────────
    // Three equal cards that span exactly CW with no gaps
    const STAT_Y  = META_Y + META_H + 14;
    const STAT_H  = 60;
    const STAT_W  = Math.floor(CW / 3);          // 166pt each
    const STAT_W3 = CW - STAT_W * 2;              // last card absorbs rounding: 167pt

    const stats = [
      { label: 'Total Events', value: String(logs.length),           accent: false },
      { label: 'Violations',   value: String(violations),            accent: true  },
      { label: 'Clean Events', value: String(logs.length - violations), accent: false },
    ];

    stats.forEach((stat, i) => {
      const x  = ML + i * STAT_W;
      const sw = i === 2 ? STAT_W3 : STAT_W;
      const isRed = stat.accent && violations > 0;
      doc.rect(x, STAT_Y, sw, STAT_H).fillAndStroke(isRed ? '#fff2f2' : GRAY4, isRed ? RED : BORDER);
      doc.y = STAT_Y + 10;
      doc.fillColor(isRed ? RED : BLACK).font('Helvetica-Bold').fontSize(28)
         .text(stat.value, x, STAT_Y + 10, { width: sw, align: 'center', lineBreak: false });
      doc.y = STAT_Y + 42;
      doc.fillColor(GRAY2).font('Helvetica').fontSize(8)
         .text(stat.label, x, STAT_Y + 42, { width: sw, align: 'center', lineBreak: false });
    });

    // ── 4. Audit Log table ────────────────────────────────────────────
    const SECTION_Y = STAT_Y + STAT_H + 20;
    doc.y = SECTION_Y;
    doc.fillColor(BLACK).fontSize(11).font('Helvetica-Bold')
       .text('Audit Log', ML, SECTION_Y, { lineBreak: false });
    hRule(doc, SECTION_Y + 16);

    // Column definitions — widths must sum to CW exactly
    // CW = 499. We use: 80 + 110 + 80 + 44 + 92 + 93 = 499
    const cols = [
      { label: 'Timestamp',  x: ML,           w: 80  },
      { label: 'Action',     x: ML + 80,      w: 110 },
      { label: 'Agent',      x: ML + 190,     w: 80  },
      { label: 'Flags',      x: ML + 270,     w: 44  },
      { label: 'Prompt',     x: ML + 314,     w: 92  },
      { label: 'Response',   x: ML + 406,     w: 93  },
    ];

    let rowY = drawTableHeader(doc, SECTION_Y + 22, cols);
    const ROW_H        = 24;   // tall enough for 2-line timestamp
    const CELL_FS      = 7.5;
    // Stop adding rows when we'd invade footer territory.
    // Footer sits at page.height - margins.bottom(48) - 16 = ~778pt.
    // Leave 40pt above footer for the rule + breathing room → limit = 778 - 40 = 738.
    const BOTTOM_MARGIN = doc.page.margins.bottom + 56;

    // Helper: draw one text cell at an exact position.
    // Directly assigns doc.y before rendering so PDFKit always honours the
    // requested y coordinate, regardless of where the cursor currently sits.
    function cell(
      color: string,
      size: number,
      fontName: string,
      value: string,
      x: number,
      y: number,
      w: number,
      align: 'left' | 'center' = 'left',
    ): void {
      doc.y = y;
      doc.fillColor(color).fontSize(size).font(fontName)
         .text(value, x, y, { width: w, lineBreak: false, ellipsis: true, align });
    }

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

      const mid = rowY + 8;   // vertical centre for single-line cells (ROW_H=24, font≈8pt)
      const ts  = log.createdAt.toISOString();

      // Timestamp: two lines stacked, each via cell() so cursor stays put
      cell(GRAY1, CELL_FS, 'Helvetica', ts.slice(0, 10),         cols[0].x + 4, rowY + 4,  cols[0].w - 8);
      cell(GRAY2, 6.5,     'Helvetica', ts.slice(11, 19) + ' UTC', cols[0].x + 4, rowY + 13, cols[0].w - 8);

      // Single-line cells — all at mid-row Y
      cell(GRAY1, CELL_FS, 'Helvetica',      log.action,                                     cols[1].x + 4, mid, cols[1].w - 8);
      cell(GRAY1, CELL_FS, 'Helvetica',      log.agent?.name ?? (log.agentId ? trunc(log.agentId, 10) : '—'), cols[2].x + 4, mid, cols[2].w - 8);
      cell(hasFlag ? RED : GRAY2, CELL_FS, hasFlag ? 'Helvetica-Bold' : 'Helvetica',
           hasFlag ? String(log.complianceFlags.length) : '—',    cols[3].x + 4, mid, cols[3].w - 8, 'center');
      cell(GRAY1, CELL_FS, 'Helvetica',      trunc(log.prompt,   20),                        cols[4].x + 4, mid, cols[4].w - 8);
      cell(GRAY1, CELL_FS, 'Helvetica',      trunc(log.response, 20),                        cols[5].x + 4, mid, cols[5].w - 8);

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
  // Must stay within doc.page.height - page.margins.bottom (48pt) - lineHeight (~9pt)
  // = 841.89 - 48 - 9 = ~784pt. Use 776 to be safe and leave room for the rule above.
  const footerY = doc.page.height - doc.page.margins.bottom - 16;
  hRule(doc, footerY - 8);
  doc.y = footerY;
  doc.fillColor(GRAY2).fontSize(7).font('Helvetica')
     .text('AgentAudit  —  agentaudit.online', ML, footerY, { width: CW / 2, lineBreak: false });
  doc.y = footerY;
  doc.fillColor(GRAY2).fontSize(7).font('Helvetica')
     .text(`Report ID: ${reportId}`, ML, footerY, { width: CW, align: 'right', lineBreak: false });
}
