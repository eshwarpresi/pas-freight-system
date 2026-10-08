// backend/src/services/reminders.service.js
//
// SMART REMINDERS — every shipment gets its own "next step" and its own
// due date, worked out from the shipment's own dates (ETD, ETA, BOE date,
// LEO date, delivery date ...). Nothing is a fixed blast.
//
// Routing (who is reminded):
//   FREIGHT step  -> the person who created the shipment (+ co-handler).
//                    If the creator is not in the Freight team, the whole
//                    Freight team gets it instead.
//   CUSTOMS step  -> everyone in the Customs team
//   ACCOUNTS step -> everyone in the Accounts team
//   Anyone saving the pending step ends the reminder for everybody (the
//   engine recomputes the next step on every run).
//
// Ladder (working days only — Sundays never count; India time):
//   SOON  : the working day before the due day          -> bell
//   DUE   : on the due day                              -> bell + email
//   LATE1 : 1 working day late                          -> bell + email, whole responsible team
//   ESC1  : 3 working days late                         -> email to the MD (Shivu)
//   ESC2  : 7 working days late                         -> email to the MD, "escalated again"
//
// MODES (env REMINDERS_MODE):
//   off  - engine does nothing
//   dry  - (DEFAULT) only logs "[REMINDER-DRYRUN] ..." lines, sends nothing
//   bell - in-app bell notifications only
//   live - bell + emails + MD escalation
//
// Other env:
//   REMINDERS_TEAMS      comma list of enabled teams, default FREIGHT,CUSTOMS,ACCOUNTS
//   REMINDERS_SINCE      ISO date; only shipments created on/after it (default: 30 days ago)
//   REMINDERS_MD_EMAIL   escalation recipient (default shivu@pasfreight.com)
//   REMINDERS_MAX_EMAILS_PER_PERSON_PER_DAY  default 2
//   FRONTEND_URL         used for "Open shipment" links

const prisma = require('../utils/prisma');
const { sendReminderDigestEmail, sendEscalationEmail } = require('../utils/emailService');

// ─────────────────────────── time helpers (IST) ───────────────────────────
const IST_OFFSET_MIN = 330;
const DAY_MS = 86400000;

// "YYYY-MM-DD" of the IST calendar day for a Date
function istDay(d) {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60000);
  return t.toISOString().slice(0, 10);
}
// day string -> integer day number (days since epoch, calendar-based)
function dayNum(str) {
  const [y, m, d] = str.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}
function numToDay(n) { return new Date(n * DAY_MS).toISOString().slice(0, 10); }
// 0 = Sunday (1970-01-01 was a Thursday = 4)
function isSunday(n) { return ((n % 7) + 7 + 4) % 7 === 0; }

// add n working days (Sundays skipped). n may be negative.
function addWorkingDays(dayStr, n) {
  let cur = dayNum(dayStr);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    cur += step;
    if (!isSunday(cur)) left--;
  }
  return numToDay(cur);
}
// working days strictly after `fromStr` up to and including `toStr`; negative if to < from
function workingDaysBetween(fromStr, toStr) {
  let a = dayNum(fromStr);
  const b = dayNum(toStr);
  if (a === b) return 0;
  const step = b > a ? 1 : -1;
  let count = 0;
  while (a !== b) {
    a += step;
    if (!isSunday(a)) count++;
  }
  return step * count;
}
// Roll a due day forward if it lands on a Sunday
function nextWorkingDay(dayStr) {
  let n = dayNum(dayStr);
  while (isSunday(n)) n++;
  return numToDay(n);
}

