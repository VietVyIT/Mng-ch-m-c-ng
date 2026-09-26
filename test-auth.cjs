const http = require('http');

const payload = JSON.stringify({ username: 'admin', password: 'Phanvietvy107@' });

const req = http.request({
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const token = JSON.parse(data).token;
    console.log('Got token', !!token);
    
    // Now fetch image
    http.get({
      hostname: 'localhost',
      port: 5000,
      path: '/api/admin/attendance-requests/11/image',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res2) => {
      console.log('Image status:', res2.statusCode, res2.headers['content-type']);
      let imgData = [];
      res2.on('data', chunk => imgData.push(chunk));
      res2.on('end', () => {
        const buf = Buffer.concat(imgData);
        console.log('Image size:', buf.length);
      });
    });
  });
});

req.write(payload);
req.end();
