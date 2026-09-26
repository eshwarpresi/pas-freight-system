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

module.exports = {
  sendStatusEmail, // now a no-op — see comment above
  sendDailyReportEmail,
  sendEnquiryReceivedEmail, // ✅ NEW
  sendFreightConfirmedEmail, // ✅ NEW
  sendInvoiceReadyEmail, // ✅ NEW
};