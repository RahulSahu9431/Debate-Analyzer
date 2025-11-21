const API_BASE = ''; // same origin

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/index.html';
  }
}
