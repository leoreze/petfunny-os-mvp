import { getClientToken, clearClientSession } from './client-auth.js';

const API_BASE = '/api';

async function request(path, options = {}) {
  const token = getClientToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    cache: 'no-store',
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (response.status === 401) {
    clearClientSession();
    if (!window.location.pathname.includes('/app/login') && !window.location.pathname.includes('/primeiro-acesso')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/app/login?next=${next}`);
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

export const clientApi = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data || {}) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data || {}) }),
  delete: (path) => request(path, { method: 'DELETE' })
};
