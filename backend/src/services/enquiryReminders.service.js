// backend/src/services/enquiryReminders.service.js
//
// ENQUIRY REMINDERS — an enquiry that is still sitting at plain "Enquiry" (no rates asked,
// nothing filled in) is moved to Cancelled after 5 days. Before that happens the person
// who owns it is told twice:
//   day 2  -> "No rates yet - get the rates or cancel it"
//   day 3+ -> "N days left before this is cancelled automatically"
// "Reopen" restarts the clock, so the reminders start again from day 2.
//
// Who is told: the creator and the co-handler of the shipment (bell), plus one email per
// person per day when REMINDERS_MODE=live. Uses the same REMINDERS_MODE as the main reminders:
//   off | dry (only logs) | bell | live.
// Runs from the same 20-minute timer in server.js, India time, never on Sundays or 8 PM - 9 AM.

const prisma = require('../utils/prisma');
const { sendReminderDigestEmail } = require('../utils/emailService');
const { clockFor, lastReopenedMap, REMINDER_DAYS, WARNING_DAYS, STALE_DAYS } = require('../controllers/enquiryCleanup.controller');

const IST_OFFSET_MS = 330 * 60000;
const DAY_MS = 86400000;
const dryLogged = new Set();

function istNow() {
  const t = new Date(Date.now() + IST_OFFSET_MS);
  return { day: t.toISOString().slice(0, 10), hour: t.getUTCHours(), weekday: t.getUTCDay() };
}