function nowIST() {
  const t = new Date(Date.now() + IST_OFFSET_MIN * 60000);
  return { day: t.toISOString().slice(0, 10), hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

// ─────────────────────────── config ───────────────────────────
function config() {
  const mode = (process.env.REMINDERS_MODE || 'dry').toLowerCase();
  const teams = (process.env.REMINDERS_TEAMS || 'FREIGHT,CUSTOMS,ACCOUNTS')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const since = process.env.REMINDERS_SINCE
    ? new Date(process.env.REMINDERS_SINCE)
    : new Date(Date.now() - 30 * DAY_MS);
  return {
    mode,
    teams,
    since,
    mdEmail: process.env.REMINDERS_MD_EMAIL || 'shivu@pasfreight.com',
    maxEmails: parseInt(process.env.REMINDERS_MAX_EMAILS_PER_PERSON_PER_DAY || '2', 10),
    frontendUrl: (process.env.FRONTEND_URL || 'https://pas-freight-system.onrender.com').replace(/\/$/, ''),
  };
}

// ─────────────────────────── next-step logic ───────────────────────────
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const d2 = (v) => (v ? istDay(new Date(v)) : null);

// Returns { team, step, label, missing, dueDay } or null if nothing is pending
// for reminders (finished, or no sensible next step).
function nextStep(s) {
  const ff = s.freightForwarding || {};
  const cha = s.cha || {};
  const acc = s.accounts || {};
  const created = istDay(new Date(s.createdAt));
  const type = s.shipmentType;
  const isExport = s.importExport === 'Export';

  // Pre-Alerts is a NEW step. Shipments that already have old-workflow AWB
  // data, or any Customs / Accounts data, are clearly past it — never nag
  // about those.
  const pastFreight =
    has(ff.awbDate) || has(ff.mawb) || has(ff.hawb) ||
    Object.values(cha).some(has) || Object.values(acc).some(has);

  const freightStep = () => {
    if (has(ff.preAlertsSentDate) || pastFreight) return null;
    const etd = d2(ff.etd);
    return {
      team: 'FREIGHT', step: 'PRE_ALERTS', label: 'Pre-Alerts not sent', missing: 'Pre-Alerts Sent Date',
      dueDay: etd ? addWorkingDays(etd, -2) : addWorkingDays(created, 5),
    };
  };

  const customsImport = (afterDay) => {
    if (!has(cha.boeNo)) {
      const eta = d2(ff.eta);
      return { team: 'CUSTOMS', step: 'BOE', label: 'BOE not filed', missing: 'BOE No / BOE Date',
        dueDay: eta ? addWorkingDays(eta, -1) : addWorkingDays(afterDay, 3) };
    }
    if (!has(cha.oocDate)) {
      return { team: 'CUSTOMS', step: 'OOC', label: 'OOC pending', missing: 'OOC Date',
        dueDay: addWorkingDays(d2(cha.boeDate) || afterDay, 2) };
    }
    if (!has(cha.gatePassDate) || !has(cha.deliveryDate)) {
      return { team: 'CUSTOMS', step: 'GATE_PASS_DELIVERY', label: 'Gate Pass / Delivery pending',
        missing: !has(cha.gatePassDate) ? 'Gate Pass Date' : 'Delivery Date',
        dueDay: addWorkingDays(d2(cha.oocDate), 2) };
    }
    return null;
  };

  const customsExport = (afterDay) => {
    if (!has(cha.sbNo)) {
      return { team: 'CUSTOMS', step: 'SB', label: 'Shipping Bill not filed', missing: 'SB No / SB Date',
        dueDay: addWorkingDays(afterDay, 3) };
    }
    if (!has(cha.leoDate)) {
      return { team: 'CUSTOMS', step: 'LEO', label: 'LEO pending', missing: 'LEO Date',
        dueDay: addWorkingDays(d2(cha.sbDate) || afterDay, 2) };
    }
    if (!has(cha.handOverDate)) {
      return { team: 'CUSTOMS', step: 'HAND_OVER', label: 'Hand Over pending', missing: 'Hand Over Date',
        dueDay: addWorkingDays(d2(cha.leoDate), 1) };
    }
    return null;
  };

  const accounts = (lastDay) => {
    if (!has(acc.invoiceNumber) || !has(acc.invoiceDate)) {
      return { team: 'ACCOUNTS', step: 'INVOICE', label: 'Invoice not raised',
        missing: !has(acc.invoiceNumber) ? 'Invoice No' : 'Invoice Date',
        dueDay: addWorkingDays(lastDay, 2) };
    }
    if (!has(acc.sendingDate)) {
      return { team: 'ACCOUNTS', step: 'INVOICE_SENT', label: 'Invoice not sent', missing: 'Invoice Sending Date',
        dueDay: addWorkingDays(d2(acc.invoiceDate) || lastDay, 1) };
    }
    return null;
  };

  let out = null;

  if (type === 'FF Only') {
    out = freightStep() || accounts(d2(ff.etd) || created);
  } else if (type === 'DO Release' || type === 'Transport') {
    out = accounts(d2(ff.deliveryDate) || addWorkingDays(created, 3));
  } else if (type === 'CHA Only') {
    out = (isExport ? customsExport(created) : customsImport(created))
       || accounts(d2(isExport ? cha.handOverDate : (cha.deliveryDate || cha.oocDate)) || created);
  } else {
    // Standard Freight shipment: Freight -> Customs -> Accounts
    const f = freightStep();
    if (f) {
      out = f;
    } else {
      const base = d2(ff.preAlertsSentDate) || created;
      const c = isExport ? customsExport(base) : customsImport(base);
      out = c || accounts(d2(isExport ? cha.handOverDate : (cha.deliveryDate || cha.oocDate)) || base);
    }
  }

  if (!out) return null;
  // A back-dated date (e.g. BOE date typed as last month) must not make a
  // fresh record look weeks late: a step is never due before the record
  // itself could reasonably have reached it.
  const floor = addWorkingDays(created, 2);
  if (dayNum(out.dueDay) < dayNum(floor)) out.dueDay = floor;
  out.dueDay = nextWorkingDay(out.dueDay); // a Sunday due-date rolls to Monday
  return out;
}

// ─────────────────────────── people ───────────────────────────
async function loadPeople() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, team: true, role: true, phone: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const byTeam = { FREIGHT: [], CUSTOMS: [], ACCOUNTS: [] };
  users.forEach((u) => { if (u.team && byTeam[u.team]) byTeam[u.team].push(u); });
  return { users, byId, byTeam };
}

// Who is reminded for a step (rung decides the audience for Freight)
function recipientsFor(item, people, rung) {
  const s = item.shipment;
  const team = item.team;
  let list = [];
  if (team === 'FREIGHT') {
    const owners = [s.createdById, s.coHandlerId].map((id) => people.byId.get(id)).filter(Boolean);
    const ownersInTeam = owners.filter((u) => u.team === 'FREIGHT');
    if (rung === 'LATE1') {
      list = [...owners, ...people.byTeam.FREIGHT];
    } else if (ownersInTeam.length) {
      list = ownersInTeam;
    } else {
      list = people.byTeam.FREIGHT.length ? people.byTeam.FREIGHT : owners;
    }
  } else {
    list = people.byTeam[team] || [];
    if (!list.length) list = [s.createdById, s.coHandlerId].map((id) => people.byId.get(id)).filter(Boolean);
  }
  const seen = new Set();
  return list.filter((u) => u && !seen.has(u.id) && seen.add(u.id));
}

// Who is the named handler shown to the MD
function handlerFor(item, people) {
  const s = item.shipment;
  let user = null;
  let name = null;
  if (item.team === 'FREIGHT') {
    user = people.byId.get(s.createdById);
    name = s.createdByName || user?.name;
  } else if (item.team === 'CUSTOMS') {
    user = people.byId.get(s.customsHandledById);
    name = s.customsHandledByName || user?.name;
  } else {
    user = people.byId.get(s.accountsHandledById);
    name = s.accountsHandledByName || user?.name;
  }
  if (name) return { name, phone: user?.phone || null, assigned: true };
  const teamUsers = people.byTeam[item.team] || [];
  if (teamUsers.length) {
    return { name: `${item.team === 'CUSTOMS' ? 'Customs' : 'Accounts'} team (not started yet)`, phone: null, assigned: false };
  }
  return { name: 'Unassigned', phone: null, assigned: false };
}

// ─────────────────────────── core computation ───────────────────────────
const SKIP_STATUS = ['CANCELLED', 'ON_HOLD'];
const SKIP_STAGE = ['Cancelled', 'On Hold', 'Completed'];

async function computeItems() {
  const cfg = config();
  const today = nowIST().day;
  const people = await loadPeople();

  // The Reminders PAGE shows the last 45 days (so the MD can see the backlog);
  // notifications / emails only cover shipments created on/after REMINDERS_SINCE.
  const d45 = new Date(Date.now() - 90 * DAY_MS);
  const displaySince = cfg.since < d45 ? cfg.since : d45;
  const shipments = await prisma.shipment.findMany({
    where: {
      isDeleted: false,
      isArchived: false,
      createdAt: { gte: displaySince },
    },
    select: {
      id: true, refNo: true, createdAt: true, currentStatus: true, shipmentStage: true,
      shipmentType: true, importExport: true,
      createdById: true, createdByName: true, coHandlerId: true, coHandlerName: true,
      customsHandledById: true, customsHandledByName: true,
      accountsHandledById: true, accountsHandledByName: true,
      freightForwarding: { select: { consigneeName: true, shipperName: true, customerName: true, etd: true, eta: true, preAlertsSentDate: true, deliveryDate: true, awbDate: true, mawb: true, hawb: true } },
      cha: { select: { jobNo: true, checklistDate: true, boeNo: true, boeDate: true, oocDate: true, gatePassDate: true, deliveryDate: true, sbNo: true, sbDate: true, leoDate: true, handOverDate: true } },
      accounts: { select: { invoiceNumber: true, invoiceDate: true, sendingDate: true } },
    },
  });

  // snoozes / waiting-on-customer pauses
  const pauses = await prisma.reminderLog.findMany({
    where: { rung: { in: ['SNOOZE', 'WAITING'] } },
  });
  const pauseMap = new Map();
  pauses.forEach((p) => pauseMap.set(`${p.shipmentId}|${p.step}`, p));

  const items = [];
  for (const s of shipments) {
    if (SKIP_STATUS.includes(s.currentStatus) || SKIP_STAGE.includes(s.shipmentStage || '')) continue;
    const step = nextStep(s);
    if (!step) continue;
    const lateDays = workingDaysBetween(step.dueDay, today); // >0 late, 0 due today, <0 early
    const dayBefore = addWorkingDays(step.dueDay, -1);
    let state = null;
    if (lateDays > 0) state = 'LATE';
    else if (lateDays === 0) state = 'DUE';
    else if (today === dayBefore || workingDaysBetween(today, step.dueDay) === 1) state = 'SOON';
    if (!state) state = 'UPCOMING'; // not due yet — shown on the page, never reminded

    const pause = pauseMap.get(`${s.id}|${step.step}`);
    let paused = null;
    if (pause) {
      if (pause.rung === 'WAITING' && pause.until && pause.until > new Date()) paused = { type: 'WAITING', note: pause.note, until: pause.until };
      else if (pause.rung === 'SNOOZE' && pause.until && pause.until > new Date()) paused = { type: 'SNOOZE', note: pause.note, until: pause.until };
    }

    const ff = s.freightForwarding || {};
    const item = {
      shipment: s,
      shipmentId: s.id,
      refNo: s.refNo,
      customer: ff.consigneeName || ff.shipperName || ff.customerName || '—',
      mode: s.shipmentType ? `${s.shipmentType}${s.importExport ? ' ' + s.importExport : ''}` : (s.importExport ? `Freight ${s.importExport}` : 'Freight'),
      team: step.team,
      step: step.step,
      label: step.label,
      missing: step.missing,
      dueDay: step.dueDay,
      lateDays: Math.max(lateDays, 0),
      state,
      paused,
    };
    item.handler = handlerFor(item, people);
    items.push(item);
  }
  return { items, people, cfg, today };
}

// Strip heavy fields for the API
function publicItem(i) {
  return {
    shipmentId: i.shipmentId, refNo: i.refNo, customer: i.customer, mode: i.mode,
    team: i.team, step: i.step, label: i.label, missing: i.missing,
    dueDay: i.dueDay, lateDays: i.lateDays, state: i.state, paused: i.paused,
    handler: i.handler, createdByName: i.shipment.createdByName || null,
  };
}

// 30-second cache so the page and the MD dashboards don't recompute per click
let cache = { at: 0, data: null };
async function getOverview(force) {
  if (!force && cache.data && Date.now() - cache.at < 30000) return cache.data;
  const { items, cfg, today } = await computeItems();
  const data = {
    mode: cfg.mode, teams: cfg.teams, today, since: cfg.since,
    items: items.map(publicItem),
  };
  cache = { at: Date.now(), data };
  return data;
}
function clearOverviewCache() { cache = { at: 0, data: null }; }

// ─────────────────────────── scheduler tick ───────────────────────────
const dryLogged = new Set(); // in-memory, so dry-run prints each rung once per process

async function istDayStartUtc() {
  const { day } = nowIST();
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MIN * 60000);
}

