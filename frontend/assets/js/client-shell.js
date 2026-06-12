import { getClientUser, getClientToken, clientLogout, requireClientFrontendAuth } from './client-auth.js';
import { finishPageLoading, showLoading } from './loading.js';

const navItems = [
  { key: 'home', label: 'Início', icon: '🏠', href: '/app/home', priority: 1 },
  { key: 'agenda', label: 'Agendar', icon: '📅', href: '/app/agenda', priority: 2 },
  { key: 'agendamentos', label: 'Agenda', icon: '🕘', href: '/app/agendamentos', priority: 3 },
  { key: 'pets', label: 'Meus Pets', icon: '🐾', href: '/app/pets', priority: 4 }
];

const overflowNavItems = [
  { key: 'indique', label: 'Benefícios', icon: '🎁', href: '/app/indique', priority: 5 },
  { key: 'perfil', label: 'Perfil', icon: '👤', href: '/app/perfil', priority: 6 },
  { key: 'momentos', label: 'Momentos', icon: '📸', href: '/app/momentos', priority: 7 },
  { key: 'saude', label: 'Saúde 360', icon: '🩺', href: '/app/saude-360', priority: 8 },
  { key: 'teleconsultas', label: 'Tele Consultas', icon: '📹', href: '/app/teleconsultas', priority: 9 },
  { key: 'historico', label: 'Histórico', icon: '📄', href: '/app/historico', priority: 9 },
  { key: 'pacotes', label: 'Pacotes', icon: '📦', href: '/app/pacotes', priority: 10 },
  { key: 'roleta', label: 'Roleta', icon: '🎁', href: '/app/roleta', priority: 11 },
  { key: 'promocoes', label: 'Promoções', icon: '🏷️', href: '/app/promocoes', priority: 12 },
  { key: 'bolao', label: 'Bolão da Copa', icon: '🏆', href: '/app/bolao-copa', priority: 12 },
  { key: 'notificacoes', label: 'Notificações', icon: '🔔', href: '/app/notificacoes', priority: 13 },
  { key: 'bemestar', label: '360 IA', icon: '🧠', href: '/app/bem-estar', priority: 14 }
];

const sectionHeroMeta = {
  home: { icon: '🐾', tag: 'Diário digital do pet', actionLabel: 'Agendar cuidado', href: '/app/agenda' },
  agenda: { icon: '📅', tag: 'Novo cuidado em poucos toques', actionLabel: 'Ver meus pets', href: '/app/pets' },
  agendamentos: { icon: '🕘', tag: 'Agenda do tutor', actionLabel: 'Novo agendamento', href: '/app/agenda' },
  pets: { icon: '🐶', tag: 'Cadastro completo dos pets', actionLabel: 'Novo agendamento', href: '/app/agenda' },
  historico: { icon: '📄', tag: 'Tudo registrado com segurança', actionLabel: 'Ir para agenda', href: '/app/agenda' },
  momentos: { icon: '📸', tag: 'Momentos do atendimento', actionLabel: 'Agendar próximo banho', href: '/app/agenda' },
  pacotes: { icon: '📦', tag: 'Recorrência sem complicação', actionLabel: 'Agendar horário', href: '/app/agenda' },
  mimos: { icon: '🎁', tag: 'Benefícios para tutores', actionLabel: 'Girar roleta', href: '/app/roleta' },
  indique: { icon: '🤝', tag: 'Clube de indicação', actionLabel: 'Compartilhar convite', href: '/app/indique' },
  roleta: { icon: '🎁', tag: 'Mimos e recompensas', actionLabel: 'Ver agenda', href: '/app/agenda' },
  saude: { icon: '🩺', tag: 'Health 360 preventivo', actionLabel: 'Meu pet está estranho', href: '/app/saude-360' },
  teleconsultas: { icon: '📹', tag: 'Consulta veterinária online', actionLabel: 'Escolher pet', href: '/app/teleconsultas' },
  notificacoes: { icon: '🔔', tag: 'Central de avisos', actionLabel: 'Ver notificações', href: '/app/notificacoes' },
  promocoes: { icon: '🏷️', tag: 'Condições especiais', actionLabel: 'Agendar com desconto', href: '/app/agenda' },
  bolao: { icon: '🏆', tag: 'Copa do Mundo PetFunny', actionLabel: 'Dar palpite', href: '/app/bolao-copa' },
  bemestar: { icon: '🧠', tag: 'PetFunny 360 IA', actionLabel: 'Avaliar pet', href: '/app/bem-estar' },
  perfil: { icon: '👤', tag: 'Seus dados protegidos', actionLabel: 'Meus pets', href: '/app/pets' },
  pagamento: { icon: '💠', tag: 'Pagamento seguro via Pix', actionLabel: 'Voltar à agenda', href: '/app/agenda' }
};

