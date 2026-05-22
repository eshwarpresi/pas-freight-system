const nodemailer = require('nodemailer');

// Configure email transporter with proper settings
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Status labels for readable emails
const STATUS_LABELS = {
  'ENQUIRY': 'Enquiry Created',
  'RATES_ADDED': 'Rates Added',
  'NOMINATED': 'Nominated',
  'BOOKED': 'Booked',
  'SCHEDULED': 'Scheduled',
  'AWB_GENERATED': 'AWB Generated',
  'CHECKLIST_APPROVED': 'Checklist Approved',
  'BOE_FILED': 'BOE Filed',
  'DO_COLLECTED': 'DO Collected',
  'OOC_DONE': 'OOC Done',
  'GATE_PASS': 'Gate Pass',
  'DELIVERED': 'Delivered',
  'INVOICE_GENERATED': 'Invoice Generated',
  'INVOICE_SENT': 'Invoice Sent',
  'COMPLETED': 'Completed'
};

async function sendStatusEmail(shipment) {
  try {
    const ff = shipment.freightForwarding || {};
    const statusLabel = STATUS_LABELS[shipment.currentStatus] || shipment.currentStatus;

    let toEmail = ff.notificationEmail;
    console.log('📧 Email to:', toEmail, '| status:', shipment.currentStatus);
    
    if (!toEmail) {
      console.log('📧 No notification email set, skipping');
      return;
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('❌ EMAIL_USER or EMAIL_PASS not set in environment');
      return;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #4f46e5, #3b82f6); padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">🚢 PAS Freight Services</h1>
          <p style="color: #c7d2fe; margin: 8px 0 0; font-size: 13px;">Shipment Status Update</p>
        </div>
        <div style="padding: 24px; background: #f8fafc;">
          <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
            <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px;">Status changed to:</p>
            <span style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #3b82f6); color: white; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 14px;">${statusLabel}</span>
          </div>
          <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
            <h3 style="margin: 0 0 16px; color: #4f46e5; font-size: 15px;">📦 Shipment Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 40%;">Reference No:</td><td style="padding: 8px 0; color: #1f2937; font-weight: 600; font-size: 13px;">${shipment.refNo}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Consignee:</td><td style="padding: 8px 0; color: #1f2937; font-size: 13px;">${ff.consigneeName || '—'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Shipper:</td><td style="padding: 8px 0; color: #1f2937; font-size: 13px;">${ff.shipperName || '—'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Mode:</td><td style="padding: 8px 0; color: #1f2937; font-size: 13px;">${shipment.shipmentType || '—'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">HAWB:</td><td style="padding: 8px 0; color: #1f2937; font-size: 13px;">${ff.hawb || '—'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Packages:</td><td style="padding: 8px 0; color: #1f2937; font-size: 13px;">${ff.noOfPackages || '—'}</td></tr>
            </table>
          </div>
        </div>
        <div style="padding: 16px 24px; background: #f1f5f9; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">© ${new Date().getFullYear()} PAS Freight Services Pvt Ltd</p>
        </div>
      </div>
    `;

    console.log('📧 Sending mail via', process.env.EMAIL_USER, 'to', toEmail);
    
    const info = await transporter.sendMail({
      from: `"PAS Freight" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `📦 ${statusLabel} - ${shipment.refNo} | PAS Freight`,
      html
    });

    console.log('✅ Email sent! Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Email failed:', error.message);
    if (error.code) console.error('❌ Error code:', error.code);
  }
}

module.exports = { sendStatusEmail };