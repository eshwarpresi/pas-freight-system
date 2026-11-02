// Read-only. Run from the DSR backend folder:  node dashboardCheck.js
// Asks your own controller for the exact numbers the dashboard cards use, so nothing is re-guessed.
require('dotenv').config()
const path = require('path')

const candidates = [
  './controllers/freightForwarding.controller',
  './src/controllers/freightForwarding.controller',
]
let ctrl = null
for (const c of candidates) {
  try { ctrl = require(path.resolve(__dirname, c)); break } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e }
}
if (!ctrl) {
  console.log('Could not find freightForwarding.controller.js. Tried:', candidates.join(', '))
  process.exit(1)
}

function call(fn, query = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this },
      json(body) { resolve(body) },
    }
    Promise.resolve(fn({ query, params: {}, body: {}, user: { id: 'check', role: 'ADMIN' } }, res)).catch(reject)
  })
}

const pad = (n, w = 7) => String(n).padStart(w)

async function main() {
  const s = (await call(ctrl.getShipmentStats, {})).data || {}
  const b = (await call(ctrl.getShipmentBreakdown, {})).data || {}

  console.log('\nDASHBOARD CARDS (Active tab, no filters)')
  console.log('----------------------------------------')
  const cards = [
    ['Active Shipments', s.total],
    ['Enquiry  (waiting for nomination)', s.pipelineEnquiry],
    ['Freight  (nominated, Freight fields to fill)', s.pipelineNominated],
    ['Customs 1  (Job No, Checklist, Approval, BOE)', s.pipelineCustoms1],
    ['Customs 2  (OOC, Gate Pass, Delivery)', s.pipelineCustoms2],
    ['Pending Invoice', s.pipelineInvoice],
    ['FF Only / Transport / DO Release', s.pipelineSimple],
    ['Cancelled (incl. enquiries stale over 5 days)', s.cancelled],
    ['Invoiced this month', s.monthlyInvoiced],
    ['Invoiced today', s.todayInvoiced],
    ['Created this month', s.monthlyShipments],
  ]
  cards.forEach(([k, v]) => console.log(pad(v), ' ', k))

  const stageSum = (s.pipelineEnquiry || 0) + (s.pipelineNominated || 0) + (s.pipelineCustoms1 || 0) + (s.pipelineCustoms2 || 0) + (s.pipelineInvoice || 0) + (s.pipelineSimple || 0)
  console.log('\nEnquiry + Freight + Customs 1 + Customs 2 + Pending Invoice + FF/Transport/DO =', stageSum)
  console.log('Active Shipments card                                              =', s.total)
  console.log('Difference (fully complete, waiting to archive):', (s.total || 0) - stageSum)

  console.log('\nFULL RECONCILIATION (every shipment in exactly one place)')
  console.log('---------------------------------------------------------')
  console.log(pad(b.total), '  All shipments (not deleted)')
  console.log(pad(b.archived), '  Archived')
  console.log(pad(b.active), '  Active')
  const k = b.breakdown || {}
  console.log('   Active splits into:')
  console.log(pad(k.inProgress), '    Enquiry + Freight')
  console.log(pad(k.pendingCustoms), '    Customs (1 + 2)')
  console.log(pad(k.pendingInvoice), '    Pending Invoice')
  console.log(pad(k.simpleTypesInProgress), '    FF Only / Transport / DO Release')
  console.log(pad(k.cancelled), '    Cancelled / stale enquiry')
  console.log(pad(k.otherActive), '    Other (in none of the above)')
  const sp = b.split || {}
  console.log('\nEnquiry / Freight / Customs split')
  console.log('---------------------------------')
  console.log(pad(sp.enquiry), '  Enquiry')
  console.log(pad(sp.nominated), '  Freight (nominated)')
  console.log('Enquiry + Freight = Freight stage:', sp.sumMatchesFreight ? 'YES' : 'NO')
  console.log(pad(sp.customs1), '  Customs 1')
  console.log(pad(sp.customs2), '  Customs 2')
  console.log('Customs 1 + Customs 2 = Customs:', sp.sumMatchesCustoms ? 'YES' : 'NO')
  console.log('Adds up to the Active total:', b.reconciliation && b.reconciliation.matchesActiveTotal ? 'YES' : 'NO')

  // The same check for each reference-code page (RL, PP, SP, JD): the cards on that page must add up to its Active Shipments.
  console.log('\nREFERENCE-CODE PAGES (cards must add up to Active Shipments)')
  console.log('------------------------------------------------------------')
  for (const group of ['RL', 'PP', 'SP', 'JD']) {
    const g = (await call(ctrl.getShipmentStats, { referenceGroup: group })).data || {}
    const sum = (g.pipelineEnquiry || 0) + (g.pipelineNominated || 0) + (g.pipelineCustoms1 || 0) + (g.pipelineCustoms2 || 0) + (g.pipelineInvoice || 0) + (g.pipelineSimple || 0)
    console.log(`${group}  Active ${pad(g.total, 5)}   Enquiry ${pad(g.pipelineEnquiry, 4)}  Freight ${pad(g.pipelineNominated, 4)}  Customs 1 ${pad(g.pipelineCustoms1, 3)}  Customs 2 ${pad(g.pipelineCustoms2, 3)}  Invoice ${pad(g.pipelineInvoice, 3)}  FF/Tr/DO ${pad(g.pipelineSimple, 3)}   sum ${pad(sum, 5)}   ${sum === g.total ? 'YES' : 'NO (diff ' + (g.total - sum) + ')'}`)
  }

  // The Backlog Clean-up page must show exactly the shipments the cards count, and each one must really be missing something.
  const bl = (await call(ctrl.getBacklog, {})).data || { counts: {}, rows: [] }
  console.log('BACKLOG CLEAN-UP PAGE (must match the cards)')
  console.log('--------------------------------------------')
  const pairs = [['enquiry', 'Enquiry', s.pipelineEnquiry], ['nominated', 'Freight', s.pipelineNominated], ['customs1', 'Customs 1', s.pipelineCustoms1], ['customs2', 'Customs 2', s.pipelineCustoms2], ['invoice', 'Pending Invoice', s.pipelineInvoice], ['simple', 'FF Only / Transport / DO', s.pipelineSimple]]
  for (const [key, label, card] of pairs) {
    const n = bl.counts[key] || 0
    console.log(pad(n), '  ', label.padEnd(26), 'card:', pad(card, 5), n === card ? 'YES' : 'NO (diff ' + (n - card) + ')')
  }
  const rowsWithNothing = (bl.rows || []).filter((r) => !r.missing.length).length
  const ids = new Set((bl.rows || []).map((r) => r.id))
  console.log(pad(bl.total), '   shipments on the page,', ids.size === (bl.rows || []).length ? 'no duplicates' : 'DUPLICATES FOUND')
  console.log('Shipments listed with nothing missing:', rowsWithNothing, rowsWithNothing === 0 ? '(good)' : '(these are complete and should archive on the next save)')
  const byField = {}
  for (const r of bl.rows || []) for (const k of r.missing) byField[k] = (byField[k] || 0) + 1
  console.log('Most common missing fields:', Object.entries(byField).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + v).join(', '))
  console.log('')
}

main().catch((e) => console.error('Failed:', e.message)).finally(() => process.exit(0))