export function currentClientSection() {
  const path = window.location.pathname;
  if (path.includes('/agendamentos')) return 'agendamentos';
  if (path.includes('/agenda')) return 'agenda';
  if (path.includes('/pets')) return 'pets';
  if (path.includes('/historico')) return 'historico';
  if (path.includes('/momentos')) return 'momentos';
  if (path.includes('/pacotes')) return 'pacotes';
  if (path.includes('/indique')) return 'indique';
  if (path.includes('/mimos')) return 'mimos';
  if (path.includes('/teleconsultas')) return 'teleconsultas';
  if (path.includes('/notificacoes')) return 'notificacoes';
  if (path.includes('/saude-360')) return 'saude';
  if (path.includes('/roleta')) return 'roleta';
  if (path.includes('/bolao-copa')) return 'bolao';
  if (path.includes('/promocoes')) return 'promocoes';
  if (path.includes('/bem-estar')) return 'bemestar';
  if (path.includes('/perfil')) return 'perfil';
  if (path.includes('/pagamento-pix')) return 'pagamento';
  return 'home';
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function tutorInitials(name = '') {
  const clean = String(name || '').trim();
  if (!clean) return 'PF';
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}` : clean.slice(0, 2);
  return initials.toUpperCase();
}

export function money(cents = 0) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dateTime(value) {
  if (!value) return 'Data não definida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não definida';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}


function trackClientAccess(eventType = 'page_view', metadata = {}) {
  try {
    const token = getClientToken();
    if (!token || window.__petfunnyLastAccessLog === `${eventType}:${window.location.pathname}`) return;
    window.__petfunnyLastAccessLog = `${eventType}:${window.location.pathname}`;
    fetch('/api/app/access-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventType, page: window.location.pathname, metadata }),
      keepalive: true,
      cache: 'no-store'
    }).catch(() => {});
  } catch {}
}

function applyClientInputMasks(scope = document) {
  const digits = (value) => String(value || '').replace(/\D/g, '');
  const normalizeBrazilMobileDigits = (value) => {
    let d = digits(value);
    // O banco pode guardar WhatsApp em formato internacional: 55 + DDD + número.
    // Na interface do tutor exibimos somente DDD + número: (16) 98151-1992.
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    return d.slice(0, 11);
  };
  const masks = {
    whatsapp(value) {
      const d = normalizeBrazilMobileDigits(value);
      if (d.length <= 2) return d;
      if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    cep(value) {
      const d = digits(value).slice(0, 8);
      return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    },
    money(value) {
      const cents = Number(digits(value) || '0') / 100;
      return cents.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    percent(value) {
      const d = digits(value).slice(0, 3);
      return d ? `${Math.min(Number(d), 100)}%` : '';
    },
    time(value) {
      const d = digits(value).slice(0, 4);
      return d.length > 2 ? `${d.slice(0,2)}:${d.slice(2)}` : d;
    },
    code(value) { return digits(value).slice(0, 6); },
    uf(value) { return String(value || '').replace(/[^a-zA-Z]/g, '').slice(0,2).toUpperCase(); }
  };
  const infer = (el) => {
    const key = `${el.dataset.mask || ''} ${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.type || ''}`.toLowerCase();
    if (el.dataset.mask) return el.dataset.mask;
    if (key.includes('whatsapp') || key.includes('telefone') || key.includes('phone') || el.type === 'tel') return 'whatsapp';
    if (key.includes('cep')) return 'cep';
    if (key.includes('state') || key.includes('uf') || key.includes('estado')) return 'uf';
    if (key.includes('code') || key.includes('codigo') || key.includes('código')) return 'code';
    if (key.includes('desconto') || key.includes('discount') || key.includes('percent')) return 'percent';
    if (key.includes('time') || key.includes('horário') || key.includes('horario')) return 'time';
    if (key.includes('valor') || key.includes('price') || key.includes('money')) return 'money';
    return '';
  };
  scope.querySelectorAll('input, textarea').forEach((el) => {
    if (el.type === 'password' || el.type === 'email' || el.type === 'date' || el.readOnly) return;
    const mask = infer(el);
    if (!mask || !masks[mask]) return;
    el.dataset.mask = mask;
    if (['whatsapp', 'cep', 'code', 'percent', 'time', 'money'].includes(mask)) el.setAttribute('inputmode', 'numeric');
    if (mask === 'code') el.setAttribute('maxlength', '6');
    if (mask === 'uf') el.setAttribute('maxlength', '2');
    if (el.dataset.clientMaskBound === '1') return;
    el.dataset.clientMaskBound = '1';
    const run = () => { el.value = masks[mask](el.value); };
    el.addEventListener('input', run);
    el.addEventListener('blur', run);
    run();
  });
  if (!document.documentElement.dataset.clientMaskDelegated) {
    document.documentElement.dataset.clientMaskDelegated = '1';
    document.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (!target.closest('.client-app-shell, .client-login-shell, .client-auth-page, .client-mobile-content')) return;
      applyClientInputMasks(target.closest('form') || document);
    }, true);
  }
}


function setupClientBottomNavOverflow() {
  const nav = document.querySelector('.client-bottom-nav');
  if (!nav) return;
  const moreButton = nav.querySelector('.client-bottom-more');
  const moreMenu = nav.querySelector('.client-bottom-more-menu');
  if (!moreButton || !moreMenu) return;

  const closeMoreMenu = () => {
    moreMenu.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
    moreButton.classList.remove('is-open');
  };

  const activeSection = currentClientSection();
  const hasActiveOverflow = overflowNavItems.some((item) => item.key === activeSection);
  moreButton.hidden = overflowNavItems.length === 0;
  moreButton.classList.toggle('is-active', hasActiveOverflow);
  moreMenu.innerHTML = overflowNavItems.map((item) => `
    <a class="${item.key === activeSection ? 'is-active' : ''}" href="${item.href}" data-nav-key="${item.key}">
      <span>${item.icon}</span><small>${item.label}</small>
    </a>
  `).join('');

  moreButton.onclick = (event) => {
    event.preventDefault();
    const willOpen = moreMenu.hidden;
    moreMenu.hidden = !willOpen;
    moreButton.setAttribute('aria-expanded', String(willOpen));
    moreButton.classList.toggle('is-open', willOpen);
  };

  const loadingMessageForLink = (link) => {
    const label = link?.querySelector('small')?.textContent?.trim() || link?.textContent?.trim() || 'Meu PetFunny';
    return label ? `Abrindo ${label}...` : 'Abrindo página...';
  };

  nav.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || link.target === '_blank') return;
    showLoading(loadingMessageForLink(link), 'Carregando dados e montando a tela completa.');
    closeMoreMenu();
  });

  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target)) closeMoreMenu();
  }, { passive: true });
}

export function buildClientApp({ title = 'Meu PetFunny', subtitle = 'O app do seu pet dentro do PetFunny.', content = '', active = currentClientSection() } = {}) {
  if (!requireClientFrontendAuth()) return;
  const payload = getClientUser();
  const tutor = payload?.tutor || {};
  const heroMeta = sectionHeroMeta[active] || sectionHeroMeta.home;
  const shouldShowAreaHero = active !== 'home';
  // v1.6.56 — heros do App do Tutor ficam apenas com tag, título e subtítulo.
  // Botões e nome do tutor foram removidos para evitar sobreposição com o conteúdo abaixo.
  const showAreaHeroActions = false;
  const areaHero = shouldShowAreaHero ? `
    <section class="client-mobile-hero client-area-hero section-${escapeHtml(active)}">
      <div class="client-area-hero-copy">
        <span class="client-area-postit">${escapeHtml(heroMeta.tag)}</span>
        <p class="eyebrow">App do tutor</p>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="client-hero-subtitle">${escapeHtml(subtitle)}</p>` : ''}
        ${showAreaHeroActions ? `<div class="client-area-hero-actions">
          <a class="btn btn-sm" href="${escapeHtml(heroMeta.href)}">${escapeHtml(heroMeta.actionLabel)}</a>
          <span class="client-profile-pill">🐾 ${escapeHtml(tutor.name || 'Tutor PetFunny')}</span>
        </div>` : ''}
      </div>
      <div class="client-area-hero-art" aria-hidden="true">
        <div class="client-area-hero-orb"></div>
        <strong>${escapeHtml(heroMeta.icon)}</strong>
        <i></i>
      </div>
    </section>` : '';

  document.body.classList.add('app-client', 'client-pwa-layout-v1652', 'client-pwa-layout-v1653', 'client-pwa-layout-v1655', 'client-pwa-layout-v1656', 'client-pwa-layout-v1657', 'client-pwa-layout-v1658', 'client-pwa-layout-v1659', 'client-pwa-layout-v1660', 'client-pwa-layout-v1662', 'client-pwa-layout-v1666', 'client-pwa-layout-v1676');
  document.body.innerHTML = `
    <main class="client-app-shell mobile-first client-fixed-app-shell">
      <header class="client-mobile-topbar client-fixed-topbar">
        <a class="client-mobile-brand" href="/app/home" aria-label="PetFunny"><img src="/assets/img/logo-petfunny-full.png" alt="PetFunny"></a>
        <div class="client-top-actions">
          <a class="client-icon-btn client-notification-btn" href="/app/notificacoes" aria-label="Notificações">🔔<span class="client-notification-badge" id="client-notification-badge" hidden>0</span></a>
          <button class="client-icon-btn client-logout-btn" type="button" data-client-logout aria-label="Sair do app">↩</button>
        </div>
      </header>
      <section class="client-mobile-content client-scroll-content">${areaHero}${content}</section>
      <nav class="client-bottom-nav client-flat-bottom-nav" aria-label="Navegação do app do tutor">
        ${navItems.map((item) => `<a class="${item.key === active ? 'is-active' : ''}" href="${item.href}" data-client-nav-item data-nav-key="${item.key}" data-priority="${item.priority}"><span>${item.icon}</span><small>${item.label}</small></a>`).join('')}
        <button class="client-bottom-more" type="button" aria-label="Mais opções do menu" aria-expanded="false" hidden><span>•••</span><small>Mais</small></button>
        <div class="client-bottom-more-menu" hidden></div>
      </nav>
    </main>
  `;
  const eventMap = { agenda: 'agenda_open', agendamentos: 'appointments_list_open', roleta: 'roleta_open', pacotes: 'packages_open', momentos: 'moments_open', saude: 'health360_open', teleconsultas: 'teleconsultations_open', notificacoes: 'notifications_open', home: 'page_view' };
  trackClientAccess(eventMap[active] || 'page_view');
  setupClientBottomNavOverflow();
  const logoutButton = document.querySelector('[data-client-logout]');
  if (logoutButton) logoutButton.addEventListener('click', () => clientLogout());
  applyClientInputMasks(document);
  window.requestAnimationFrame(() => window.setTimeout(() => finishPageLoading(), 60));
}

