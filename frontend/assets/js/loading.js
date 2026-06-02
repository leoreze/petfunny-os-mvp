let loadingTimer = null;
let pageLoadingStarted = false;
let pageLoadingClosed = false;
let trackedFetches = 0;
let idleTimer = null;

const DOG_GIF = '/assets/img/loading-dog.gif';
const LOGO = '/assets/img/logo-petfunny-full.png';

function canShowPageLoader() {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && document.body;
}

function ensureLoading() {
  let el = document.getElementById('safe-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'safe-loading';
    el.className = 'page-loading-modal';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="page-loading-card postit-loading-card">
        <span class="postit-tape"></span>
        <div class="page-loading-visual">
          <img class="page-loading-dog" src="${DOG_GIF}" alt="Carregando PetFunny" />
          <img class="page-loading-logo" src="${LOGO}" alt="PetFunny" />
        </div>
        <div class="page-loading-copy">
          <strong id="safe-loading-title">Preparando tudo...</strong>
          <small id="safe-loading-subtitle">Carregando informações do PetFunny.</small>
        </div>
        <div class="page-loading-progress" aria-hidden="true"><span></span></div>
      </div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

function updateLoadingText(message = 'Preparando tudo...', subtitle = 'Carregando informações do PetFunny.') {
  const el = ensureLoading();
  const title = el.querySelector('#safe-loading-title');
  const sub = el.querySelector('#safe-loading-subtitle');
  if (title) title.textContent = message;
  if (sub) sub.textContent = subtitle;
  return el;
}

export function showLoading(message = 'Preparando tudo...', subtitle = 'Operação segura com timeout automático.', options = {}) {
  const el = updateLoadingText(message, subtitle);
  el.hidden = false;
  el.classList.remove('is-hiding');
  document.body.classList.add('has-page-loading');
  window.clearTimeout(loadingTimer);

  const timeoutMs = typeof options === 'number'
    ? options
    : Number(options?.timeoutMs ?? 9000);

  // O timeout continua existindo como segurança, mas páginas críticas podem
  // aumentar ou desativar o fechamento automático para evitar tela em branco
  // enquanto o navegador ainda monta o DOM pesado.
  if (timeoutMs > 0) {
    loadingTimer = window.setTimeout(() => hideLoading(), timeoutMs);
  }
}

export function hideLoading() {
  window.clearTimeout(loadingTimer);
  const el = document.getElementById('safe-loading');

  // Segurança extra: quando a página usa buildShell(), o body é recriado e o modal pode
  // ser removido antes do finally chamar hideLoading(). Mesmo assim o cursor/estado de
  // carregamento precisa ser limpo para não ficar como se algo ainda estivesse pendente.
  if (!el || el.hidden) {
    document.body?.classList.remove('has-page-loading');
    return;
  }

  el.classList.add('is-hiding');
  window.setTimeout(() => {
    el.hidden = true;
    el.classList.remove('is-hiding');
    document.body?.classList.remove('has-page-loading');
  }, 180);
}

export async function withLoading(callback, message = 'Preparando tudo...') {
  showLoading(message);
  try { return await callback(); }
  finally { hideLoading(); }
}

function safeRequestIdleClose() {
  if (window.__PETFUNNY_MANUAL_PAGE_READY) return;
  if (pageLoadingClosed || trackedFetches > 0) return;
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(async () => {
    if (trackedFetches > 0 || pageLoadingClosed) return;
    await waitForPagePaintAndImages();
    finishPageLoading();
  }, 260);
}

export async function waitForPagePaintAndImages() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const images = Array.from(document.images || []).filter((img) => !img.complete && typeof img.decode === 'function');
  if (images.length) {
    await Promise.race([
      Promise.allSettled(images.slice(0, 16).map((img) => img.decode())),
      new Promise((resolve) => setTimeout(resolve, 1200))
    ]);
  }
  await new Promise((resolve) => setTimeout(resolve, 40));
}

export function startPageLoading(message = 'Abrindo página...', subtitle = 'Carregando dados e montando a tela.') {
  if (!canShowPageLoader() || pageLoadingClosed || pageLoadingStarted) return;
  pageLoadingStarted = true;
  showLoading(message, subtitle);
  const fallbackMs = window.__PETFUNNY_MANUAL_PAGE_READY ? 45000 : 11000;
  window.setTimeout(() => finishPageLoading(), fallbackMs);
  if (!window.__PETFUNNY_MANUAL_PAGE_READY) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') safeRequestIdleClose();
    else document.addEventListener('DOMContentLoaded', safeRequestIdleClose, { once: true });
    window.addEventListener('load', safeRequestIdleClose, { once: true });
  }
}

