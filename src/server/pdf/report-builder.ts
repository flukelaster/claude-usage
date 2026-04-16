import { formatTokens, formatCost, formatPercent } from '~/lib/format'
import { getModelDisplayName } from '~/lib/pricing'

/* ── Constants ── */

const PAGE_W = 595.28 // A4
const PAGE_H = 841.89
const MARGIN = 50
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_Y = PAGE_H - 40

const COLOR = {
  terracotta: '#c96442',
  coral: '#d97757',
  nearBlack: '#141413',
  stone: '#87867f',
  olive: '#5e5d59',
  warmSilver: '#b0aea5',
  parchment: '#f5f4ed',
  warmSand: '#e8e6dc',
  borderCream: '#f0eee6',
  white: '#ffffff',
  crimson: '#b53333',
}

// Claude logo SVG path (scaled for PDFKit)
const CLAUDE_LOGO_PATH = 'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z'

/* ── Types ── */

interface ReportData {
  accountName: string
  period: string
  overview: ReturnType<typeof import('~/server/functions/get-overview').queryOverview>
  modelStats: ReturnType<typeof import('~/server/functions/get-model-stats').queryModelStats>
  cacheStats: ReturnType<typeof import('~/server/functions/get-cache-stats').queryCacheStats>
  projects: Array<{
    displayName: string
    sessionCount: number
    messageCount: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCost: number
    lastActiveAt: string | null
  }>
}

/* ── Main ── */

export async function buildReport(data: ReportData): Promise<Buffer> {
  // Dynamic import to avoid bundling PDFKit for the browser
  const { default: PDFDocument } = await import('pdfkit')

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: `Claude Code Usage Report — ${data.accountName}`,
        Author: 'Claude Code Usage Dashboard',
        Subject: `Usage report (${data.period})`,
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // ── Page 1: Cover + Overview ──
    drawHeader(doc, data.accountName, data.period)
    drawKpiSection(doc, data.overview.kpi)
    drawTokenBreakdown(doc, data.overview.kpi)

    // ── Page 2: Models + Top Projects ──
    doc.addPage()
    drawSectionTitle(doc, 'Model Usage')
    drawModelTable(doc, data.modelStats.modelStats)
    doc.moveDown(1.5)
    ensureSpace(doc, 200)
    drawSectionTitle(doc, 'Top Projects')
    drawProjectsTable(doc, data.projects)

    // ── Page 3: Cache Analysis ──
    doc.addPage()
    drawSectionTitle(doc, 'Cache Analysis')
    drawCacheKpis(doc, data.cacheStats.overall)
    doc.moveDown(1)
    ensureSpace(doc, 180)
    drawSectionTitle(doc, 'Cache Efficiency by Model')
    drawCacheModelTable(doc, data.cacheStats.modelCacheStats)
    doc.moveDown(1.5)
    ensureSpace(doc, 180)
    drawSectionTitle(doc, 'Cache Efficiency by Project')
    drawCacheProjectTable(doc, data.cacheStats.projectCache)

    // ── Page 4: Recent Sessions ──
    if (data.overview.recentSessions.length > 0) {
      doc.addPage()
      drawSectionTitle(doc, 'Recent Sessions')
      drawSessionsTable(doc, data.overview.recentSessions)
    }

    // ── Draw footers on ALL pages at once (buffered) ──
    // Wrap each page write in save()/restore() so footer rendering cannot
    // accidentally leak fill colors/fonts onto earlier content when PDFKit
    // finalizes the buffered pages.
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      doc.save()
      // Disable bottom margin to prevent auto-paging when writing near page bottom
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(7).fillColor(COLOR.stone)
      doc.text(
        `Page ${i + 1} of ${range.count}  ·  Generated by Claude Code Usage Dashboard`,
        MARGIN,
        FOOTER_Y,
        { width: CONTENT_W, align: 'center', lineBreak: false },
      )
      doc.restore()
    }

    doc.end()
  })
}

/* ── Header ── */

