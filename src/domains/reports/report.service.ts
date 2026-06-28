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

const BRAND_RED = '#dc2626';
const TEXT_DARK = '#0c0c0c';
const TEXT_MID = '#444444';
const TEXT_LIGHT = '#888888';
const BG_LIGHT = '#f5f5f5';
const BORDER = '#e0e0e0';

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

function generatePdf(report: { id: string; name: string; dateRangeStart: Date; dateRangeEnd: Date }, logs: AuditLogWithAgent[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 100; // margins: 50 each side

    // ── Header bar ───────────────────────────────────────────────────
    doc.rect(50, 40, pageWidth, 56).fill(TEXT_DARK);
    doc.fillColor(BRAND_RED).fontSize(20).font('Helvetica-Bold')
       .text('A', 68, 53, { continued: true })
       .fillColor('white').font('Helvetica')
       .text('gentAudit', { continued: false });
    doc.fillColor('white').fontSize(9).font('Helvetica')
       .text('Compliance Report', 68, 76);
    doc.fillColor('white').fontSize(9).font('Helvetica')
       .text(`Generated: ${new Date().toISOString().slice(0, 10)}`, 50, 76, { align: 'right', width: pageWidth });

    // ── Report metadata block ─────────────────────────────────────────
    const metaY = 116;
    doc.rect(50, metaY, pageWidth, 72).fillAndStroke(BG_LIGHT, BORDER);

    doc.fillColor(TEXT_DARK).fontSize(14).font('Helvetica-Bold')
       .text(report.name, 66, metaY + 12, { width: pageWidth - 32 });

    const metaItems = [
      { label: 'Report ID', value: report.id },
      { label: 'Date Range', value: `${report.dateRangeStart.toISOString().slice(0, 10)} → ${report.dateRangeEnd.toISOString().slice(0, 10)}` },
      { label: 'Total Events', value: String(logs.length) },
      { label: 'Violations', value: String(logs.filter(l => l.complianceFlags.length > 0).length) },
    ];

    metaItems.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 66 + col * (pageWidth / 2);
      const y = metaY + 34 + row * 16;
      doc.fillColor(TEXT_LIGHT).fontSize(8).font('Helvetica').text(`${item.label}: `, x, y, { continued: true });
      doc.fillColor(TEXT_DARK).fontSize(8).font('Helvetica-Bold').text(item.value);
    });

    // ── Summary stats row ─────────────────────────────────────────────
    const statsY = metaY + 84;
    const statBoxW = (pageWidth - 8) / 3;
    const statLabels = [
      { label: 'Total Events', value: String(logs.length) },
      { label: 'Violations', value: String(logs.filter(l => l.complianceFlags.length > 0).length) },
      { label: 'Clean Events', value: String(logs.filter(l => l.complianceFlags.length === 0).length) },
    ];

    statLabels.forEach((stat, i) => {
      const x = 50 + i * (statBoxW + 4);
      const isViolations = stat.label === 'Violations';
      doc.rect(x, statsY, statBoxW, 52).fillAndStroke(isViolations ? '#fff5f5' : BG_LIGHT, isViolations ? BRAND_RED : BORDER);
      doc.fillColor(isViolations ? BRAND_RED : TEXT_DARK).fontSize(22).font('Helvetica-Bold')
         .text(stat.value, x, statsY + 8, { width: statBoxW, align: 'center' });
      doc.fillColor(TEXT_LIGHT).fontSize(8).font('Helvetica')
         .text(stat.label, x, statsY + 34, { width: statBoxW, align: 'center' });
    });

    // ── Section: Audit Log ────────────────────────────────────────────
    const tableY = statsY + 68;
    doc.fillColor(TEXT_DARK).fontSize(11).font('Helvetica-Bold')
       .text('Audit Log', 50, tableY);
    doc.moveTo(50, tableY + 16).lineTo(50 + pageWidth, tableY + 16).strokeColor(BORDER).stroke();

    // Table header
    const colWidths = [40, 90, 80, 55, 90, 80];
    const colHeaders = ['Time', 'Action', 'Agent', 'Flags', 'Prompt (preview)', 'Response (preview)'];
    const colX = colWidths.reduce<number[]>((acc, w, i) => { acc.push((acc[i - 1] ?? 50) + (i === 0 ? 0 : colWidths[i - 1])); return acc; }, [50]);

    const headerRowY = tableY + 22;
    doc.rect(50, headerRowY - 3, pageWidth, 14).fill('#e8e8e8');
    colHeaders.forEach((h, i) => {
      doc.fillColor(TEXT_DARK).fontSize(7).font('Helvetica-Bold')
         .text(h, colX[i] + 2, headerRowY, { width: colWidths[i] - 4, lineBreak: false });
    });

    // Table rows
    let rowY = headerRowY + 16;
    const ROW_H = 22;
    const MAX_PREVIEW = 28;

    for (const log of logs) {
      if (rowY + ROW_H > doc.page.height - 60) {
        doc.addPage();
        rowY = 50;
        // Repeat header on new page
        doc.rect(50, rowY - 3, pageWidth, 14).fill('#e8e8e8');
        colHeaders.forEach((h, i) => {
          doc.fillColor(TEXT_DARK).fontSize(7).font('Helvetica-Bold')
             .text(h, colX[i] + 2, rowY, { width: colWidths[i] - 4, lineBreak: false });
        });
        rowY += 16;
      }

      const rowBg = log.complianceFlags.length > 0 ? '#fff8f8' : (logs.indexOf(log) % 2 === 0 ? 'white' : '#fafafa');
      doc.rect(50, rowY - 2, pageWidth, ROW_H).fillAndStroke(rowBg, BORDER);

      const timeStr = log.createdAt.toISOString().replace('T', ' ').slice(0, 16);
      const agentStr = log.agent?.name ?? (log.agentId ? log.agentId.slice(0, 8) + '…' : '—');
      const flagStr = log.complianceFlags.length > 0 ? `⚠ ${log.complianceFlags.length}` : '—';
      const promptStr = (log.prompt ?? '').slice(0, MAX_PREVIEW) + ((log.prompt?.length ?? 0) > MAX_PREVIEW ? '…' : '');
      const responseStr = (log.response ?? '').slice(0, MAX_PREVIEW) + ((log.response?.length ?? 0) > MAX_PREVIEW ? '…' : '');

      const rowValues = [timeStr, log.action, agentStr, flagStr, promptStr, responseStr];
      const flagColor = log.complianceFlags.length > 0 ? BRAND_RED : TEXT_DARK;

      rowValues.forEach((val, i) => {
        const color = i === 3 ? flagColor : TEXT_MID;
        doc.fillColor(color).fontSize(6.5).font('Helvetica')
           .text(val, colX[i] + 2, rowY + 4, { width: colWidths[i] - 4, lineBreak: false });
      });

      rowY += ROW_H;
    }

    // ── Footer ────────────────────────────────────────────────────────
    const footerY = doc.page.height - 40;
    doc.moveTo(50, footerY - 6).lineTo(50 + pageWidth, footerY - 6).strokeColor(BORDER).stroke();
    doc.fillColor(TEXT_LIGHT).fontSize(7).font('Helvetica')
       .text('Generated by AgentAudit — agentaudit.online', 50, footerY, { align: 'left', width: pageWidth / 2 });
    doc.fillColor(TEXT_LIGHT).fontSize(7).font('Helvetica')
       .text(`Report ID: ${report.id}`, 50, footerY, { align: 'right', width: pageWidth });

    doc.end();
  });
}