function packageBadge(item) {
  if (!item.customerPackageId) return '';
  const label = item.packageSessionLabel || `${item.packageSessionNumber || '?'} de ${item.packageTotalSessions || '?'}`;
  return `<span class="client-badge package">📦 ${escapeHtml(label)}</span>`;
}

function statusBadge(item) {
  return `<span class="client-badge" style="--badge-color:${escapeHtml(item.statusColor || '#00a9b7')}">${escapeHtml(item.statusName || item.status || 'Agendado')}</span>`;
}

export function renderAppointmentCard(item, compact = false) {
  return `
    <article class="client-list-card appointment-card">
      <div class="client-list-icon">${item.customerPackageId ? '📦' : '📅'}</div>
      <div class="client-list-body">
        <div class="client-list-title-row">
          <h3>${escapeHtml(item.petName || 'Pet')}</h3>
          ${statusBadge(item)}
        </div>
        <p class="client-main-date">${dateTime(item.startsAt)}</p>
        <p>${escapeHtml(item.services || 'Serviços em preparação')}</p>
        <div class="client-chip-row">
          ${packageBadge(item)}
          ${item.totalCents ? `<span class="client-badge light">${money(item.totalCents)}</span>` : ''}
        </div>
        ${compact ? '' : `<div class="client-card-actions">
          ${item.commandUrl ? `<a class="btn btn-secondary btn-sm" target="_blank" href="${item.commandUrl}">Comanda</a>` : ''}
          ${item.receiptUrl ? `<a class="btn btn-secondary btn-sm" target="_blank" href="${item.receiptUrl}">Recibo</a>` : ''}
          <a class="btn btn-sm" href="https://wa.me/5516981535338?text=${encodeURIComponent('Olá, PetFunny! Quero falar sobre meu agendamento de ' + dateTime(item.startsAt))}" target="_blank">WhatsApp</a>
        </div>`}
      </div>
    </article>
  `;
}