export function finishPageLoading() {
  if (pageLoadingClosed) return;
  pageLoadingClosed = true;
  window.clearTimeout(idleTimer);
  hideLoading();
}

function patchFetchForPageLoading() {
  if (window.__petfunnyFetchTracked) return;
  window.__petfunnyFetchTracked = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    trackedFetches += 1;
    try {
      return await originalFetch(...args);
    } finally {
      trackedFetches = Math.max(0, trackedFetches - 1);
      safeRequestIdleClose();
    }
  };
}

if (typeof window !== 'undefined') {
  patchFetchForPageLoading();
  window.addEventListener('petfunny:page-ready', finishPageLoading);
  if (document.body) startPageLoading();
  else document.addEventListener('DOMContentLoaded', () => startPageLoading(), { once: true });
}


export function showResultModal({
  type = 'success',
  title = 'Tudo certo!',
  message = 'Operação concluída com sucesso.',
  okText = 'OK'
} = {}) {
  if (typeof document === 'undefined') return Promise.resolve();
  let modal = document.getElementById('petfunny-result-modal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'petfunny-result-modal';
    modal.className = 'modal-shell agenda-appointment-modal petfunny-result-modal';
    modal.innerHTML = `
      <div class="modal-card agenda-appointment-modal-card petfunny-result-card">
        <header class="modal-header agenda-modal-header">
          <div class="modal-title-block">
            <p class="eyebrow" id="petfunny-result-eyebrow">Confirmação</p>
            <h2 id="petfunny-result-title">Tudo certo!</h2>
            <p class="modal-subtitle" id="petfunny-result-message">Operação concluída com sucesso.</p>
          </div>
        </header>
        <div class="modal-body petfunny-result-body">
          <div class="petfunny-result-icon" id="petfunny-result-icon">✓</div>
          <p id="petfunny-result-detail">As informações foram atualizadas no PetFunny OS.</p>
        </div>
        <footer class="modal-footer">
          <button class="btn" id="petfunny-result-ok" type="button">OK</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);
  }
  const palette = {
    success: { eyebrow: 'Operação concluída', icon: '✓' },
    error: { eyebrow: 'Atenção necessária', icon: '!' },
    warning: { eyebrow: 'Confira antes de seguir', icon: '!' },
    info: { eyebrow: 'Informação', icon: 'i' }
  };
  const cfg = palette[type] || palette.success;
  modal.dataset.type = type;
  modal.querySelector('#petfunny-result-eyebrow').textContent = cfg.eyebrow;
  modal.querySelector('#petfunny-result-title').textContent = title;
  modal.querySelector('#petfunny-result-message').textContent = message;
  modal.querySelector('#petfunny-result-icon').textContent = cfg.icon;
  modal.querySelector('#petfunny-result-detail').textContent = message;
  modal.querySelector('#petfunny-result-ok').textContent = okText;
  return new Promise((resolve) => {
    const ok = modal.querySelector('#petfunny-result-ok');
    const close = () => {
      ok.removeEventListener('click', close);
      if (modal.open) modal.close();
      resolve();
    };
    ok.addEventListener('click', close);
    if (!modal.open) modal.showModal();
  });
}

export function showSuccessModal(title = 'Tudo certo!', message = 'Operação concluída com sucesso.') {
  return showResultModal({ type: 'success', title, message, okText: 'OK' });
}
