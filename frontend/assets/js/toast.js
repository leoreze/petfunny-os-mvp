function createToast(message, type = 'info') {
  const el = document.createElement('div');
  const palette = {
    error: 'linear-gradient(135deg,#be123c,#991b1b)',
    success: 'linear-gradient(135deg,#00a9b7,#12a876)',
    warning: 'linear-gradient(135deg,#f59e0b,#f97316)',
    info: 'linear-gradient(135deg,#126f9a,#ff9d98)'
  };
  el.className = `pf-toast pf-toast-${type}`;
  el.textContent = message || 'Operação concluída.';
  el.style.cssText = `position:fixed;right:18px;top:18px;z-index:2147483647;padding:13px 17px;border-radius:16px;background:${palette[type] || palette.info};color:#fff;font-weight:900;box-shadow:0 18px 46px rgba(15,23,42,.26);max-width:min(420px,calc(100vw - 36px));line-height:1.35;animation:pf-fade-up .22s cubic-bezier(.22,1,.36,1) both`;
  const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
  const target = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
  target.appendChild(el);
  window.setTimeout(() => el.remove(), 3800);
  return el;
}

export function toast(message, type = 'info') {
  return createToast(message, type);
}

toast.success = (message) => createToast(message, 'success');
toast.error = (message) => createToast(message, 'error');
toast.warning = (message) => createToast(message, 'warning');
toast.info = (message) => createToast(message, 'info');

export function showToast(message, type = 'info') {
  return createToast(message, type);
}
