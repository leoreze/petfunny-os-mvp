import { getCurrentUser, logout, requireFrontendAuth } from './auth.js';
import { showLoading, startPageLoading } from './loading.js';
import { api } from './api.js';
import { setupAdminContextChat } from './admin-ai-chat.js';

const menuItems = [
  { label: 'Dashboard', icon: '📊', href: '/admin/dashboard', aliases: ['/dashboard', '/admin', '/admin/dashboard'] },
  { label: 'Agenda', icon: '📅', href: '/admin/agenda', aliases: ['/agenda', '/admin/agenda'] },
  { label: 'Tutores', icon: '👥', href: '/admin/tutores', aliases: ['/tutores', '/admin/tutores'] },
  { label: 'Pets', icon: '🐾', href: '/admin/pets', aliases: ['/pets', '/admin/pets'] },
  { label: 'Serviços', icon: '✂️', href: '/admin/servicos', aliases: ['/servicos', '/admin/servicos'] },
  { label: 'Pacotes', icon: '🎁', href: '/admin/pacotes', aliases: ['/pacotes', '/admin/pacotes'] },
  { label: 'Financeiro', icon: '💳', href: '/admin/financeiro', aliases: ['/financeiro', '/admin/financeiro'] },
  { label: 'Relatórios', icon: '📈', href: '/admin/relatorios', aliases: ['/relatorios', '/admin/relatorios'] },
  { label: 'CRM & Marketing', icon: '📣', href: '/admin/crm', aliases: ['/crm', '/admin/crm'] },
  { label: 'Promoções', icon: '🏷️', href: '/admin/promocoes', aliases: ['/promocoes', '/admin/promocoes'] },
  { label: 'PetFunny 360', icon: '🧠', href: '/admin/bem-estar', aliases: ['/bem-estar', '/admin/bem-estar'] },
  { label: 'Saúde 360', icon: '🩺', href: '/admin/saude-360', aliases: ['/saude-360', '/admin/saude-360'] },
  { label: 'Roleta de Mimos', icon: '🎡', href: '/admin/roleta-de-mimos', aliases: ['/roleta-de-mimos', '/admin/roleta-de-mimos'] },
  { label: 'Notificações', icon: '🔔', href: '/admin/notificacoes', aliases: ['/notificacoes', '/admin/notificacoes'] },
  { label: 'WhatsApp', icon: '💬', href: '/admin/whatsapp', aliases: ['/whatsapp', '/admin/whatsapp'] },
  { label: 'Assistente IA', icon: '✨', href: '/admin/assistente-ia', aliases: ['/assistente-ia', '/admin/assistente-ia'] },
  { label: 'Configurações', icon: '⚙️', href: '/admin/configuracoes', aliases: ['/configuracoes', '/admin/configuracoes'] }
];

const storageKey = 'petfunny_sidebar_collapsed';

function userMenu() {
  return `
    <div class="profile-menu" id="profile-menu" hidden>
      <a href="#perfil">👤 Perfil</a>
      <a href="#termos">📜 Termos de Uso e Responsabilidade</a>
      <a href="#suporte">💬 Suporte</a>
      <button type="button" id="profile-logout">↪️ Sair</button>
    </div>`;
}

