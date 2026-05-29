import { getToken, clearToken } from './auth.js';

const API_BASE = '/api';

function normalizeApiPath(path) {
  const value = String(path || '');
  if (!value) return '/';
  return value.startsWith('/api/') ? value.slice(4) : value;
}

async function request(path, options = {}) {
  const token = getToken();
  const safePath = normalizeApiPath(path);
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${safePath}`, {
    headers,
    cache: 'no-store',
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (response.status === 401) {
    clearToken();
    if (!window.location.pathname.includes('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/admin/login?next=${next}`);
    }
    const message = typeof payload === 'object' ? payload.error || 'Sessão expirada.' : payload;
    throw new Error(message);
  }

  if (!response.ok) {
    const message = typeof payload === 'object' ? payload.error || 'Erro na requisição.' : payload;
    throw new Error(message || 'Erro na requisição.');
  }

  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data || {}) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data || {}) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data || {}) }),
  delete: (path) => request(path, { method: 'DELETE' })
};
