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

const FMT = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
const ROW = (label, value) => value ? `<tr><td style="padding:6px 12px;color:#6b7280;font-size:12px;width:35%;background:#f9fafb">${label}</td><td style="padding:6px 12px;font-size:12px;color:#1f2937;font-weight:500">${value}</td></tr>` : '';
const SECTION = (title, rows) => rows ? `<div style="margin-bottom:16px"><h3 style="color:#4f46e5;font-size:13px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e0e7ff">${title}</h3><table style="width:100%;border-collapse:collapse">${rows}</table></div>` : '';

async function sendStatusEmail(shipment) {
  try {
    const ff = shipment.freightForwarding || {};
    const cha = shipment.cha || {};
    const acc = shipment.accounts || {};
    const history = shipment.statusHistory || [];
    let toEmail = ff.notificationEmail;
    if (!toEmail) { console.log('No notification email set'); return; }

    const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const statusLabel = STATUS_LABELS[shipment.currentStatus] || shipment.currentStatus;
    const color = shipment.currentStatus === 'DELIVERED' ? '#059669' : shipment.currentStatus === 'COMPLETED' ? '#059669' : '#4f46e5';

    // Build sections dynamically
    let sections = '';

    // Route Details
    let routeRows = '';
    routeRows += ROW('From (Origin)', ff.fromLocation);
    routeRows += ROW('To (Destination)', ff.toLocation);
    routeRows += ROW('Terms', ff.terms);
    routeRows += ROW('Port Location', ff.portLocation);
    if (routeRows) sections += SECTION('📍 Route Details', routeRows);

    // Weight Details
    let weightRows = '';
    weightRows += ROW('Gross Weight', ff.grossWeight ? `${ff.grossWeight} kg` : null);
    weightRows += ROW('Chargeable Weight', ff.weight ? `${ff.weight} kg` : null);
    weightRows += ROW('CBM', ff.cbm);
    weightRows += ROW('No. of Packages', ff.noOfPackages);
    if (weightRows) sections += SECTION('⚖️ Weight & Cargo Details', weightRows);

    // Party Details
    let partyRows = '';
    partyRows += ROW('Consignee', ff.consigneeName);
    partyRows += ROW('Shipper', ff.shipperName);
    partyRows += ROW('Agent / Forwarder', ff.agent);
    if (partyRows) sections += SECTION('👥 Party Details', partyRows);

    // Schedule
    let scheduleRows = '';
    scheduleRows += ROW('Booking Date', FMT(ff.bookingDate));
    scheduleRows += ROW('Nomination Date', FMT(ff.nominationDate));
    scheduleRows += ROW('ETD', FMT(ff.etd));
    scheduleRows += ROW('ETA', FMT(ff.eta));
    if (scheduleRows) sections += SECTION('📅 Schedule', scheduleRows);

    // AWB Details
    let awbRows = '';
    awbRows += ROW('MAWB / MBL', ff.mawb);
    awbRows += ROW('HAWB / HBL', ff.hawb);
    awbRows += ROW('AWB Date', FMT(ff.awbDate));
    if (awbRows) sections += SECTION('✈️ AWB Details', awbRows);

    // Rates
    let rateRows = '';
    rateRows += ROW('Selling Rate', ff.sellingRate ? `₹${parseFloat(ff.sellingRate).toLocaleString()}` : null);
    if (rateRows) sections += SECTION('💰 Rates', rateRows);

    // Customs
    let customsRows = '';
    customsRows += ROW('Job No', cha.jobNo);
    customsRows += ROW('Checklist Date', FMT(cha.checklistDate));
    customsRows += ROW('BOE No', cha.boeNo);
    customsRows += ROW('BOE Date', FMT(cha.boeDate));
    customsRows += ROW('DO Collection Date', FMT(cha.doCollectionDate));
    customsRows += ROW('OOC Date', FMT(cha.oocDate));
    customsRows += ROW('Gate Pass Date', FMT(cha.gatePassDate));
    customsRows += ROW('Delivery Date', FMT(cha.deliveryDate));
    customsRows += ROW('Tracking No', cha.trackingNumber);
    if (customsRows) sections += SECTION('🛃 Customs Clearance', customsRows);

    // Accounts
    let accountRows = '';
    accountRows += ROW('Invoice No', acc.invoiceNumber);
    accountRows += ROW('Invoice Date', FMT(acc.invoiceDate));
    accountRows += ROW('Sending Date', FMT(acc.sendingDate));
    if (accountRows) sections += SECTION('🧾 Accounts', accountRows);

    // Timeline
    let timelineHtml = '';
    if (history.length > 0) {
      timelineHtml = '<div style="margin-bottom:16px"><h3 style="color:#4f46e5;font-size:13px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e0e7ff">📋 Status Timeline</h3>';
      history.slice(0, 5).forEach(h => {
        const t = new Date(h.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        timelineHtml += `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f3f4f6">
          <span style="background:#e0e7ff;color:#4f46e5;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;white-space:nowrap">${h.status.replace(/_/g, ' ')}</span>
          <span style="font-size:11px;color:#6b7280;flex:1">${h.remarks || ''}</span>
          <span style="font-size:10px;color:#9ca3af;white-space:nowrap">${t}</span>
        </div>`;
      });
      timelineHtml += '</div>';
      sections += timelineHtml;
    }

    const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,${color},#3b82f6);padding:28px 24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">🚢 PAS Freight Services</h1>
        <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:12px">Shipment Status Update</p>
      </div>
      <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e5e7eb">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <p style="margin:0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Reference Number</p>
            <p style="margin:2px 0 0;font-size:16px;font-weight:700;color:#1f2937">${shipment.refNo}</p>
          </div>
          <span style="display:inline-block;background:${color};color:#fff;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600">${statusLabel}</span>
        </div>
        ${shipment.shipmentType ? `<p style="margin:8px 0 0;font-size:11px;color:#6b7280">Transport Mode: <b>${shipment.shipmentType}</b> | Import/Export: <b>${shipment.importExport || '—'}</b> | Stage: <b>${shipment.shipmentStage || '—'}</b></p>` : ''}
        ${shipment.remarks ? `<p style="margin:6px 0 0;font-size:11px;color:#f59e0b">📝 ${shipment.remarks}</p>` : ''}
      </div>
      <div style="padding:20px 24px">
        ${sections || '<p style="color:#9ca3af;text-align:center;font-size:12px">No additional details available yet.</p>'}
      </div>
      <div style="padding:16px 24px;background:#f1f5f9;text-align:center;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:10px;color:#94a3b8">© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd. All rights reserved.</p>
        <p style="margin:2px 0 0;font-size:10px;color:#cbd5e1">This is an automated notification. Please do not reply.</p>
      </div>
    </div>`;

    const raw = Buffer.from(
      `From: "PAS Freight" <${EMAIL_USER}>\r\n` +
      `To: ${toEmail}\r\n` +
      `Subject: ${statusLabel} - ${shipment.refNo} | PAS Freight\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
      html
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log('Email sent to', toEmail);
  } catch (error) {
    console.error('Email failed:', error.message);
  }
}

// ─── DAILY REPORT EMAIL (NEW) ───
// Sends the same daily-summary data the in-app Daily Report page shows,
// to a fixed list of recipients (management). Uses the same Gmail OAuth2
// send path and ROW/SECTION helpers as sendStatusEmail, so it looks and
// behaves consistently with every other email this app sends.
async function sendDailyReportEmail(report, recipients) {
  try {
    if (!recipients || recipients.length === 0) { console.log('No daily report recipients configured'); return; }

    const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const dateLabel = new Date(`${report.date}T00:00:00+05:30`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Summary stat cards
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

    // New shipments list
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

    // Employee breakdown table
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

module.exports = { sendStatusEmail, sendDailyReportEmail };