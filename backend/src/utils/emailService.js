const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
});

const STATUS_LABELS = {
  'ENQUIRY': 'Enquiry Created', 'RATES_ADDED': 'Rates Added', 'NOMINATED': 'Nominated',
  'BOOKED': 'Booked', 'SCHEDULED': 'Scheduled', 'AWB_GENERATED': 'AWB Generated',
  'DELIVERED': 'Delivered', 'COMPLETED': 'Completed'
};

async function sendStatusEmail(shipment) {
  try {
    const ff = shipment.freightForwarding || {};
    const statusLabel = STATUS_LABELS[shipment.currentStatus] || shipment.currentStatus;
    let toEmail = ff.notificationEmail;

    if (!toEmail) return;
    
    console.log('📧 Sending to:', toEmail, 'via port 587');

    const html = `<div style="font-family:Arial;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px">
      <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0">🚢 PAS Freight Services</h1>
        <p style="color:#c7d2fe;margin:8px 0 0">Shipment Status Update</p>
      </div>
      <div style="padding:24px;background:#f8fafc">
        <div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:16px">
          <p style="color:#6b7280;font-size:13px">Status: <b style="color:#4f46e5">${statusLabel}</b></p>
        </div>
        <div style="background:#fff;border-radius:8px;padding:20px">
          <h3 style="color:#4f46e5">📦 Shipment Details</h3>
          <table style="width:100%">
            <tr><td style="color:#6b7280;padding:8px 0">Ref No:</td><td style="font-weight:600">${shipment.refNo}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0">Consignee:</td><td>${ff.consigneeName||'—'}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0">Shipper:</td><td>${ff.shipperName||'—'}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0">Mode:</td><td>${shipment.shipmentType||'—'}</td></tr>
          </table>
        </div>
      </div>
      <div style="padding:16px;background:#f1f5f9;text-align:center;font-size:11px;color:#94a3b8">
        © ${new Date().getFullYear()} PAS Freight Services Pvt Ltd
      </div></div>`;

    const info = await transporter.sendMail({
      from: `"PAS Freight" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `📦 ${statusLabel} - ${shipment.refNo} | PAS Freight`,
      html
    });

    console.log('✅ Email sent! ID:', info.messageId);
  } catch (error) {
    console.error('❌ Email failed:', error.message, error.code);
  }
}

module.exports = { sendStatusEmail };