async function runReminderSweep({ force = false } = {}) {
  const cfg = config();
  if (cfg.mode === 'off') return { skipped: 'off' };

  const now = nowIST();
  const n = dayNum(now.day);
  const inWindow = !isSunday(n) && now.hour >= 9 && now.hour < 20;
  if (!inWindow && !force) return { skipped: 'quiet hours / Sunday' };

  const { items: allItems, people } = await computeItems();
  // Only shipments created on/after REMINDERS_SINCE ever trigger a bell or email
  const items = allItems.filter((i) => i.shipment.createdAt >= cfg.since);
  const live = cfg.mode === 'live';
  const bellOn = cfg.mode === 'bell' || live;

  // rung ladder for this item right now
  const rungsFor = (it) => {
    const r = [];
    if (it.state === 'SOON') r.push('SOON');
    if (it.state === 'DUE' || it.state === 'LATE') r.push('DUE');
    if (it.lateDays >= 1) r.push('LATE1');
    if (it.lateDays >= 3) r.push('ESC1');
    if (it.lateDays >= 7) r.push('ESC2');
    return r;
  };

  const already = await prisma.reminderLog.findMany({
    where: { rung: { in: ['SOON', 'DUE', 'LATE1', 'ESC1', 'ESC2'] }, shipmentId: { in: items.map((i) => i.shipmentId) } },
    select: { shipmentId: true, step: true, rung: true },
  });
  const sent = new Set(already.map((a) => `${a.shipmentId}|${a.step}|${a.rung}`));

  const perUser = new Map(); // userId -> { user, rows: [] }
  const escalations = []; // { item, rung }
  const toMark = [];

  for (const it of items) {
    if (it.paused) continue;
    if (!cfg.teams.includes(it.team)) continue;
    const unsent = rungsFor(it).filter((r) => !sent.has(`${it.shipmentId}|${it.step}|${r}`));
    if (!unsent.length) continue;

    // Escalation rungs go to the MD
    for (const rung of unsent.filter((r) => r === 'ESC1' || r === 'ESC2')) {
      escalations.push({ item: it, rung });
      toMark.push({ shipmentId: it.shipmentId, step: it.step, rung });
    }

    // Person-level rungs: only the HIGHEST unsent one is delivered (so someone
    // who missed the early rungs gets one message, not three); all are marked done.
    const personRungs = unsent.filter((r) => r === 'SOON' || r === 'DUE' || r === 'LATE1');
    if (!personRungs.length) continue;
    const effective = personRungs.includes('LATE1') ? 'LATE1' : personRungs.includes('DUE') ? 'DUE' : 'SOON';
    const recipients = recipientsFor(it, people, effective);
    if (cfg.mode === 'dry') {
      const key = `${it.shipmentId}|${it.step}|${effective}`;
      if (!dryLogged.has(key)) {
        dryLogged.add(key);
        console.log(`[REMINDER-DRYRUN] ${effective} ${it.refNo} (${it.mode}) ${it.team}/${it.step} due ${it.dueDay} late ${it.lateDays}wd -> ${recipients.map((u) => u.name).join(', ') || 'NO RECIPIENTS (team empty)'}`);
      }
      continue;
    }
    recipients.forEach((u) => {
      if (!perUser.has(u.id)) perUser.set(u.id, { user: u, rows: [] });
      perUser.get(u.id).rows.push({ it, rung: effective });
    });
    personRungs.forEach((r) => toMark.push({ shipmentId: it.shipmentId, step: it.step, rung: r }));
  }

  if (cfg.mode === 'dry') {
    escalations.forEach(({ item, rung }) => {
      const key = `${item.shipmentId}|${item.step}|${rung}`;
      if (!dryLogged.has(key)) {
        dryLogged.add(key);
        console.log(`[REMINDER-DRYRUN] ${rung}->MD ${item.refNo} (${item.mode}) ${item.team}/${item.step} late ${item.lateDays}wd handler: ${item.handler.name}`);
      }
    });
    return { dry: true, items: items.length };
  }

  const dayStart = await istDayStartUtc();
  let bells = 0, emails = 0;

  // ── per-person: bell for every item, one grouped email if under the daily cap ──
  for (const { user, rows } of perUser.values()) {
    if (bellOn) {
      for (const { it, rung } of rows) {
        const late = it.lateDays > 0;
        await prisma.notification.create({
          data: {
            userId: user.id, shipmentId: it.shipmentId, refNo: it.refNo,
            title: late ? `Overdue: ${it.label}` : (rung === 'SOON' ? `Due tomorrow: ${it.label}` : `Due today: ${it.label}`),
            message: `${it.refNo} · ${it.customer} · ${late ? it.lateDays + ' working day(s) late' : 'due ' + it.dueDay}. Missing: ${it.missing}`,
            type: 'REMINDER', icon: 'bell',
          },
        }).catch((e) => console.error('[REMINDER] bell failed:', e.message));
        bells++;
      }
    }
    // email: skip SOON-only rows (bell only), respect the daily cap
    const emailRows = rows.filter((r) => r.rung !== 'SOON');
    if (live && emailRows.length && user.email) {
      const todays = await prisma.reminderLog.count({ where: { step: 'DIGEST', rung: user.id, createdAt: { gte: dayStart } } });
      if (todays < cfg.maxEmails) {
        try {
          await sendReminderDigestEmail({
            to: user.email, name: user.name,
            rows: emailRows.map(({ it }) => ({ refNo: it.refNo, customer: it.customer, mode: it.mode, label: it.label, missing: it.missing, dueDay: it.dueDay, lateDays: it.lateDays, shipmentId: it.shipmentId })),
            frontendUrl: cfg.frontendUrl,
          });
          await prisma.reminderLog.create({ data: { shipmentId: 'GLOBAL', step: 'DIGEST', rung: user.id } });
          emails++;
        } catch (e) { console.error('[REMINDER] email failed:', user.email, e.message); }
      }
    }
  }

  // ── MD escalation: one mail per run, at most one per day ──
  let mdSent = false;
  if (escalations.length) {
    if (live) {
      const mdToday = await prisma.reminderLog.count({ where: { step: 'MD_DIGEST', createdAt: { gte: dayStart } } });
      if (mdToday < 1) {
        try {
          // include everything currently overdue by 3+ days, not only new rungs, for a full picture
          const allStuck = items.filter((i) => !i.paused && i.lateDays >= 3 && cfg.teams.includes(i.team))
            .sort((a, b) => b.lateDays - a.lateDays);
          const stuck = allStuck.slice(0, 40);
          const counts = {};
          allStuck.forEach((i) => { counts[i.handler.name] = (counts[i.handler.name] || 0) + 1; });
          await sendEscalationEmail({
            to: cfg.mdEmail,
            items: stuck.map((i) => ({
              refNo: i.refNo, customer: i.customer, mode: i.mode, team: i.team, label: i.label, missing: i.missing,
              lateDays: i.lateDays, handlerName: i.handler.name, handlerPhone: i.handler.phone, shipmentId: i.shipmentId,
              again: escalations.some((e) => e.item.shipmentId === i.shipmentId && e.rung === 'ESC2') && sent.has(`${i.shipmentId}|${i.step}|ESC1`),
            })),
            total: allStuck.length,
            counts,
            waiting: items.filter((i) => i.paused && i.lateDays >= 3).map((i) => ({ refNo: i.refNo, team: i.team, label: i.label, note: i.paused.note, handlerName: i.handler.name })),
            frontendUrl: cfg.frontendUrl,
          });
          await prisma.reminderLog.create({ data: { shipmentId: 'GLOBAL', step: 'MD_DIGEST', rung: 'DAY' } });
          mdSent = true;
        } catch (e) {
          console.error('[REMINDER] MD escalation failed:', e.message);
          // un-mark so we retry on the next tick
          escalations.forEach(({ item, rung }) => {
            const i = toMark.findIndex((m) => m.shipmentId === item.shipmentId && m.step === item.step && m.rung === rung);
            if (i >= 0) toMark.splice(i, 1);
          });
        }
      } else {
        // already mailed the MD today — hold these rungs for tomorrow
        escalations.forEach(({ item, rung }) => {
          const i = toMark.findIndex((m) => m.shipmentId === item.shipmentId && m.step === item.step && m.rung === rung);
          if (i >= 0) toMark.splice(i, 1);
        });
      }
    } else {
      // bell mode: don't mark escalation rungs so they send once live is on
      escalations.forEach(({ item, rung }) => {
        const i = toMark.findIndex((m) => m.shipmentId === item.shipmentId && m.step === item.step && m.rung === rung);
        if (i >= 0) toMark.splice(i, 1);
      });
    }
  }

  // remember what was sent (unique key makes this safe to repeat)
  for (const m of toMark) {
    await prisma.reminderLog.create({ data: m }).catch(() => {});
  }
  clearOverviewCache();
  console.log(`[REMINDER] mode=${cfg.mode} items=${items.length} bells=${bells} emails=${emails} md=${mdSent ? 'sent' : 'no'}`);
  return { items: items.length, bells, emails, mdSent };
}

// ─────────────────────────── snooze / waiting ───────────────────────────
async function pauseItem({ shipmentId, step, type, days, note, userName }) {
  const until = new Date(Date.parse(`${addWorkingDays(nowIST().day, days)}T23:59:59.000Z`) - IST_OFFSET_MIN * 60000);
  const rung = type === 'WAITING' ? 'WAITING' : 'SNOOZE';
  const existing = await prisma.reminderLog.findFirst({ where: { shipmentId, step, rung } });
  if (existing) {
    await prisma.reminderLog.update({ where: { id: existing.id }, data: { until, note: note || null, createdBy: userName || null } });
  } else {
    await prisma.reminderLog.create({ data: { shipmentId, step, rung, until, note: note || null, createdBy: userName || null } });
  }
  clearOverviewCache();
  return { until };
}

module.exports = {
  runReminderSweep, getOverview, pauseItem, clearOverviewCache,
  // exported for tests
  _internal: { addWorkingDays, workingDaysBetween, nextStep, nextWorkingDay, istDay, isSunday, dayNum },
};