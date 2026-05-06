const DISMISS_KEY = 'petfunny_pwa_install_dismissed_until';
let deferredInstallPrompt = null;

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || window.innerWidth <= 820;
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function dismissedRecently() {
  const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return until && Date.now() < until;
}

function dismiss(days = 7) {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
}

function closeInstallModal() {
  document.querySelector('.client-install-backdrop')?.remove();
}

function renderInstallModal() {
  if (!isMobileDevice() || isStandalone() || dismissedRecently() || document.querySelector('.client-install-backdrop')) return;
  const canNativeInstall = Boolean(deferredInstallPrompt);
  const ios = isIos();
  const wrap = document.createElement('div');
  wrap.className = 'client-install-backdrop';
  wrap.innerHTML = `
    <section class="client-install-modal" role="dialog" aria-modal="true" aria-label="Instalar Meu PetFunny">
      <button class="client-install-close" type="button" data-pwa-dismiss aria-label="Fechar">×</button>
      <div class="client-install-logo"><img src="/assets/img/icon-192.png" alt="PetFunny"></div>
      <p class="eyebrow">Meu PetFunny no celular</p>
      <h2>Instale o app do tutor</h2>
      <p>Tenha agenda, pacotes, recibos, roleta de mimos e avisos do PetFunny direto na tela inicial do seu celular.</p>
      ${ios ? `<div class="client-install-tip"><strong>No iPhone:</strong> toque em Compartilhar <span>↗</span> e depois em <strong>Adicionar à Tela de Início</strong>.</div>` : ''}
      <div class="client-install-actions">
        <button class="btn" id="client-install-app" type="button" ${canNativeInstall ? '' : 'disabled'}>${canNativeInstall ? 'Instalar aplicativo' : (ios ? 'Siga as instruções acima' : 'Instalação disponível em instantes')}</button>
        <button class="btn btn-secondary" type="button" data-pwa-dismiss>Agora não</button>
      </div>
    </section>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-pwa-dismiss]').forEach((button) => button.addEventListener('click', () => { dismiss(7); closeInstallModal(); }));
  wrap.querySelector('#client-install-app')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    if (choice?.outcome === 'accepted') dismiss(365);
    closeInstallModal();
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  window.setTimeout(renderInstallModal, 500);
});

window.addEventListener('appinstalled', () => {
  dismiss(365);
  closeInstallModal();
});

export function initClientInstallPrompt() {
  if (isStandalone()) return;
  window.setTimeout(renderInstallModal, 900);
}
