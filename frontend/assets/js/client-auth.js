const CLIENT_TOKEN_KEY = 'petfunny_client_token';
const CLIENT_USER_KEY = 'petfunny_client_user';

export function setClientToken(token) {
  if (!token) return;
  localStorage.setItem(CLIENT_TOKEN_KEY, token);
}

export function getClientToken() {
  return localStorage.getItem(CLIENT_TOKEN_KEY);
}

export function clearClientSession() {
  localStorage.removeItem(CLIENT_TOKEN_KEY);
  localStorage.removeItem(CLIENT_USER_KEY);
}

export function setClientUser(payload) {
  if (!payload) return;
  localStorage.setItem(CLIENT_USER_KEY, JSON.stringify(payload));
}

export function getClientUser() {
  try {
    const raw = localStorage.getItem(CLIENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isClientAuthenticated() {
  return Boolean(getClientToken());
}

export function requireClientFrontendAuth() {
  if (!isClientAuthenticated()) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/app/login?next=${next}`);
    return false;
  }
  return true;
}

export function clientLogout() {
  clearClientSession();
  window.location.href = '/app/login';
}