function drawHeader(doc: any, accountName: string, period: string) {
  // Terracotta banner
  doc.rect(0, 0, PAGE_W, 120).fill(COLOR.terracotta)

  // Claude logo
  doc.save()
  doc.translate(MARGIN, 35)
  doc.scale(2)
  doc.path(CLAUDE_LOGO_PATH).fill(COLOR.white)
  doc.restore()

  // Title
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR.white)
  doc.text('Claude Code Usage Report', MARGIN + 60, 40, { width: CONTENT_W - 60 })

  // Account + period
  doc.font('Helvetica').fontSize(11).fillColor('rgba(255,255,255,0.85)')
  doc.text(`${accountName}  ·  ${period}  ·  Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN + 60, 70, { width: CONTENT_W - 60 })

  doc.y = 145
}

/* ── KPI Section ── */

function drawKpiSection(doc: any, kpi: ReportData['overview']['kpi']) {
  const items = [
    { label: 'Estimated Cost', value: formatCost(kpi.totalCost) },
    { label: 'Active Projects', value: String(kpi.activeProjects) },
    { label: 'Sessions', value: String(kpi.activeSessions) },
    { label: 'Cache Hit Rate', value: formatPercent(kpi.cacheHitRate) },
  ]

  const boxW = (CONTENT_W - 15 * 3) / 4
  const boxH = 60
  const startY = doc.y

  items.forEach((item, i) => {
    const x = MARGIN + i * (boxW + 15)
    // Box background
    doc.roundedRect(x, startY, boxW, boxH, 6).fill(COLOR.parchment)
    // Label
    doc.font('Helvetica').fontSize(8).fillColor(COLOR.stone)
    doc.text(item.label, x + 12, startY + 12, { width: boxW - 24 })
    // Value
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR.nearBlack)
    doc.text(item.value, x + 12, startY + 28, { width: boxW - 24 })
  })

  doc.y = startY + boxH + 20
}

/* ── Token Breakdown ── */

function drawTokenBreakdown(doc: any, kpi: ReportData['overview']['kpi']) {
  const total = kpi.totalTokens
  const items = [
    { label: 'Input', value: kpi.totalInputTokens, color: COLOR.terracotta },
    { label: 'Output', value: kpi.totalOutputTokens, color: COLOR.coral },
    { label: 'Cache Write', value: kpi.totalCacheCreationTokens, color: COLOR.stone },
    { label: 'Cache Read', value: kpi.totalCacheReadTokens, color: COLOR.warmSilver },
  ]

  const startY = doc.y
  // Card background
  doc.roundedRect(MARGIN, startY, CONTENT_W, 90, 6).fill(COLOR.parchment)

  // Total
  doc.font('Helvetica').fontSize(8).fillColor(COLOR.stone)
  doc.text('Total Tokens', MARGIN + 15, startY + 12)
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLOR.nearBlack)
  doc.text(formatTokens(total), MARGIN + 15, startY + 28)

  // Items
  const itemStartX = MARGIN + 130
  const itemW = (CONTENT_W - 130 - 15) / 4

  items.forEach((item, i) => {
    const x = itemStartX + i * itemW
    const pct = total > 0 ? (item.value / total) * 100 : 0

    // Label + percentage
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.stone)
    doc.text(item.label, x, startY + 12, { width: itemW - 8 })
    doc.text(`${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%`, x, startY + 12, { width: itemW - 8, align: 'right' })

    // Bar background
    doc.roundedRect(x, startY + 26, itemW - 10, 6, 3).fill(COLOR.warmSand)
    // Bar fill
    const barW = Math.max(2, (itemW - 10) * Math.min(pct / 100, 1))
    doc.roundedRect(x, startY + 26, barW, 6, 3).fill(item.color)

    // Value
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR.nearBlack)
    doc.text(formatTokens(item.value), x, startY + 40, { width: itemW - 8 })
  })

  doc.y = startY + 105
}

/* ── Section Title ── */

function drawSectionTitle(doc: any, title: string) {
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLOR.nearBlack)
  doc.text(title, MARGIN, doc.y)
  // Underline
  const lineY = doc.y + 4
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
    .strokeColor(COLOR.warmSand).lineWidth(1).stroke()
  doc.y = lineY + 12
}

/* ── Generic Table ── */

interface TableColumn {
  label: string
  width: number
  align?: 'left' | 'right' | 'center'
}

function drawTable(doc: any, columns: TableColumn[], rows: string[][]) {
  const startX = MARGIN
  const rowH = 22
  const headerH = 24
  let y = doc.y

  // Header
  doc.roundedRect(startX, y, CONTENT_W, headerH, 4).fill(COLOR.parchment)
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.stone)
  let x = startX + 8
  columns.forEach((col) => {
    doc.text(col.label, x, y + 7, { width: col.width - 8, align: col.align ?? 'left' })
    x += col.width
  })
  y += headerH

  // Empty-state: draw an "(No data)" cell so the header isn't orphaned.
  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR.stone)
    doc.text('(No data)', startX + 8, y + 6, { width: CONTENT_W - 16 })
    y += rowH
    doc.moveTo(startX, y).lineTo(startX + CONTENT_W, y)
      .strokeColor(COLOR.warmSand).lineWidth(0.5).stroke()
    doc.y = y + 8
    return
  }

  // Rows
  doc.font('Helvetica').fontSize(9).fillColor(COLOR.nearBlack)
  rows.forEach((row, ri) => {
    // Page break check
    if (y + rowH > FOOTER_Y - 20) {
      doc.addPage()
      y = MARGIN
      // Re-draw header
      doc.roundedRect(startX, y, CONTENT_W, headerH, 4).fill(COLOR.parchment)
      doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR.stone)
      let hx = startX + 8
      columns.forEach((col) => {
        doc.text(col.label, hx, y + 7, { width: col.width - 8, align: col.align ?? 'left' })
        hx += col.width
      })
      y += headerH
      doc.font('Helvetica').fontSize(9).fillColor(COLOR.nearBlack)
    }

    // Zebra stripe
    if (ri % 2 === 0) {
      doc.rect(startX, y, CONTENT_W, rowH).fill('#fafaf7')
      doc.fillColor(COLOR.nearBlack)
    }

    x = startX + 8
    row.forEach((cell, ci) => {
      doc.text(cell, x, y + 6, { width: columns[ci].width - 8, align: columns[ci].align ?? 'left' })
      x += columns[ci].width
    })
    y += rowH
  })

  // Bottom border
  doc.moveTo(startX, y).lineTo(startX + CONTENT_W, y)
    .strokeColor(COLOR.warmSand).lineWidth(0.5).stroke()

  doc.y = y + 8
}

/* ── Model Table ── */

function drawModelTable(doc: any, stats: ReportData['modelStats']['modelStats']) {
  const cols: TableColumn[] = [
    { label: 'Model', width: 110 },
    { label: 'Cost', width: 80, align: 'right' },
    { label: 'Input Tokens', width: 85, align: 'right' },
    { label: 'Output Tokens', width: 85, align: 'right' },
    { label: 'Sessions', width: 65, align: 'right' },
    { label: 'Avg/Session', width: 70, align: 'right' },
  ]

  const rows = stats
    .sort((a, b) => b.totalCost - a.totalCost)
    .map((m) => [
      getModelDisplayName(m.model),
      formatCost(m.totalCost),
      formatTokens(m.totalInputTokens),
      formatTokens(m.totalOutputTokens),
      String(m.sessionCount),
      m.sessionCount > 0 ? formatCost(m.totalCost / m.sessionCount) : '—',
    ])

  drawTable(doc, cols, rows)
}

/* ── Projects Table ── */

function drawProjectsTable(doc: any, projects: ReportData['projects']) {
  const cols: TableColumn[] = [
    { label: 'Project', width: 160 },
    { label: 'Cost', width: 80, align: 'right' },
    { label: 'Tokens', width: 90, align: 'right' },
    { label: 'Sessions', width: 65, align: 'right' },
    { label: 'Messages', width: 70, align: 'right' },
  ]

  const rows = projects
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 15)
    .map((p) => [
      p.displayName,
      formatCost(p.totalCost),
      formatTokens(p.totalInputTokens + p.totalOutputTokens),
      String(p.sessionCount),
      String(p.messageCount),
    ])

  drawTable(doc, cols, rows)
}

/* ── Cache KPIs ── */

function drawCacheKpis(doc: any, overall: ReportData['cacheStats']['overall']) {
  const items = [
    { label: 'Hit Rate', value: formatPercent(overall.hitRate) },
    { label: 'Savings', value: formatCost(overall.savings) },
    { label: 'Overhead', value: formatCost(overall.overhead) },
    { label: 'Net Savings', value: formatCost(overall.netSavings), highlight: overall.netSavings < 0 },
    { label: 'ROI', value: formatPercent(overall.roi) },
  ]

  const boxW = (CONTENT_W - 10 * 4) / 5
  const boxH = 50
  const startY = doc.y

  items.forEach((item, i) => {
    const x = MARGIN + i * (boxW + 10)
    doc.roundedRect(x, startY, boxW, boxH, 6).fill(COLOR.parchment)
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR.stone)
    doc.text(item.label, x + 10, startY + 10, { width: boxW - 20 })
    doc.font('Helvetica-Bold').fontSize(14).fillColor(item.highlight ? COLOR.crimson : COLOR.nearBlack)
    doc.text(item.value, x + 10, startY + 26, { width: boxW - 20 })
  })

  doc.y = startY + boxH + 15
}

/* ── Cache Model Table ── */

function drawCacheModelTable(doc: any, stats: ReportData['cacheStats']['modelCacheStats']) {
  const cols: TableColumn[] = [
    { label: 'Model', width: 110 },
    { label: 'Hit Rate', width: 70, align: 'right' },
    { label: 'Savings', width: 80, align: 'right' },
    { label: 'Overhead', width: 80, align: 'right' },
    { label: 'Net Savings', width: 80, align: 'right' },
    { label: 'Cache Reads', width: 75, align: 'right' },
  ]

  const rows = stats.map((m) => [
    getModelDisplayName(m.model),
    formatPercent(m.hitRate),
    formatCost(m.savings),
    formatCost(m.overhead),
    formatCost(m.netSavings),
    formatTokens(m.cacheReadTokens),
  ])

  drawTable(doc, cols, rows)
}

/* ── Cache Project Table ── */

function drawCacheProjectTable(doc: any, projects: ReportData['cacheStats']['projectCache']) {
  const cols: TableColumn[] = [
    { label: 'Project', width: 160 },
    { label: 'Hit Rate', width: 75, align: 'right' },
    { label: 'Cache Reads', width: 90, align: 'right' },
    { label: 'Cache Writes', width: 90, align: 'right' },
    { label: 'Cost', width: 80, align: 'right' },
  ]

  const rows = projects.slice(0, 15).map((p) => [
    p.projectName,
    formatPercent(p.hitRate),
    formatTokens(p.cacheReadTokens),
    formatTokens(p.cacheCreationTokens),
    formatCost(p.totalCost),
  ])

  drawTable(doc, cols, rows)
}

/* ── Sessions Table ── */

function drawSessionsTable(doc: any, sessions: ReportData['overview']['recentSessions']) {
  const cols: TableColumn[] = [
    { label: 'Session', width: 170 },
    { label: 'Project', width: 120 },
    { label: 'Started', width: 90 },
    { label: 'Messages', width: 60, align: 'right' },
    { label: 'Cost', width: 55, align: 'right' },
  ]

  const rows = sessions.map((s) => [
    s.title || s.slug || s.id.slice(0, 12),
    s.projectName,
    s.startedAt ? new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
    String(s.messageCount),
    formatCost(s.totalCost ?? 0),
  ])

  drawTable(doc, cols, rows)
}

/* ── Utility ── */

function ensureSpace(doc: any, needed: number) {
  if (doc.y + needed > FOOTER_Y - 20) {
    doc.addPage()
    doc.y = MARGIN
  }
}
