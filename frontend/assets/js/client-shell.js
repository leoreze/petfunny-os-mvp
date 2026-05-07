import { getClientUser, clientLogout, requireClientFrontendAuth } from './client-auth.js';
import { finishPageLoading } from './loading.js';

const navItems = [
  { key: 'home', label: 'Timeline', icon: '✨', href: '/app/home', priority: 1 },
  { key: 'agenda', label: 'Agenda', icon: '📅', href: '/app/agenda', priority: 2 },
  { key: 'pets', label: 'Pets', icon: '🐶', href: '/app/pets', priority: 3 },
  { key: 'historico', label: 'Histórico', icon: '📄', href: '/app/historico', priority: 4 },
  { key: 'pacotes', label: 'Pacotes', icon: '📦', href: '/app/pacotes', priority: 5 },
  { key: 'roleta', label: 'Roleta', icon: '🎁', href: '/app/roleta', priority: 6 },
  { key: 'promocoes', label: 'Promoções', icon: '🏷️', href: '/app/promocoes', priority: 7 },
  { key: 'bemestar', label: '360 IA', icon: '🧠', href: '/app/bem-estar', priority: 8 }
];

const sectionHeroMeta = {
  home: { icon: '✨', tag: 'Linha do tempo inteligente', actionLabel: 'Agendar pelo app', href: '/app/agenda' },
  agenda: { icon: '📅', tag: 'Novo cuidado em poucos toques', actionLabel: 'Ver meus pets', href: '/app/pets' },
  pets: { icon: '🐶', tag: 'Cadastro completo dos pets', actionLabel: 'Novo agendamento', href: '/app/agenda' },
  historico: { icon: '📄', tag: 'Tudo registrado com segurança', actionLabel: 'Ir para agenda', href: '/app/agenda' },
  pacotes: { icon: '📦', tag: 'Recorrência sem complicação', actionLabel: 'Agendar horário', href: '/app/agenda' },
  mimos: { icon: '🎁', tag: 'Benefícios para tutores', actionLabel: 'Girar roleta', href: '/app/roleta' },
  roleta: { icon: '🎁', tag: 'Mimos e recompensas', actionLabel: 'Ver agenda', href: '/app/agenda' },
  promocoes: { icon: '🏷️', tag: 'Condições especiais', actionLabel: 'Agendar com desconto', href: '/app/agenda' },
  bemestar: { icon: '🧠', tag: 'PetFunny 360 IA', actionLabel: 'Avaliar pet', href: '/app/bem-estar' },
  perfil: { icon: '👤', tag: 'Seus dados protegidos', actionLabel: 'Meus pets', href: '/app/pets' },
  pagamento: { icon: '💠', tag: 'Pagamento seguro via Pix', actionLabel: 'Voltar à agenda', href: '/app/agenda' }
};

export function currentClientSection() {
  const path = window.location.pathname;
  if (path.includes('/agenda')) return 'agenda';
  if (path.includes('/pets')) return 'pets';
  if (path.includes('/historico')) return 'historico';
  if (path.includes('/pacotes')) return 'pacotes';
  if (path.includes('/mimos')) return 'mimos';
  if (path.includes('/roleta')) return 'roleta';
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


function setupClientBottomNavOverflow() {
  const nav = document.querySelector('.client-bottom-nav');
  if (!nav) return;
  const items = [...nav.querySelectorAll('[data-client-nav-item]')];
  const moreButton = nav.querySelector('.client-bottom-more');
  const moreMenu = nav.querySelector('.client-bottom-more-menu');
  if (!items.length || !moreButton || !moreMenu) return;

  // Mantém o rodapé sempre limpo: os 3 últimos itens ficam no menu "Mais".
  const fixedOverflowKeys = new Set(['roleta', 'promocoes', 'bemestar']);

  const itemKey = (item) => item.dataset.navKey || item.getAttribute('href')?.split('/').pop() || '';

  const closeMoreMenu = () => {
    moreMenu.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
    moreButton.classList.remove('is-open');
  };

  const moveToOverflow = (item) => {
    item.hidden = true;
    item.classList.add('is-overflowed');
  };

  const rebuild = () => {
    closeMoreMenu();
    moreMenu.innerHTML = '';
    items.forEach((item) => {
      item.hidden = false;
      item.classList.remove('is-overflowed');
    });

    moreButton.hidden = false;
    fixedOverflowKeys.forEach((key) => {
      const item = items.find((entry) => itemKey(entry) === key);
      if (item) moveToOverflow(item);
    });

    const navStyles = window.getComputedStyle(nav);
    const gap = Number.parseFloat(navStyles.columnGap || navStyles.gap || '4') || 4;
    const available = nav.clientWidth - 10;
    const moreWidth = Math.max(moreButton.offsetWidth, 58);
    const protectedKeys = new Set(['home', 'agenda', 'pets']);
    const sorted = [...items]
      .filter((item) => !item.hidden)
      .sort((a, b) => Number(b.dataset.priority || 0) - Number(a.dataset.priority || 0));

    const visibleWidth = () => {
      const visible = items.filter((item) => !item.hidden);
      return visible.reduce((sum, item) => sum + item.offsetWidth, 0) + moreWidth + gap * Math.max(0, visible.length);
    };

    let current = visibleWidth();
    sorted.forEach((item) => {
      if (current <= available || protectedKeys.has(itemKey(item))) return;
      current -= item.offsetWidth + gap;
      moveToOverflow(item);
    });

    // Se ainda não couber em telas muito estreitas, preserva Timeline, Agenda, Pets e Mais.
    if (current > available) {
      [...items].reverse().forEach((item) => {
        if (current <= available || item.hidden || protectedKeys.has(itemKey(item))) return;
        current -= item.offsetWidth + gap;
        moveToOverflow(item);
      });
    }

    const overflowed = items.filter((item) => item.hidden);
    moreButton.hidden = overflowed.length === 0;
    overflowed.forEach((item) => {
      const link = document.createElement('a');
      link.href = item.getAttribute('href') || '#';
      link.className = item.classList.contains('is-active') ? 'is-active' : '';
      link.innerHTML = item.innerHTML;
      moreMenu.appendChild(link);
    });
  };

  moreButton.onclick = (event) => {
    event.preventDefault();
    const willOpen = moreMenu.hidden;
    moreMenu.hidden = !willOpen;
    moreButton.setAttribute('aria-expanded', String(willOpen));
    moreButton.classList.toggle('is-open', willOpen);
  };
  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target)) closeMoreMenu();
  }, { passive: true });
  window.addEventListener('resize', () => window.requestAnimationFrame(rebuild), { passive: true });
  window.requestAnimationFrame(rebuild);
}

