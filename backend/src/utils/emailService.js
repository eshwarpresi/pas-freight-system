const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;

const STATUS_LABELS = {
  'BOOKED': 'Booked', 'SCHEDULED': 'Scheduled', 'AWB_GENERATED': 'AWB Generated',
  'DELIVERED': 'Delivered', 'COMPLETED': 'Completed', 'NOMINATED': 'Nominated',
  'RATES_ADDED': 'Rates Added'
};

async function sendStatusEmail(shipment) {
  try {
    const ff = shipment.freightForwarding || {};
    let toEmail = ff.notificationEmail;
    if (!toEmail) { console.log('No notification email set'); return; }

    const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const statusLabel = STATUS_LABELS[shipment.currentStatus] || shipment.currentStatus;

    const html = `<div style="font-family:Arial;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px">
      <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0">PAS Freight Services</h1><p style="color:#c7d2fe">Shipment Status Update</p>
      </div>
      <div style="padding:24px;background:#f8fafc">
        <p style="color:#6b7280">Status: <b style="color:#4f46e5;font-size:16px">${statusLabel}</b></p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px 0;color:#6b7280">Ref No:</td><td style="font-weight:600">${shipment.refNo}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Consignee:</td><td>${ff.consigneeName||'--'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Shipper:</td><td>${ff.shipperName||'--'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Mode:</td><td>${shipment.shipmentType||'--'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">HAWB:</td><td>${ff.hawb||'--'}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280">Packages:</td><td>${ff.noOfPackages||'--'}</td></tr>
        </table>
      </div>
      <div style="padding:16px;background:#f1f5f9;text-align:center;font-size:11px;color:#94a3b8">${new Date().getFullYear()} PAS Freight Services Pvt Ltd</div>
    </div>`;

    const raw = Buffer.from(
      `From: "PAS Freight" <${EMAIL_USER}>\r\n` +
      `To: ${toEmail}\r\n` +
      `Subject: ${statusLabel} - ${shipment.refNo} | PAS Freight\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n\r\n` +
      html
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });

    console.log('Email sent to', toEmail);
  } catch (error) {
    console.error('Email failed:', error.message);
  }
}

module.exports = { sendStatusEmail };