const http = require('http');

const SHIPMENT_ID = '3fddb844-9147-40b8-b921-b444357ba6ab';

const data = JSON.stringify({
  invoiceNumber: 'INV-2026-001',
  invoiceDate: '2026-04-27'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: `/api/accounts/shipments/${SHIPMENT_ID}/invoice`,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log(JSON.stringify(JSON.parse(body), null, 2)));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();