export function renderPetCard(pet) {
  const initials = String(pet.name || 'P').slice(0, 1).toUpperCase();
  return `
    <article class="client-pet-card">
      <div class="client-pet-avatar">${pet.photoUrl ? `<img src="${escapeHtml(pet.photoUrl)}" alt="${escapeHtml(pet.name)}">` : `<span>${escapeHtml(initials)}</span>`}</div>
      <div>
        <h3>${escapeHtml(pet.name || 'Pet')}</h3>
        <p>${escapeHtml([pet.breed, pet.size].filter(Boolean).join(' · ') || 'Cadastro ativo')}</p>
        ${pet.restrictions ? `<div class="client-alert-mini">Atenção: ${escapeHtml(pet.restrictions)}</div>` : ''}
      </div>
    </article>
  `;
}

export function renderPackageCard(pkg) {
  const progress = pkg.totalSessions ? Math.min(100, Math.round((pkg.usedSessions / pkg.totalSessions) * 100)) : 0;
  return `
    <article class="client-list-card package-card">
      <div class="client-list-icon">🎁</div>
      <div class="client-list-body">
        <div class="client-list-title-row"><h3>${escapeHtml(pkg.name)}</h3><span class="client-badge package">${pkg.recurring ? 'Recorrente' : 'Pacote'}</span></div>
        <p>${escapeHtml(pkg.petName)} · ${pkg.usedSessions} de ${pkg.totalSessions} sessões usadas</p>
        <div class="client-progress"><span style="width:${progress}%"></span></div>
        <div class="client-chip-row"><span class="client-badge light">Restam ${pkg.remainingSessions}</span><span class="client-badge light">${money(pkg.amountCents)}</span></div>
        <div class="client-card-actions">
          <a class="btn btn-secondary btn-sm" target="_blank" href="${pkg.commandUrl}">Comanda</a>
          <a class="btn btn-secondary btn-sm" target="_blank" href="${pkg.receiptUrl}">Recibo</a>
        </div>
      </div>
    </article>
  `;
}

