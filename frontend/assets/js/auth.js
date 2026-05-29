const TOKEN_KEY = 'petfunny_token';
const USER_KEY = 'petfunny_user';

export function setToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setCurrentUser(user) {
  if (!user) return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function requireFrontendAuth() {
  if (!isAuthenticated()) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/admin/login?next=${next}`);
    return false;
  }
  return true;
}

export function logout() {
  clearToken();
  window.location.href = '/admin/login';
}

window.PetFunnyAuth = { setToken, getToken, clearToken, isAuthenticated, getCurrentUser, logout };
