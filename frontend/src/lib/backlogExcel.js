// Excel helpers for the Backlog Clean-up page.
// Everything that decides WHAT goes into a sheet, and how a sheet is read back, is plain code in this file.
// Only readWorkbook / downloadWorkbook touch the "xlsx" library, and they load it on demand, so the rest of
// the app does not get heavier.

export const SHEET_KINDS = {
  freight: { label: 'Freight', team: 'freight' },
  customsImport: { label: 'Customs Import', team: 'customs', io: 'Import' },
  customsExport: { label: 'Customs Export', team: 'customs', io: 'Export' },
  invoice: { label: 'Invoice', team: 'invoice' },
}

const INFO_COLUMNS = ['ID', 'Ref No', 'Type', 'Import/Export', 'Created By']

// Which shipments belong on a given sheet: the ones that are still missing something that team fills in.
export function rowsForSheet(rows, fields, kind, includeEnquiries) {
  const spec = SHEET_KINDS[kind]
  const teamKeys = new Set(fields.filter((f) => f.team === spec.team).map((f) => f.key))
  return rows.filter((r) => {
    if (spec.io && r.importExport !== spec.io) return false
    if (!r.missing.some((k) => teamKeys.has(k))) return false
    // Enquiries that were never nominated are mostly not real shipments yet, so the Freight team does not
    // get them by default. If one already has an invoice number it is real, so it stays on the sheet.
    if (kind === 'freight' && r.stage === 'enquiry' && !includeEnquiries && !r.values.invoiceNumber) return false
    return true
  })
}

export function buildSheet(rows, fields, kind) {
  const spec = SHEET_KINDS[kind]
  const cols = fields.filter((f) => f.team === spec.team && (!spec.io || !f.mode || f.mode === spec.io.toLowerCase()))
  const labelOf = Object.fromEntries(fields.map((f) => [f.key, f.label]))
  const teamKeys = new Set(cols.map((c) => c.key))
  const header = [...INFO_COLUMNS, ...(kind === 'freight' ? [] : ['Consignee (info)']), 'Still missing', ...cols.map((c) => c.label)]
  const aoa = [header]
  for (const r of rows) {
    const missingHere = r.missing.filter((k) => teamKeys.has(k)).map((k) => labelOf[k])
    aoa.push([
      r.id, r.refNo, r.shipmentType, r.importExport, r.createdByName,
      ...(kind === 'freight' ? [] : [r.consignee]),
      missingHere.join(', '),
      ...cols.map((c) => (r.required.includes(c.key) ? r.values[c.key] || '' : '')),
    ])
  }
  return { name: spec.label, aoa, widths: header.map((h) => (h === 'ID' ? 10 : h === 'Still missing' ? 36 : Math.max(12, h.length + 2))) }
}

export function readMeSheet(kind) {
  const lines = [
    ['How to fill this sheet'],
    [''],
    ['1. Fill the empty cells in the columns on the right. Leave a cell empty if you do not know the value.'],
    ['2. Do not change, delete or sort-break the ID column. It is how the system knows which shipment a row belongs to.'],
    ['3. Dates: write them as dd-mm-yyyy (for example 05-10-2026) or pick a normal Excel date. Years must be 2020 to 2030.'],
    ['4. Cells that already have a value are shown so you can see them. They are never overwritten, even if you type something different.'],
    ['5. Do not type NA, - or 0 to mean "nothing". Leave the cell empty instead.'],
    ['6. Save the file as .xlsx, then upload it on the Backlog Clean-up page. You see a preview first and nothing is saved until you press Apply.'],
    ['7. No customer emails are sent when old shipments are completed this way.'],
  ]
  return { name: 'Read me', aoa: lines, widths: [110] }
}

// Excel stores a date as a day count from 30 Dec 1899. Converted by hand so the time zone can never shift the day.
export function serialToIso(n) {
  if (!Number.isFinite(n) || n < 61 || n > 80000) return String(n)
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
  return d.toISOString().slice(0, 10)
}

function cellToText(cell, field) {
  if (cell === null || cell === undefined || cell === '' || typeof cell === 'boolean') return ''
  if (cell instanceof Date) {
    const p = (x) => String(x).padStart(2, '0')
    return `${cell.getFullYear()}-${p(cell.getMonth() + 1)}-${p(cell.getDate())}`
  }
  if (typeof cell === 'number') return field.type === 'date' ? serialToIso(cell) : String(cell)
  return String(cell).trim()
}

// sheets: [{ name, aoa }]. Returns the rows to send to the server. Sheets without an ID column (like "Read me") are ignored.
export function parseSheets(sheets, fields) {
  const byLabel = new Map(fields.map((f) => [f.label.toLowerCase(), f]))
  const rows = []
  const used = []
  for (const sheet of sheets) {
    const head = (sheet.aoa[0] || []).map((h) => String(h ?? '').trim())
    const idCol = head.findIndex((h) => h.toLowerCase() === 'id')
    if (idCol < 0) continue
    const refCol = head.findIndex((h) => h.toLowerCase() === 'ref no')
    const cols = []
    head.forEach((h, i) => { const f = byLabel.get(h.toLowerCase()); if (f) cols.push({ i, f }) })
    used.push(sheet.name)
    for (let r = 1; r < sheet.aoa.length; r++) {
      const line = sheet.aoa[r] || []
      const id = cellToText(line[idCol], { type: 'text' })
      const refNo = refCol >= 0 ? cellToText(line[refCol], { type: 'text' }) : ''
      if (!id && !refNo) continue
      const out = {}
      for (const { i, f } of cols) {
        const t = cellToText(line[i], f)
        if (t) out[f.key] = t
      }
      if (Object.keys(out).length) rows.push({ id, refNo, fields: out })
    }
  }
  return { rows, sheetsUsed: used }
}

async function loadXlsx() {
  const mod = await import('xlsx')
  return mod.utils ? mod : mod.default
}

export async function readWorkbook(file) {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return wb.SheetNames.map((name) => ({ name, aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }) }))
}

export async function downloadWorkbook(fileName, sheets) {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa)
    if (s.widths) ws['!cols'] = s.widths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, fileName)
}