export function buildClientApp({ title = 'Meu PetFunny', subtitle = 'O app do seu pet dentro do PetFunny.', content = '', active = currentClientSection() } = {}) {
  if (!requireClientFrontendAuth()) return;
  const payload = getClientUser();
  const tutor = payload?.tutor || {};
  document.body.innerHTML = `
    <main class="client-app-shell mobile-first">
      <header class="client-mobile-topbar">
        <a class="client-mobile-brand" href="/app/home" aria-label="PetFunny"><img src="/assets/img/logo-petfunny-full.png" alt="PetFunny"></a>
        <div class="client-top-actions">
          <a class="client-icon-btn" href="https://wa.me/5516981535338" aria-label="WhatsApp">💬</a>
          <a class="client-avatar-btn ${active === 'perfil' ? 'is-active' : ''}" href="/app/perfil" aria-label="Abrir perfil do tutor"><span>${escapeHtml(tutorInitials(tutor.name))}</span></a>
          <button class="client-icon-btn" id="client-logout" type="button" aria-label="Sair">↪</button>
        </div>
      </header>
      <section class="client-mobile-hero client-area-hero section-${escapeHtml(active)}">
        <div class="client-area-hero-copy">
          <span class="client-area-postit">${escapeHtml((sectionHeroMeta[active] || sectionHeroMeta.home).tag)}</span>
          <p class="eyebrow">App do tutor</p>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
          <div class="client-area-hero-actions">
            <a class="btn btn-sm" href="${escapeHtml((sectionHeroMeta[active] || sectionHeroMeta.home).href)}">${escapeHtml((sectionHeroMeta[active] || sectionHeroMeta.home).actionLabel)}</a>
            <span class="client-profile-pill">🐾 ${escapeHtml(tutor.name || 'Tutor PetFunny')}</span>
          </div>
        </div>
        <div class="client-area-hero-art" aria-hidden="true">
          <div class="client-area-hero-orb"></div>
          <strong>${escapeHtml((sectionHeroMeta[active] || sectionHeroMeta.home).icon)}</strong>
          <i></i>
        </div>
      </section>
      <section class="client-mobile-content">${content}</section>
      <nav class="client-bottom-nav" aria-label="Navegação do app do tutor">
        ${navItems.map((item) => `<a class="${item.key === active ? 'is-active' : ''}" href="${item.href}" data-client-nav-item data-nav-key="${item.key}" data-priority="${item.priority}"><span>${item.icon}</span><small>${item.label}</small></a>`).join('')}
        <button class="client-bottom-more" type="button" aria-label="Mais opções do menu" aria-expanded="false" hidden><span>•••</span><small>Mais</small></button>
        <div class="client-bottom-more-menu" hidden></div>
      </nav>
    </main>
  `;
  document.getElementById('client-logout')?.addEventListener('click', clientLogout);
  setupClientBottomNavOverflow();
  window.requestAnimationFrame(() => window.setTimeout(() => finishPageLoading(), 180));
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
    <div class="client-shortcuts-grid">
      <a class="client-shortcut" href="/app/agenda"><span>📅</span><strong>Agenda</strong><small>Próximos horários</small></a>
      <a class="client-shortcut" href="/app/pets"><span>🐶</span><strong>Pets</strong><small>Dados e cuidados</small></a>
      <a class="client-shortcut" href="/app/historico"><span>📄</span><strong>Histórico</strong><small>Comandas e recibos</small></a>
      <a class="client-shortcut" href="/app/pacotes"><span>📦</span><strong>Pacotes</strong><small>Contratar e acompanhar</small></a>
      <a class="client-shortcut" href="/app/roleta"><span>🎁</span><strong>Roleta</strong><small>Mimos e benefícios</small></a>
      <a class="client-shortcut" href="/app/promocoes"><span>🏷️</span><strong>Promoções</strong><small>Descontos automáticos</small></a>
      <a class="client-shortcut" href="/app/bem-estar"><span>🧠</span><strong>PetFunny 360</strong><small>Bem-estar com IA</small></a>
    </div>
  `;
}
