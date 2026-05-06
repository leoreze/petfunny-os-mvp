import { getClientUser, clientLogout, requireClientFrontendAuth } from './client-auth.js';
import { finishPageLoading } from './loading.js';

const navItems = [
  { key: 'home', label: 'Timeline', icon: '✨', href: '/app/home' },
  { key: 'agenda', label: 'Agenda', icon: '📅', href: '/app/agenda' },
  { key: 'pets', label: 'Pets', icon: '🐶', href: '/app/pets' },
  { key: 'roleta', label: 'Roleta', icon: '🎁', href: '/app/roleta' },
  { key: 'promocoes', label: 'Promoções', icon: '🏷️', href: '/app/promocoes' }
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
        ${navItems.map((item) => `<a class="${item.key === active ? 'is-active' : ''}" href="${item.href}"><span>${item.icon}</span><small>${item.label}</small></a>`).join('')}
      </nav>
    </main>
  `;
  document.getElementById('client-logout')?.addEventListener('click', clientLogout);
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
    </div>
  `;
}