export function buildShell({ active = 'Dashboard', title = 'Dashboard PetFunny', eyebrow = 'Gestão PetFunny', subtitle = '', content = '' } = {}) {
  if (!requireFrontendAuth()) return;
  const currentUser = getCurrentUser();
  const displayName = currentUser?.name || 'PetFunny';
  const displayRole = currentUser?.role === 'admin' ? 'Admin' : (currentUser?.role || 'Equipe');
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const nav = menuItems.map((item) => {
    const isActive = item.label === active || item.aliases.includes(path);
    return `<a class="${isActive ? 'active' : ''}" href="${item.href}" title="${item.label}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${item.label}</span></a>`;
  }).join('');

  const preservedLoadingModal = document.getElementById('safe-loading');
  document.body.innerHTML = `
    <div class="mobile-topbar">
      <div class="mobile-brand-wrap"><img class="mobile-logo" src="/assets/img/logo-petfunny-full.png" alt="PetFunny" /></div>
      <button class="mobile-menu-btn" id="mobile-menu-open" type="button" aria-label="Abrir menu"><span></span><span></span><span></span></button>
    </div>
    <div class="mobile-menu-backdrop" id="mobile-backdrop" hidden></div>
    <div class="shell" id="app-shell">
      <aside class="sidebar" id="app-sidebar" aria-label="Menu principal">
        <div class="sidebar-brand-area">
          <button class="sidebar-brand" id="sidebar-brand-toggle" type="button" aria-label="Recolher ou expandir menu">
            <span class="postit-glow"></span>
            <img class="brand-full" src="/assets/img/logo-petfunny-full.png" alt="PetFunny" />
            <img class="brand-icon" src="/assets/img/logo-petfunny-round.png" alt="PetFunny" />
            <span class="sidebar-collapse-hint">⇤</span>
          </button>
          <button class="mobile-close-btn" id="mobile-menu-close" type="button" aria-label="Fechar menu">×</button>
        </div>
        <nav class="nav custom-scroll" aria-label="Menu principal">${nav}</nav>
        <div class="sidebar-footer"><strong>PetFunny - Banho e Tosa</strong><br>Ribeirão Preto / SP<br>Sistema interno do PetFunny.<br><span class="copyright">© ${new Date().getFullYear()} PetFunny OS. Todos os direitos reservados.</span></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar-title">
            <p class="eyebrow">${eyebrow}</p>
            <h2>${title}</h2>
            ${subtitle ? `<p>${subtitle}</p>` : ''}
          </div>
          <div class="topbar-actions">
            <div class="notifications-wrap" id="notifications-wrap">
              <button class="icon-btn notification-btn" id="notification-btn" type="button" title="Notificações">🔔<span class="notification-badge" id="notification-badge" hidden>0</span></button>
              <div class="notification-menu" id="notification-menu" hidden>
                <header><strong>Notificações</strong><small id="notification-subtitle">Atualizando...</small></header>
                <div class="notification-list-mini" id="notification-list-mini"></div>
                <a class="btn btn-secondary notification-all" href="/admin/notificacoes">Ver todas as notificações</a>
              </div>
            </div>
            <div class="profile-wrap">
              <button class="profile-btn" id="profile-btn" type="button" title="Abrir perfil"><span>🐶</span><strong>${displayName}</strong><small>${displayRole}</small></button>
              ${userMenu()}
            </div>
          </div>
        </header>
        <div class="content-frame">
          ${content}
        </div>
      </main>
    </div>
  `;
  if (preservedLoadingModal) document.body.appendChild(preservedLoadingModal);

  const shell = document.getElementById('app-shell');
  const sidebar = document.getElementById('app-sidebar');
  const brandToggle = document.getElementById('sidebar-brand-toggle');
  const mobileOpen = document.getElementById('mobile-menu-open');
  const mobileClose = document.getElementById('mobile-menu-close');
  const backdrop = document.getElementById('mobile-backdrop');
  const profileButton = document.getElementById('profile-btn');
  const profileMenu = document.getElementById('profile-menu');
  const profileLogout = document.getElementById('profile-logout');
  const notificationButton = document.getElementById('notification-btn');
  const notificationMenu = document.getElementById('notification-menu');
  const notificationBadge = document.getElementById('notification-badge');
  const notificationMini = document.getElementById('notification-list-mini');
  const notificationSubtitle = document.getElementById('notification-subtitle');

  const persisted = localStorage.getItem(storageKey) === '1';
  if (persisted) shell.classList.add('sidebar-collapsed');

  brandToggle.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 860px)').matches) return;
    shell.classList.toggle('sidebar-collapsed');
    localStorage.setItem(storageKey, shell.classList.contains('sidebar-collapsed') ? '1' : '0');
  });

  const openMobileMenu = () => {
    sidebar.classList.add('mobile-open');
    backdrop.hidden = false;
    document.body.classList.add('menu-open');
  };
  const closeMobileMenu = () => {
    sidebar.classList.remove('mobile-open');
    backdrop.hidden = true;
    document.body.classList.remove('menu-open');
  };

  mobileOpen.addEventListener('click', openMobileMenu);
  mobileClose.addEventListener('click', closeMobileMenu);
  backdrop.addEventListener('click', closeMobileMenu);
  sidebar.querySelectorAll('.nav a').forEach((link) => link.addEventListener('click', (event) => {
    closeMobileMenu();
    const href = link.getAttribute('href');
    if (!href || href === window.location.pathname || href.startsWith('#')) return;
    event.preventDefault();
    showLoading('Abrindo página...', 'Carregando informações e preparando a tela do PetFunny.');
    window.setTimeout(() => { window.location.href = href; }, 90);
  }));

  profileButton.addEventListener('click', (event) => {
    event.stopPropagation();
    profileMenu.hidden = !profileMenu.hidden;
  });
  document.addEventListener('click', () => { profileMenu.hidden = true; if (notificationMenu) notificationMenu.hidden = true; });
  profileMenu.addEventListener('click', (event) => event.stopPropagation());

  async function refreshNotifications() {
    try {
      const data = await api.get('/notificacoes/summary');
      const unread = Number(data.unread || 0);
      notificationBadge.hidden = unread <= 0;
      notificationBadge.textContent = unread > 99 ? '99+' : String(unread);
      notificationSubtitle.textContent = unread ? `${unread} não lida(s)` : 'Tudo em dia';
      notificationMini.innerHTML = (data.latest || []).length ? (data.latest || []).map((n) => `
        <a class="notification-mini-item ${n.read ? '' : 'unread'}" href="${n.actionUrl || '/admin/notificacoes'}" data-id="${n.id}">
          <span>${n.priority === 'high' ? '🚨' : n.type === 'opportunity' ? '💡' : '🔔'}</span>
          <strong>${n.title}</strong>
          <small>${n.message}</small>
        </a>
      `).join('') : '<p class="notification-empty">Nenhuma notificação no momento.</p>';
    } catch (error) {
      notificationSubtitle.textContent = 'Não foi possível carregar';
      notificationMini.innerHTML = '<p class="notification-empty">Falha ao buscar notificações.</p>';
    }
  }

  notificationButton?.addEventListener('click', async (event) => {
    event.stopPropagation();
    notificationMenu.hidden = !notificationMenu.hidden;
    if (!notificationMenu.hidden) await refreshNotifications();
  });
  notificationMenu?.addEventListener('click', (event) => event.stopPropagation());
  refreshNotifications();
  window.setInterval(refreshNotifications, 60000);

  profileLogout?.addEventListener('click', logout);
  setupPremiumInteractions(document);
  setupAdminContextChat({ active, title });
  startPageLoading('Abrindo página...', 'Carregando informações e preparando a tela do PetFunny.');
}

