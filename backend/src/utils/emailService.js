const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;

const STATUS_LABELS = {
  'ENQUIRY': 'Enquiry', 'RATES_ADDED': 'Rates Added', 'NOMINATED': 'Nominated',
  'BOOKED': 'Booked', 'SCHEDULED': 'Scheduled', 'AWB_GENERATED': 'AWB Generated',
  'CHECKLIST_APPROVED': 'Checklist Approved', 'BOE_FILED': 'BOE Filed',
  'DO_COLLECTED': 'DO Collected', 'OOC_DONE': 'OOC Done', 'GATE_PASS': 'Gate Pass',
  'DELIVERED': 'Delivered', 'INVOICE_GENERATED': 'Invoice Generated',
  'INVOICE_SENT': 'Invoice Sent', 'COMPLETED': 'Completed'
};

const FMT = (d) => d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
const ROW = (label, value) => value ? `<tr><td style="padding:6px 12px;color:#6b7280;font-size:12px;width:35%;background:#f9fafb">${label}</td><td style="padding:6px 12px;font-size:12px;color:#1f2937;font-weight:500">${value}</td></tr>` : '';
const SECTION = (title, rows) => rows ? `<div style="margin-bottom:16px"><h3 style="color:#4f46e5;font-size:13px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e0e7ff">${title}</h3><table style="width:100%;border-collapse:collapse">${rows}</table></div>` : '';

// ✅ NO LONGER USED — replaced entirely by the 3 milestone emails below
// (sendEnquiryReceivedEmail, sendFreightConfirmedEmail,
// sendInvoiceReadyEmail), per explicit instruction that those 3 should be
// the ONLY automatic client emails now. Left as a harmless no-op rather
// than removing the function and hunting down every call site across the
// 3 controller files that still call it — this way nothing breaks, it
// just does nothing.
async function sendStatusEmail(shipment) {
  return; // intentionally disabled — see comment above
}

// ─── SHARED MANIFEST-STYLE EMAIL SHELL (NEW) ───
// One consistent visual identity — deep navy header, serif headline, a
// bordered "manifest" details table — used by all 3 milestone emails, so
// a client recognizes each one as part of the same journey.
function buildManifestEmail({ headline, bodyText, rows, closingText }) {
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:11px 16px;border-bottom:1px solid #E7E8EA;font-size:12px;color:#6B6F76;width:40%;">${label}</td>
      <td style="padding:11px 16px;border-bottom:1px solid #E7E8EA;font-size:13px;color:#2A2A2A;">${value || '—'}</td>
    </tr>`).join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;max-width:600px;margin:auto;">
    <tr><td style="background:#1B2A4A;padding:28px 32px;">
      <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#F7F6F3;letter-spacing:0.3px;">PAS Freight Services</span>
    </td></tr>
    <tr><td style="padding:34px 32px 8px;">
      <p style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:#1B2A4A;margin:0 0 18px;">${headline}</p>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#2A2A2A;margin:0 0 22px;">${bodyText}</p>
    </td></tr>
    <tr><td style="padding:0 32px 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D8D9DB;">
        ${rowsHtml}
      </table>
    </td></tr>
    <tr><td style="padding:0 32px 34px;">
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#2A2A2A;margin:0;">${closingText}</p>
    </td></tr>
    <tr><td style="padding:20px 32px;border-top:1px solid #E7E8EA;">
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A8F98;margin:0;">PAS Freight Services · This message relates to shipment ${'{{REFNO}}'}</p>
    </td></tr>
  </table>`;
}