async function runEnquirySweep({ force = false } = {}) {
  const mode = (process.env.REMINDERS_MODE || 'dry').toLowerCase();
  if (mode === 'off') return { skipped: 'off' };

  const now = istNow();
  if (!force && (now.weekday === 0 || now.hour < 9 || now.hour >= 20)) return { skipped: 'quiet hours / Sunday' };

  const frontendUrl = (process.env.FRONTEND_URL || 'https://pas-freight-system.onrender.com').replace(/\/$/, '');
  const since = process.env.REMINDERS_SINCE ? new Date(process.env.REMINDERS_SINCE) : new Date(Date.now() - 30 * DAY_MS);

  const enquiries = await prisma.shipment.findMany({
    where: {
      isDeleted: false, isArchived: false, currentStatus: 'ENQUIRY',
      createdAt: { gte: since, lte: new Date(Date.now() - REMINDER_DAYS * DAY_MS) }
    },
    select: {
      id: true, refNo: true, createdAt: true, createdById: true, coHandlerId: true,
      freightForwarding: { select: { customerName: true, consigneeName: true, shipperName: true } }
    }
  });
  if (!enquiries.length) return { enquiries: 0 };

  const reopened = await lastReopenedMap(enquiries.map((e) => e.id));
  const due = [];
  enquiries.forEach((e) => {
    const c = clockFor(e.createdAt, reopened[e.id]);
    if (c.stale || c.age < REMINDER_DAYS) return;
    // one reminder key per "clock start", so a Reopen starts the reminders again
    const start = reopened[e.id] && new Date(reopened[e.id]) > new Date(e.createdAt) ? reopened[e.id] : e.createdAt;
    const stamp = new Date(start).toISOString().slice(0, 10);
    const rungs = [`D2-${stamp}`];
    if (c.age >= WARNING_DAYS) rungs.push(`D3-${stamp}`);
    due.push({ e, c, rungs, effective: rungs[rungs.length - 1] });
  });
  if (!due.length) return { enquiries: enquiries.length, due: 0 };

  const done = await prisma.reminderLog.findMany({
    where: { step: 'ENQUIRY', shipmentId: { in: due.map((d) => d.e.id) } },
    select: { shipmentId: true, rung: true }
  });
  const sent = new Set(done.map((d) => `${d.shipmentId}|${d.rung}`));

  const ownerIds = [...new Set(due.flatMap((d) => [d.e.createdById, d.e.coHandlerId]).filter(Boolean))];
  const users = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  const perUser = new Map();
  const toMark = [];
  for (const d of due) {
    if (sent.has(`${d.e.id}|${d.effective}`)) continue;
    const ff = d.e.freightForwarding || {};
    const customer = ff.customerName || ff.consigneeName || ff.shipperName || '-';
    const owners = [d.e.createdById, d.e.coHandlerId].map((id) => byId.get(id)).filter(Boolean);
    const warning = d.c.age >= WARNING_DAYS;
    const row = {
      refNo: d.e.refNo, customer, shipmentId: d.e.id, daysLeft: d.c.daysLeft, warning,
      cancelDay: new Date(Date.now() + d.c.daysLeft * DAY_MS + IST_OFFSET_MS).toISOString().slice(0, 10)
    };
    if (mode === 'dry') {
      const key = `${d.e.id}|${d.effective}`;
      if (!dryLogged.has(key)) {
        dryLogged.add(key);
        console.log(`[ENQUIRY-DRYRUN] ${warning ? 'WARNING' : 'DAY2'} ${d.e.refNo} (${customer}) ${d.c.daysLeft} day(s) left -> ${owners.map((u) => u.name).join(', ') || 'NO OWNER FOUND'}`);
      }
      continue;
    }
    owners.forEach((u) => {
      if (!perUser.has(u.id)) perUser.set(u.id, { user: u, rows: [] });
      perUser.get(u.id).rows.push(row);
    });
    d.rungs.forEach((r) => { if (!sent.has(`${d.e.id}|${r}`)) toMark.push({ shipmentId: d.e.id, step: 'ENQUIRY', rung: r }); });
  }
  if (mode === 'dry') return { dry: true, due: due.length };

  const dayStart = new Date(Date.parse(`${now.day}T00:00:00.000Z`) - IST_OFFSET_MS);
  let bells = 0, emails = 0;
  for (const { user, rows } of perUser.values()) {
    for (const r of rows) {
      await prisma.notification.create({
        data: {
          userId: user.id, shipmentId: r.shipmentId, refNo: r.refNo,
          title: r.warning ? `Enquiry will be cancelled in ${r.daysLeft} day(s)` : 'Enquiry has no rates yet',
          message: `${r.refNo} - ${r.customer}. ${r.warning ? 'Get the rates / quote it, or it moves to Cancelled' : 'Ask for rates, or cancel it if the customer has gone quiet'} (${r.daysLeft} day(s) left).`,
          type: 'REMINDER', icon: 'bell'
        }
      }).catch((err) => console.error('[ENQUIRY] bell failed:', err.message));
      bells++;
    }
    if (mode === 'live' && user.email) {
      const today = await prisma.reminderLog.count({ where: { step: 'ENQ_DIGEST', rung: user.id, createdAt: { gte: dayStart } } });
      if (today < 1) {
        try {
          await sendReminderDigestEmail({
            to: user.email, name: user.name,
            rows: rows.map((r) => ({
              refNo: r.refNo, customer: r.customer, mode: 'Enquiry',
              label: r.warning ? `Cancels automatically in ${r.daysLeft} day(s)` : 'No rates asked yet',
              missing: 'Rates / quotation (or cancel it)', dueDay: r.cancelDay, lateDays: 0, shipmentId: r.shipmentId
            })),
            frontendUrl
          });
          await prisma.reminderLog.create({ data: { shipmentId: 'GLOBAL', step: 'ENQ_DIGEST', rung: user.id } });
          emails++;
        } catch (err) { console.error('[ENQUIRY] email failed:', user.email, err.message); }
      }
    }
  }
  for (const m of toMark) await prisma.reminderLog.create({ data: m }).catch(() => {});
  console.log(`[ENQUIRY] mode=${mode} due=${due.length} bells=${bells} emails=${emails}`);
  return { due: due.length, bells, emails };
}

module.exports = { runEnquirySweep };