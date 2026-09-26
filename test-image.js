import http from 'http';

http.get('http://localhost:5000/api/admin/attendance/23/image/check-in', {
  headers: {
    // wait, we need a token!
  }
});