async function getGmailClient() {
  const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function sendRawEmail({ to, cc, subject, html }) {
  const gmail = await getGmailClient();
  const headers = [
    `From: "PAS Freight" <${EMAIL_USER}>`,
    `To: ${to}`,
  ];
  if (cc) headers.push(`Cc: ${cc}`);
  headers.push(`Subject: ${subject}`, `MIME-Version: 1.0`, `Content-Type: text/html; charset=UTF-8`, '', html);
  const raw = Buffer.from(headers.join('\r\n'))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

// ─── EMAIL 1: ENQUIRY RECEIVED (NEW) ───
// Fires once, at creation, only if the shipment's "Send automatic update
// emails" toggle was switched on. CC'd to whoever created the shipment.
async function sendEnquiryReceivedEmail(shipment, employeeEmail) {
  try {
    const ff = shipment.freightForwarding || {};
    if (!ff.notificationEmail) return;

    const html = buildManifestEmail({
      headline: "We've received your enquiry.",
      bodyText: "Thank you for reaching out to PAS Freight Services. Your enquiry has been logged, and our team is already working through the details to put together the best arrangement for your shipment.",
      rows: [
        ['Reference Number', shipment.refNo],
        ['Route', (ff.fromLocation || ff.toLocation) ? `${ff.fromLocation || '—'} → ${ff.toLocation || '—'}` : null],
        ['Date Received', FMT(new Date())],
      ].filter(([, v]) => v),
      closingText: "We'll be in touch shortly with the next update. If anything changes on your end in the meantime, just reply to this email directly.",
    }).replace('{{REFNO}}', shipment.refNo);

    await sendRawEmail({
      to: ff.notificationEmail,
      cc: employeeEmail || undefined,
      subject: `Your Enquiry Has Been Received — ${shipment.refNo}`,
      html,
    });
    console.log('Enquiry Received email sent to', ff.notificationEmail, employeeEmail ? `(cc: ${employeeEmail})` : '');
  } catch (error) {
    console.error('Enquiry Received email failed:', error.message);
  }
}

// ─── EMAIL 2: FREIGHT CONFIRMED (NEW) ───
// Fires once, the moment Freight is marked complete (Consignee + Shipper
// + a weight/rate present) — piggybacks on the existing
// checkAndStampFreightComplete "only ever stamps once" gate, so this
// naturally never double-sends. No CC.
async function sendFreightConfirmedEmail(shipment) {
  try {
    const ff = shipment.freightForwarding || {};
    if (!ff.notificationEmail) return;

    const html = buildManifestEmail({
      headline: "Your freight arrangements are confirmed.",
      bodyText: "Booking is finalized and your cargo is on its way. Here's where things stand right now.",
      rows: [
        ['Reference Number', shipment.refNo],
        ['AWB Number', ff.mawb || ff.hawb],
        ['Route', (ff.fromLocation || ff.toLocation) ? `${ff.fromLocation || '—'} → ${ff.toLocation || '—'}` : null],
        ['Estimated Arrival', FMT(ff.eta)],
      ].filter(([, v]) => v),
      closingText: "We'll send your invoice as soon as the shipment reaches its destination and customs formalities are complete.",
    }).replace('{{REFNO}}', shipment.refNo);

    await sendRawEmail({
      to: ff.notificationEmail,
      subject: `Your Shipment Is Moving — ${shipment.refNo}`,
      html,
    });
    console.log('Freight Confirmed email sent to', ff.notificationEmail);
  } catch (error) {
    console.error('Freight Confirmed email failed:', error.message);
  }
}

// ─── EMAIL 3: INVOICE READY (NEW) ───
// Fires once, the moment the invoice is marked complete — piggybacks on
// the existing markInvoiceCompleteIfReady "only ever marks once" gate.
// No CC.
async function sendInvoiceReadyEmail(shipment) {
  try {
    const ff = shipment.freightForwarding || {};
    const acc = shipment.accounts || {};
    if (!ff.notificationEmail) return;

    const html = buildManifestEmail({
      headline: "Your shipment is complete — invoice enclosed.",
      bodyText: "Thank you for trusting PAS Freight Services with this shipment, from enquiry through to delivery. Your invoice is ready below.",
      rows: [
        ['Reference Number', shipment.refNo],
        ['Invoice Number', acc.invoiceNumber],
        ['Invoice Date', FMT(acc.invoiceDate)],
      ].filter(([, v]) => v),
      closingText: "It's been a pleasure handling this shipment for you, and we look forward to working together again.",
    }).replace('{{REFNO}}', shipment.refNo);

    await sendRawEmail({
      to: ff.notificationEmail,
      subject: `Invoice Ready — Thank You for Choosing PAS Freight — ${shipment.refNo}`,
      html,
    });
    console.log('Invoice Ready email sent to', ff.notificationEmail);
  } catch (error) {
    console.error('Invoice Ready email failed:', error.message);
  }
}

// ─── DAILY REPORT EMAIL (UNCHANGED) ───
// Sends the same daily-summary data the in-app Daily Report page shows,
// to a fixed list of recipients (management). Uses the same Gmail OAuth2
// send path and ROW/SECTION helpers as before, so it looks and behaves
// consistently with every other email this app sends. Not part of the
// client-facing milestone emails above — untouched by that change.
// Customer emails sent at specific milestones. Which shipments get which is
// decided in the controller (see MILESTONES); this only builds and sends them.
//   PRE_ALERTS — after Pre-Alerts Sent On is saved   (Freight, FF Only)
//   BOE        — after the BOE number is saved       (Freight Import, CHA Import)
//   HAND_OVER  — after the Hand Over date is saved   (Freight Export, CHA Export)
async function sendMilestoneEmail(shipment, milestone) {
  try {
    const ff = shipment.freightForwarding || {};
    const cha = shipment.cha || {};
    if (!ff.notificationEmail) return;
    const route = (ff.fromLocation || ff.toLocation) ? `${ff.fromLocation || '—'} → ${ff.toLocation || '—'}` : null;
    const awb = ff.mawb || ff.hawb;
    let subject, headline, bodyText, rows, closingText;

    if (milestone === 'PRE_ALERTS') {
      subject = `Pre-Alerts Sent — ${shipment.refNo}`;
      headline = 'Pre-alerts for your shipment have been sent.';
      bodyText = "Your shipment details have been pre-alerted to the destination side, so everything is lined up ahead of arrival. Here's where things stand.";
      rows = [
        ['Reference Number', shipment.refNo],
        ['AWB Number', awb],
        ['Route', route],
        ['Pre-Alert Sent On', ff.preAlertsSentDate ? FMT(ff.preAlertsSentDate) : null],
        ['Estimated Arrival', ff.eta ? FMT(ff.eta) : null],
      ];
      closingText = shipment.shipmentType === 'FF Only'
        ? "We'll send your invoice as soon as the shipment is complete. If you have any questions in the meantime, just reply to this email."
        : "We'll update you again as customs formalities move forward. If you have any questions in the meantime, just reply to this email.";
    } else if (milestone === 'BOE') {
      subject = `Customs Update: Bill of Entry Filed — ${shipment.refNo}`;
      headline = 'Your Bill of Entry has been filed.';
      bodyText = 'Customs documentation for your shipment is under way. The Bill of Entry has been filed, and our team is following it through clearance.';
      rows = [
        ['Reference Number', shipment.refNo],
        ['BOE Number', cha.boeNo],
        ['BOE Date', cha.boeDate ? FMT(cha.boeDate) : null],
        ['AWB Number', awb],
        ['Route', route],
      ];
      closingText = "We'll keep you posted as it clears customs. If you have any questions in the meantime, just reply to this email.";
    } else if (milestone === 'HAND_OVER') {
      subject = `Shipment Handed Over — ${shipment.refNo}`;
      headline = 'Your shipment has been handed over.';
      bodyText = 'Your export cargo has been handed over for dispatch. Here are the details.';
      rows = [
        ['Reference Number', shipment.refNo],
        ['Shipping Bill Number', cha.sbNo],
        ['Hand Over Date', cha.handOverDate ? FMT(cha.handOverDate) : null],
        ['AWB Number', awb],
        ['Route', route],
      ];
      closingText = "We'll send your invoice shortly. If you have any questions in the meantime, just reply to this email.";
    } else {
      return;
    }

    const html = buildManifestEmail({ headline, bodyText, rows: rows.filter(([, v]) => v), closingText }).replace('{{REFNO}}', shipment.refNo);
    await sendRawEmail({ to: ff.notificationEmail, subject, html });
    console.log(`${milestone} email sent to`, ff.notificationEmail);
  } catch (error) {
    console.error(`${milestone} email failed:`, error.message);
  }
}

async function sendDailyReportEmail(report, recipients) {
  try {
    if (!recipients || recipients.length === 0) { console.log('No daily report recipients configured'); return; }

    const gmail = await getGmailClient();

    const dateLabel = new Date(`${report.date}T00:00:00+05:30`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const statCard = (label, value, color) => `
      <td style="padding:14px 10px;text-align:center;width:25%">
        <p style="margin:0;font-size:24px;font-weight:700;color:${color}">${value}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px">${label}</p>
      </td>`;
    const statsRow = `<table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="background:#f8fafc;border-radius:8px">
        ${statCard('New', report.newShipments.count, '#4f46e5')}
        ${statCard('Delivered', report.delivered.count, '#059669')}
        ${statCard('Invoiced', report.invoiced.count, '#f59e0b')}
        ${statCard('Status Changes', report.statusChangesCount, '#0ea5e9')}
      </tr>
    </table>`;

    const listRows = (items) => items.map((s) =>
      `<tr><td style="padding:6px 12px;font-size:12px;color:#1f2937;font-weight:600;width:35%">${s.refNo}</td><td style="padding:6px 12px;font-size:12px;color:#6b7280">${s.shipmentType || ''}</td><td style="padding:6px 12px;font-size:12px;color:#6b7280;text-align:right">${s.createdByName || 'Unknown'}</td></tr>`
    ).join('');

    let sections = '';
    if (report.newShipments.items.length > 0) {
      sections += `<div style="margin-bottom:16px"><h3 style="color:#4f46e5;font-size:13px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e0e7ff">📦 New Shipments (${report.newShipments.count})</h3><table style="width:100%;border-collapse:collapse">${listRows(report.newShipments.items)}</table></div>`;
    }
    if (report.delivered.items.length > 0) {
      sections += `<div style="margin-bottom:16px"><h3 style="color:#059669;font-size:13px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #d1fae5">✅ Delivered / Hand Over (${report.delivered.count})</h3><table style="width:100%;border-collapse:collapse">${listRows(report.delivered.items)}</table></div>`;
    }
    if (report.invoiced.items.length > 0) {
      sections += `<div style="margin-bottom:16px"><h3 style="color:#f59e0b;font-size:13px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #fef3c7">💰 Invoiced (${report.invoiced.count})</h3><table style="width:100%;border-collapse:collapse">${listRows(report.invoiced.items)}</table></div>`;
    }

    let empRows = '';
    report.employeeBreakdown.forEach((e) => {
      empRows += `<tr>
        <td style="padding:6px 12px;font-size:12px;color:#1f2937;font-weight:600">${e.name}</td>
        <td style="padding:6px 12px;font-size:12px;color:#4f46e5;text-align:center">${e.created}</td>
        <td style="padding:6px 12px;font-size:12px;color:#059669;text-align:center">${e.delivered}</td>
        <td style="padding:6px 12px;font-size:12px;color:#f59e0b;text-align:center">${e.invoiced}</td>
      </tr>`;
    });
    const employeeSection = report.employeeBreakdown.length > 0 ? `
      <div style="margin-bottom:8px">
        <h3 style="color:#4f46e5;font-size:13px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e0e7ff">👥 Per-Employee Breakdown</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr style="background:#f9fafb">
            <td style="padding:6px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase">Employee</td>
            <td style="padding:6px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase;text-align:center">New</td>
            <td style="padding:6px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase;text-align:center">Delivered</td>
            <td style="padding:6px 12px;font-size:10px;color:#9ca3af;text-transform:uppercase;text-align:center">Invoiced</td>
          </tr>
          ${empRows}
        </table>
      </div>` : '';

    const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:28px 24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">🚢 PAS Freight Services</h1>
        <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:12px">Daily Report — ${dateLabel}</p>
      </div>
      <div style="padding:20px 24px 0">
        ${statsRow}
        ${sections || '<p style="color:#9ca3af;text-align:center;font-size:12px">No activity recorded today.</p>'}
        ${employeeSection}
      </div>
      <div style="padding:16px 24px;background:#f1f5f9;text-align:center;border-top:1px solid #e5e7eb;margin-top:16px">
        <p style="margin:0;font-size:10px;color:#94a3b8">© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd. All rights reserved.</p>
        <p style="margin:2px 0 0;font-size:10px;color:#cbd5e1">This is an automated daily report. Please do not reply.</p>
      </div>
    </div>`;

    const raw = Buffer.from(
      `From: "PAS Freight" <${EMAIL_USER}>\r\n` +
      `To: ${recipients.join(', ')}\r\n` +
      `Subject: Daily Report — ${dateLabel} | PAS Freight\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
      html
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log('Daily report email sent to', recipients.join(', '));
  } catch (error) {
    console.error('Daily report email failed:', error.message);
  }
}


// ─── REMINDER EMAILS (NEW) ───
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function reminderShell(title, intro, bodyHtml) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F3;max-width:680px;margin:auto;">
    <tr><td style="background:#1B2A4A;padding:24px 28px;">
      <span style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:#F7F6F3;">PAS Freight Services</span>
    </td></tr>
    <tr><td style="padding:28px 28px 8px;">
      <p style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1B2A4A;margin:0 0 10px;">${title}</p>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#2A2A2A;margin:0 0 18px;">${intro}</p>
    </td></tr>
    <tr><td style="padding:0 28px 24px;">${bodyHtml}</td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #E7E8EA;">
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A8F98;margin:0;">PAS Freight Services · Automatic reminder. Updating the pending step in the app stops it for everyone.</p>
    </td></tr>
  </table>`;
}

const TH = 'padding:8px 10px;text-align:left;font-size:11px;color:#6B6F76;background:#EFEFEA;font-family:Arial,Helvetica,sans-serif;';
const TD = 'padding:9px 10px;border-bottom:1px solid #E7E8EA;font-size:13px;color:#2A2A2A;font-family:Arial,Helvetica,sans-serif;vertical-align:top;';

function dueBadge(lateDays) {
  return lateDays > 0
    ? `<span style="color:#B3261E;font-weight:bold;">${lateDays} working day${lateDays > 1 ? 's' : ''} late</span>`
    : `<span style="color:#B26A00;font-weight:bold;">Due today</span>`;
}

// One grouped email per person
async function sendReminderDigestEmail({ to, name, rows, frontendUrl }) {
  const late = rows.filter((r) => r.lateDays > 0).length;
  const subject = late
    ? `Reminder: ${rows.length} shipment${rows.length > 1 ? 's' : ''} need you (${late} overdue)`
    : `Reminder: ${rows.length} shipment${rows.length > 1 ? 's' : ''} due today`;
  const tr = rows.slice(0, 12).map((r) => `
    <tr>
      <td style="${TD}"><a href="${frontendUrl}/shipment/${r.shipmentId}" style="color:#1B2A4A;font-weight:bold;text-decoration:none;">${esc(r.refNo)}</a><br><span style="color:#6B6F76;font-size:12px;">${esc(r.customer)}</span></td>
      <td style="${TD}">${esc(r.label)}<br><span style="color:#6B6F76;font-size:12px;">Needs: ${esc(r.missing)}</span></td>
      <td style="${TD}">${dueBadge(r.lateDays)}</td>
    </tr>`).join('');
  const more = rows.length > 12 ? `<p style="font-family:Arial,sans-serif;font-size:12px;color:#6B6F76;">…and ${rows.length - 12} more in the app.</p>` : '';
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D8D9DB;border-collapse:collapse;">
      <tr><th style="${TH}">Shipment</th><th style="${TH}">Pending step</th><th style="${TH}">Status</th></tr>
      ${tr}
    </table>${more}
    <p style="font-family:Arial,sans-serif;font-size:13px;color:#2A2A2A;margin:18px 0 0;">
      <a href="${frontendUrl}/reminders" style="background:#1B2A4A;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;display:inline-block;">Open my reminders</a><br>
      <span style="font-size:12px;color:#6B6F76;">Waiting on a customer? Snooze or mark it from the Reminders page.</span>
    </p>`;
  const html = reminderShell(`Hi ${esc((name || '').split(' ')[0] || 'there')},`, 'These shipments are waiting on your team:', body);
  await sendRawEmail({ to, subject, html });
}

// One email to the MD
async function sendEscalationEmail({ to, items, waiting, frontendUrl, total, counts: allCounts }) {
  const byTeam = {};
  items.forEach((i) => { (byTeam[i.team] = byTeam[i.team] || []).push(i); });
  const teamLabel = { FREIGHT: 'Freight team', CUSTOMS: 'Customs team', ACCOUNTS: 'Accounts team' };
  const counts = allCounts || {};
  if (!allCounts) items.forEach((i) => { counts[i.handlerName] = (counts[i.handlerName] || 0) + 1; });
  const totalCount = total || items.length;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const subject = `PAS Freight: ${totalCount} shipment${totalCount > 1 ? 's' : ''} stuck 3+ working days` + (ranked.length ? ` (${ranked.slice(0, 3).map(([n, c]) => n.split(' (')[0] + ' ' + c).join(', ')})` : '');

  const sections = ['FREIGHT', 'CUSTOMS', 'ACCOUNTS'].map((t) => {
    const list = (byTeam[t] || []).sort((a, b) => b.lateDays - a.lateDays);
    if (!list.length) return `<p style="font-family:Arial,sans-serif;font-size:13px;color:#2E7D32;margin:14px 0 4px;">✅ ${teamLabel[t]}: all clear</p>`;
    const rows = list.map((i) => `
      <tr>
        <td style="${TD}"><a href="${frontendUrl}/shipment/${i.shipmentId}" style="color:#1B2A4A;font-weight:bold;text-decoration:none;">${esc(i.refNo)}</a>${i.again ? ' <span style="color:#B3261E;font-size:11px;">Escalated again</span>' : ''}<br><span style="color:#6B6F76;font-size:12px;">${esc(i.customer)} · ${esc(i.mode)}</span></td>
        <td style="${TD}">${esc(i.label)}<br><span style="color:#6B6F76;font-size:12px;">Missing: ${esc(i.missing)}</span></td>
        <td style="${TD}"><span style="color:#B3261E;font-weight:bold;">${i.lateDays} wd</span></td>
        <td style="${TD}"><b>${esc(i.handlerName)}</b>${i.handlerPhone ? `<br><a href="tel:${esc(i.handlerPhone)}" style="color:#1B2A4A;font-size:12px;">${esc(i.handlerPhone)}</a>` : ''}</td>
      </tr>`).join('');
    return `
      <p style="font-family:Georgia,serif;font-size:15px;color:#1B2A4A;margin:20px 0 6px;">${teamLabel[t]} — ${list.length} stuck</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D8D9DB;border-collapse:collapse;">
        <tr><th style="${TH}">Shipment</th><th style="${TH}">Stuck at</th><th style="${TH}">Late</th><th style="${TH}">Handler (call)</th></tr>
        ${rows}
      </table>`;
  }).join('');

  const rank = ranked.length ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#2A2A2A;margin:20px 0 4px;"><b>Who to call first:</b> ${ranked.map(([n, c]) => `${esc(n)} (${c})`).join(' · ')}</p>` : '';
  const wait = (waiting && waiting.length) ? `
    <p style="font-family:Georgia,serif;font-size:15px;color:#B26A00;margin:20px 0 6px;">🟡 Marked "waiting" (not their fault)</p>
    ${waiting.map((w) => `<p style="font-family:Arial,sans-serif;font-size:13px;margin:2px 0;">${esc(w.refNo)} · ${esc(w.label)} · ${esc(w.handlerName)} — <i>${esc(w.note || 'no reason given')}</i></p>`).join('')}` : '';
  const body = `${sections}${rank}${wait}
    <p style="margin:20px 0 0;"><a href="${frontendUrl}/reminders" style="background:#1B2A4A;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;display:inline-block;font-family:Arial,sans-serif;font-size:13px;">Open live Reminders page</a></p>`;
  const html = reminderShell('Shipments that need a call today', `Working days only (Sundays excluded). Handler = the person who last worked that section, otherwise the shipment owner.${totalCount > items.length ? ` Showing the ${items.length} most overdue of ${totalCount} — the rest are on the Reminders page.` : ''}`, body);
  await sendRawEmail({ to, subject, html });
}

module.exports = {
  sendReminderDigestEmail,
  sendEscalationEmail,
  sendMilestoneEmail,
  sendStatusEmail, // now a no-op — see comment above
  sendDailyReportEmail,
  sendEnquiryReceivedEmail, // ✅ NEW
  sendFreightConfirmedEmail, // ✅ NEW
  sendInvoiceReadyEmail, // ✅ NEW
};