export function modulePlaceholder({ active, icon, title, version, description }) {
  return `
    <section class="hero-panel">
      <div class="page-heading-row">
        <div class="module-icon">${icon}</div>
        <div><p class="eyebrow">${version}</p><h1>${title}</h1><p>${description}</p></div>
      </div>
      ${bigNumberGrid([
        ['Admin fechado', 'JWT', 'Equipe PetFunny'],
        ['Loja pública', 'ON', 'Landing page preparada'],
        ['App cliente', 'WhatsApp', 'Primeiro acesso + senha']
      ])}
      ${cardsGrid([
        ['Arquitetura limpa', 'Este módulo será implementado sem tenant_id, sem rotas SaaS e sem dependência de APIs externas para carregar.'],
        ['Próxima etapa', 'As telas e endpoints entram na versão própria, preservando esta base visual responsiva e o menu mobile.']
      ])}
      <div class="actions"><a class="btn btn-secondary" href="/admin/dashboard">← Voltar ao dashboard</a></div>
    </section>
  `;
}

export function bigNumberGrid(items) {
  return `<div class="big-number-grid">${items.map(([label, value, hint]) => `<article class="big-number-card"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join('')}</div>`;
}

export function cardsGrid(items) {
  return `<div class="module-grid">${items.map(([title, text]) => `<article class="module-card"><button class="kebab" type="button">⋯</button><h3>${title}</h3><p>${text}</p></article>`).join('')}</div>`;
}


export function applyInputMasks(scope = document) {
  const digits = (value) => String(value || '').replace(/\D/g, '');
  const onlyLetters = (value) => String(value || '').replace(/[^A-Za-zÀ-ÿ\s]/g, '').replace(/\s{2,}/g, ' ');
  const masks = {
    whatsapp(value) {
      const d = digits(value).slice(0, 11);
      if (d.length <= 2) return d;
      if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    },
    phone(value) { return masks.whatsapp(value); },
    cep(value) {
      const d = digits(value).slice(0, 8);
      return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    },
    cpf(value) {
      const d = digits(value).slice(0, 11);
      if (d.length <= 3) return d;
      if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
      if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
      return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    },
    money(value) {
      const d = digits(value);
      const cents = Number(d || '0') / 100;
      return cents.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    percent(value) {
      const d = digits(value).slice(0, 3);
      return d ? `${Math.min(Number(d), 100)}%` : '';
    },
    time(value) {
      const d = digits(value).slice(0, 4);
      if (d.length <= 2) return d;
      return `${d.slice(0, 2)}:${d.slice(2)}`;
    },
    code(value) { return digits(value).slice(0, 6); },
    uf(value) { return String(value || '').replace(/[^a-zA-Z]/g, '').slice(0,2).toUpperCase(); },
    name(value) { return onlyLetters(value).slice(0, 90); }
  };
  const inferMask = (input) => {
    const key = `${input.dataset.mask || ''} ${input.name || ''} ${input.id || ''} ${input.placeholder || ''} ${input.type || ''}`.toLowerCase();
    if (input.dataset.mask) return input.dataset.mask;
    if (key.includes('whatsapp') || key.includes('telefone') || key.includes('phone') || input.type === 'tel') return 'whatsapp';
    if (key.includes('cep')) return 'cep';
    if (key.includes('cpf')) return 'cpf';
    if (key.includes('code') || key.includes('codigo') || key.includes('código')) return 'code';
    if (key.includes('state') || key.includes('uf') || key.includes('estado')) return 'uf';
    if (key.includes('discount') || key.includes('percent') || key.includes('desconto')) return 'percent';
    if (key.includes('time') || key.includes('horario') || key.includes('horário')) return 'time';
    if (key.includes('price') || key.includes('valor') || key.includes('money')) return 'money';
    if (key.includes('name') || key.includes('nome')) return 'name';
    return '';
  };
  scope.querySelectorAll('input, textarea').forEach((input) => {
    if (input.type === 'password' || input.type === 'email' || input.type === 'date' || input.readOnly) return;
    const mask = inferMask(input);
    if (!mask || !masks[mask]) return;
    input.dataset.mask = mask;
    input.setAttribute('autocomplete', mask === 'whatsapp' ? 'tel' : (input.getAttribute('autocomplete') || 'off'));
    if (['whatsapp', 'phone', 'cep', 'cpf', 'percent', 'time', 'code', 'money'].includes(mask)) input.setAttribute('inputmode', 'numeric');
    if (mask === 'code') input.setAttribute('maxlength', '6');
    if (mask === 'uf') input.setAttribute('maxlength', '2');
    if (input.dataset.maskBound === '1') return;
    input.dataset.maskBound = '1';
    const run = () => {
      input.value = masks[mask](input.value);
      input.classList.toggle('valid', Boolean(input.value));
    };
    input.addEventListener('input', run);
    input.addEventListener('blur', run);
    run();
  });
}

export function setupPremiumInteractions(scope = document) {
  applyInputMasks(scope);
  scope.querySelectorAll('[data-calendar-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const calendar = button.closest('.calendar-pro');
      if (!calendar) return;
      calendar.dataset.view = button.dataset.calendarView;
      calendar.querySelectorAll('[data-calendar-view]').forEach((btn) => btn.classList.toggle('active', btn === button));
    });
  });
  scope.querySelectorAll('.kebab').forEach((button) => {
    let menu = button.parentElement?.querySelector('.card-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'card-menu';
      menu.innerHTML = '<button>Editar</button><button>Duplicar</button><button>Ver detalhes</button><button>Arquivar</button>';
      button.parentElement?.appendChild(menu);
    }
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      document.querySelectorAll('.card-menu.open').forEach((item) => { if (item !== menu) item.classList.remove('open'); });
      menu.classList.toggle('open');
    });
  });
  document.addEventListener('click', () => document.querySelectorAll('.card-menu.open').forEach((item) => item.classList.remove('open')));
}

export function premiumCalendarDemo() {
  const monthDays = Array.from({ length: 35 }, (_, i) => {
    const day = i - 2;
    const muted = day < 1 || day > 31;
    const num = day < 1 ? 29 + i : day > 31 ? day - 31 : day;
    const event = [2, 4, 6, 9, 14, 18, 22, 27].includes(num) && !muted;
    return `<div class="calendar-day ${muted ? 'muted' : ''} ${num === 14 && !muted ? 'today' : ''}"><div class="calendar-date"><span>${num}</span>${event ? '<span class="calendar-count">3</span>' : ''}</div>${event ? '<button class="cal-event" draggable="true"><strong>09:00 · Banho + Tosa</strong><small>Amora · Mariana</small></button><button class="cal-event" draggable="true"><strong>14:30 · Pacote 2/4</strong><small>Thor · João</small></button>' : ''}</div>`;
  }).join('');
  const hours = ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00'];
  const week = hours.map((hour, idx) => `<div class="time-cell">${hour}</div>${Array.from({ length: 7 }, (_, d) => `<div class="slot-cell">${(idx+d)%5===0 ? '<button class="cal-event" draggable="true"><strong>'+hour+' · Luna</strong><small>Banho completo</small></button>' : ''}</div>`).join('')}`).join('');
  const day = hours.map((hour, idx) => `<div class="time-cell">${hour}</div><div class="slot-cell">${idx % 2 === 0 ? '<button class="cal-event" draggable="true"><strong>'+hour+' · Atendimento</strong><small>Card arrastável com menu contextual</small></button>' : ''}</div>`).join('');
  return `
    <div class="calendar-pro" data-view="month">
      <div class="calendar-pro-header">
        <div class="calendar-nav"><button>‹</button><strong class="calendar-title">Maio 2026</strong><button>›</button><button>Hoje</button></div>
        <div class="calendar-views"><button data-calendar-view="day">Dia</button><button data-calendar-view="week">Semana</button><button class="active" data-calendar-view="month">Mês</button></div>
      </div>
      <div class="calendar-scroll custom-scroll">
        <div class="calendar-pro-grid">
          <div class="calendar-weekdays month-only"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
          <div class="calendar-month-grid">${monthDays}</div>
        </div>
        <div class="calendar-week-view">${week}</div>
        <div class="calendar-day-view">${day}</div>
      </div>
    </div>`;
}