export function clientCards() {
  return `
    <div class="client-shortcuts-grid client-home-action-grid">
      <a class="client-shortcut" href="/app/agenda"><span>📅</span><strong>Agendar Serviço</strong><small>Banho, tosa e cuidados</small></a>
      <a class="client-shortcut" href="/app/agendamentos"><span>🕘</span><strong>Meus Agendamentos</strong><small>Próximos e histórico</small></a>
      <a class="client-shortcut" href="/app/momentos"><span>🖼️</span><strong>Momentos Especiais</strong><small>Fotos e vídeos do pet</small></a>
      <a class="client-shortcut" href="/app/indique"><span>🎁</span><strong>Clube de Benefícios</strong><small>Mimos, ossinhos e vantagens</small></a>
      <a class="client-shortcut" href="/app/saude-360"><span>🩺</span><strong>Saúde 360</strong><small>Check-up, vacinas e doses</small></a>
      <a class="client-shortcut" href="/app/teleconsultas"><span>📹</span><strong>Tele Consultas</strong><small>Veterinário online</small></a>
      <a class="client-shortcut" href="/app/pets"><span>🐾</span><strong>Meus Pets</strong><small>Dados e histórico</small></a>
      <a class="client-shortcut" href="/app/historico"><span>📄</span><strong>Histórico</strong><small>Comandas e recibos</small></a>
      <a class="client-shortcut" href="https://wa.me/5516981535338" target="_blank" rel="noopener"><span>💬</span><strong>Fale Conosco</strong><small>Suporte pelo WhatsApp</small></a>
    </div>
  `;
}
