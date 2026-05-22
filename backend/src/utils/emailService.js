const https = require('https');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const STATUS_LABELS = {
  'BOOKED': 'Booked', 'SCHEDULED': 'Scheduled', 'AWB_GENERATED': 'AWB Generated',
  'DELIVERED': 'Delivered', 'COMPLETED': 'Completed', 'NOMINATED': 'Nominated',
  'RATES_ADDED': 'Rates Added'
};

function sendRawEmail(to, subject, htmlBody) {
  return new Promise((resolve, reject) => {
    const boundary = 'boundary' + Date.now();
    const raw = [
      `From: "PAS Freight" <${EMAIL_USER}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: text/html; charset=UTF-8`,
      '',
      htmlBody
    ].join('\r\n');

    const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const auth = Buffer.from(`${EMAIL_USER}:${EMAIL_PASS}`).toString('base64');

    const options = {
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/send',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Gmail API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ raw: encoded }));
    req.end();
  });
}

async function sendStatusEmail(shipment) {
  try {
    const ff = shipment.freightForwarding || {};
    let toEmail = ff.notificationEmail;
    if (!toEmail) { console.log('No notification email set'); return; }

    const statusLabel = STATUS_LABELS[shipment.currentStatus] || shipment.currentStatus;

    const html = `<div style="font-family:Arial;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px">
      <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0">PAS Freight Services</h1>
        <p style="color:#c7d2fe;margin:8px 0 0">Shipment Status Update</p>
      </div>
      <div style="padding:24px;background:#f8fafc">
        <div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb">
          <p style="color:#6b7280;font-size:13px">Status: <b style="color:#4f46e5;font-size:16px">${statusLabel}</b></p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:20px;border:1px solid #e5e7eb">
          <h3 style="color:#4f46e5;margin:0 0 16px">Shipment Details</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#6b7280;width:40%">Reference No:</td><td style="font-weight:600">${shipment.refNo}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280">Consignee:</td><td>${ff.consigneeName||'--'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280">Shipper:</td><td>${ff.shipperName||'--'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280">Mode:</td><td>${shipment.shipmentType||'--'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280">HAWB:</td><td>${ff.hawb||'--'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280">Packages:</td><td>${ff.noOfPackages||'--'}</td></tr>
          </table>
        </div>
      </div>
      <div style="padding:16px;background:#f1f5f9;text-align:center;font-size:11px;color:#94a3b8">
        ${new Date().getFullYear()} PAS Freight Services Pvt Ltd | Auto-notification
      </div></div>`;

    const result = await sendRawEmail(toEmail, `${statusLabel} - ${shipment.refNo} | PAS Freight`, html);
    console.log('Email sent to', toEmail, 'ID:', result.id);
  } catch (error) {
    console.error('Email failed:', error.message);
  }
}

module.exports = { sendStatusEmail };