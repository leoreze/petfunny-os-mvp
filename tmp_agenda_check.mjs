
  document.body.classList.add('agenda-page');
  import { api } from '/assets/js/api.js';
  import { buildShell, bigNumberGrid, setupPremiumInteractions } from '/assets/js/shell.js';
  import { showLoading, hideLoading, finishPageLoading, showSuccessModal, showResultModal } from '/assets/js/loading.js';
  import { toast } from '/assets/js/toast.js';
  import { bindHybridWhatsAppButtons } from '/assets/js/whatsapp.js';

  const state = {
    date: new Date().toISOString().slice(0,10),
    view: 'day',
    status: 'all',
    collaboratorId: 'all',
    items: [],
    tutors: [],
    pets: [],
    services: [],
    serviceTypes: [],
    petTypes: [],
    petSizes: [],
    statuses: [],
    collaborators: [],
    slots: [],
    editing: null
  };

  const esc = (value = '') => String(value ?? '').replace(/[&<>"]/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const money = (cents = 0) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const dt = (value) => value ? new Date(value) : new Date();
  const hm = (value) => dt(value).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  const brDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  const serviceById = (id) => state.services.find(s => s.id === id);
  const petById = (id) => state.pets.find(p => p.id === id);
  const statusByCode = (code) => state.statuses.find(s => s.code === code) || { name: code, color:'#00A9B7' };
  const statusColor = (code) => statusByCode(code).color || '#00A9B7';
  const statusName = (code) => statusByCode(code).name || code;
  const paymentStatusName = (code) => (state.paymentStatuses || []).find(p => p.code === code)?.name || (code === 'paid' ? 'Pago' : 'Pendente');
  const isPaymentPaid = (appointment = {}) => String(appointment.paymentStatus || '').toLowerCase() === 'paid' || String(paymentStatusName(appointment.paymentStatus)).toLowerCase() === 'pago';
  const initials = (name = 'P') => String(name || 'P').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'P';
  const petPhoto = (appointment = {}) => appointment.petPhotoUrl || petById(appointment.petId)?.photoUrl || '';
  const petAvatar = (appointment = {}, size = 'sm') => {
    const photo = petPhoto(appointment);
    const label = esc(appointment.petName || 'Pet');
    return photo
      ? `<span class="pet-mini-avatar ${size}"><img src="${esc(photo)}" alt="${label}"></span>`
      : `<span class="pet-mini-avatar ${size}">${esc(initials(appointment.petName || 'Pet'))}</span>`;
  };

  buildShell({
    active: 'Agenda',
    eyebrow: 'Agenda do PetFunny',
    title: 'Agenda de atendimentos',
    subtitle: 'Acompanhe os horários do banho e tosa, organize encaixes com segurança e mantenha a equipe alinhada em cada etapa do atendimento.',
    content: `
      <section class="hero-panel stack-md agenda-hero-compact">
        <div class="page-heading-row between">
          <div>
            <p class="eyebrow">Rotina organizada</p>
            <h1>Agenda PetFunny</h1>
            <p>Visualize os horários disponíveis, confirme atendimentos, ajuste encaixes e acompanhe a operação do dia sem perder o controle da capacidade por horário.</p>
          </div>
        </div>
        <div id="agenda-metrics">${bigNumberGrid([['Agendamentos','--','no período'],['Faturamento','--','previsto'],['Slots','--','configurados']])}</div>
      </section>

      <section class="module-card stack-sm agenda-filter-card">
        <div class="section-toolbar compact-toolbar">
          <div><h3>Filtros rápidos</h3><p>Encontre atendimentos por data, status, colaborador, tutor, pet ou serviço.</p></div>
        </div>
        <div class="form-grid form-row-gap agenda-filter-grid">
          <label class="form-field"><span>Data base</span><input class="input" type="date" id="agenda-date"></label>
          <label class="form-field"><span>Status</span><select class="select" id="status-filter"><option value="all">Todos</option></select></label>
          <label class="form-field"><span>Colaborador</span><select class="select" id="collab-filter"><option value="all">Todos</option></select></label>
          <label class="form-field"><span>Busca rápida</span><input class="input" id="quick-search" placeholder="Tutor, pet ou serviço"></label>
        </div>
      </section>

      <section class="agenda-floating-actions">
        <div class="actions">
          <button class="btn" id="new-appointment-btn" type="button">＋ Novo agendamento</button>
          <button class="btn btn-secondary" id="today-btn" type="button">Hoje</button>
        </div>
        <div class="actions calendar-views agenda-view-tabs" id="view-buttons">
          <button type="button" data-view="day" class="active">Dia</button>
          <button type="button" data-view="week">Semana</button>
          <button type="button" data-view="month">Mês</button>
        </div>
      </section>

      <section class="calendar-pro stack-md" id="agenda-calendar" data-view="day">
        <div class="calendar-pro-header">
          <div class="calendar-nav"><button type="button" id="prev-btn">←</button><strong class="calendar-title" id="calendar-title">Agenda</strong><button type="button" id="next-btn">→</button></div>
          <div class="actions"><span class="badge">🧲 Arraste no calendário</span><span class="badge">⏱ Slots de 1h</span></div>
        </div>
        <div class="calendar-scroll custom-scroll">
          <div class="calendar-weekdays month-only"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>
          <div class="calendar-month-grid" id="month-grid"></div>
          <div class="calendar-week-view" id="week-grid"></div>
          <div class="calendar-day-view" id="day-grid"></div>
        </div>
      </section>

      <section class="module-card stack-md">
        <div class="section-toolbar"><div><h3>Visão por status</h3><p>Arraste um card para outra coluna para alterar o status do agendamento.</p></div><span class="badge">Drag & drop por status</span></div>
        <div class="status-board custom-scroll" id="agenda-status-board"></div>
      </section>

      <section class="module-card stack-md">
        <div class="section-toolbar"><div><h3>Lista de agendamentos</h3><p>Cards compactos com menu de três pontinhos e ações rápidas.</p></div><span class="badge" id="list-count">0 registros</span></div>
        <div class="kanban-grid agenda-list-grid" id="agenda-list"></div>
      </section>

      <dialog class="modal-shell agenda-document-modal agenda-appointment-modal" id="agenda-document-modal">
        <div class="modal-card document-modal-card agenda-document-modal-card agenda-appointment-modal-card">
          <header class="modal-header agenda-modal-header">
            <div class="modal-title-block">
              <p class="eyebrow" id="agenda-document-type">Documento do atendimento</p>
              <h2 id="agenda-document-title">Comanda</h2>
              <p class="modal-subtitle" id="agenda-document-subtitle">Carregando as informações do atendimento com segurança, no mesmo padrão dos agendamentos.</p>
            </div>
            <button class="icon-btn modal-close-btn" type="button" id="close-document-modal" aria-label="Fechar documento">✕</button>
          </header>
          <div class="modal-body custom-scroll">
            <div id="agenda-document-preview" class="document-preview"><div class="document-loading-state"><img src="/assets/img/loading-dog.gif" alt="Carregando"><strong>Preparando documento...</strong><small>Aguarde enquanto carregamos os dados do atendimento.</small></div></div>
          </div>
          <footer class="modal-footer">
            <button class="btn btn-secondary" id="print-agenda-document" type="button">Imprimir</button>
            <button class="btn btn-secondary" id="copy-agenda-document-link" type="button">Copiar link</button>
            <a class="btn" id="whatsapp-agenda-document" target="_blank" rel="noopener">Enviar WhatsApp</a>
          </footer>
        </div>
      </dialog>

      <dialog class="modal-shell agenda-appointment-modal" id="appointment-modal">
        <form method="dialog" class="modal-card agenda-appointment-modal-card" id="appointment-form">
          <header class="modal-header agenda-modal-header">
            <div class="modal-title-block">
              <p class="eyebrow">Agenda PetFunny</p>
              <h2 id="modal-title">Novo agendamento</h2>
              <p class="modal-subtitle">Busque o tutor pelo WhatsApp, selecione o pet e escolha os serviços compatíveis com o tipo e porte cadastrados.</p>
            </div>
            <button class="icon-btn modal-close-btn" type="button" id="close-modal" aria-label="Fechar modal">✕</button>
          </header>
          <div class="modal-body custom-scroll">
            <input type="hidden" id="appointment-id">
            <div class="module-card stack-sm soft-card appointment-lookup-card">
              <label class="form-field"><span>WhatsApp do cliente</span><input class="input" id="client-whatsapp-search" inputmode="tel" autocomplete="tel" placeholder="Digite o WhatsApp para buscar automaticamente"></label>
              <p class="muted-text">Digite o WhatsApp principal do tutor. Se ele já existir, os pets serão carregados automaticamente.</p>
            </div>
            <div class="form-grid form-row-gap">
              <label class="form-field"><span>Tutor</span><select class="select" id="tutor-id" required><option value="">Selecione</option></select></label>
              <label class="form-field"><span>Pet</span><select class="select" id="pet-id" required><option value="">Selecione o tutor</option></select></label>
              <label class="form-field"><span>Data</span><input class="input" type="date" id="form-date" required></label>
              <label class="form-field"><span>Hora</span><select class="select" id="form-time" required></select></label>
              <label class="form-field"><span>Status</span><select class="select" id="form-status" required></select></label>
              <label class="form-field"><span>Colaborador</span><select class="select" id="form-collab"><option value="">Equipe PetFunny</option></select></label>
            </div>
            <div class="module-card stack-sm soft-card appointment-services-card" id="appointment-service-card" hidden>
              <h3>Serviços do agendamento</h3>
              <p>Os serviços são agrupados por tipo de serviço e filtrados pelo tipo de pet e porte cadastrados.</p>
              <div class="service-check-grid" id="service-checks"></div>
            </div>
            <div class="form-grid form-row-gap">
              <label class="form-field"><span>Desconto promocional global (%)</span><input class="input" type="number" min="0" max="100" step="0.01" id="discount-percent" value="0"></label>
              <label class="form-field"><span>Total previsto</span><input class="input" id="total-preview" readonly value="R$ 0,00"></label>
            </div>
            <label class="form-field appointment-notes-field"><span>Observações</span><textarea class="textarea" id="notes" rows="4" placeholder="Preferências, restrições, combinados com o tutor..."></textarea></label>
            <div class="form-grid form-row-gap payment-tail-grid">
              <label class="form-field"><span>Status de pagamento</span><select class="select" id="form-payment-status"></select></label>
              <label class="form-field"><span>Forma de pagamento</span><select class="select" id="form-payment-method"><option value="">A definir</option></select></label>
            </div>
          </div>
          <footer class="modal-footer"><button class="btn btn-secondary" type="button" id="cancel-modal">Cancelar</button><button class="btn" type="submit">Salvar agendamento</button></footer>
        </form>
      </dialog>
    `
  });

  showLoading('Carregando agenda do PetFunny...', 'Buscando horários, slots e atendimentos cadastrados.');

  const nodes = {
    date: document.getElementById('agenda-date'),
    status: document.getElementById('status-filter'),
    collab: document.getElementById('collab-filter'),
    search: document.getElementById('quick-search'),
    metrics: document.getElementById('agenda-metrics'),
    calendar: document.getElementById('agenda-calendar'),
    month: document.getElementById('month-grid'),
    week: document.getElementById('week-grid'),
    day: document.getElementById('day-grid'),
    title: document.getElementById('calendar-title'),
    list: document.getElementById('agenda-list'),
    statusBoard: document.getElementById('agenda-status-board'),
    count: document.getElementById('list-count'),
    modal: document.getElementById('appointment-modal'),
    form: document.getElementById('appointment-form')
  };

  const fields = {
    id: document.getElementById('appointment-id'),
    whatsapp: document.getElementById('client-whatsapp-search'),
    tutorId: document.getElementById('tutor-id'),
    petId: document.getElementById('pet-id'),
    date: document.getElementById('form-date'),
    time: document.getElementById('form-time'),
    status: document.getElementById('form-status'),
    collab: document.getElementById('form-collab'),
    paymentStatus: document.getElementById('form-payment-status'),
    paymentMethod: document.getElementById('form-payment-method'),
    services: document.getElementById('service-checks'),
    discount: document.getElementById('discount-percent'),
    total: document.getElementById('total-preview'),
    notes: document.getElementById('notes')
  };
  const appointmentServiceCard = document.getElementById('appointment-service-card');

  function dateAdd(date, days) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0,10); }
  function firstDayOfMonth(date) { const d = new Date(`${date}T12:00:00`); return new Date(d.getFullYear(), d.getMonth(), 1); }
  function filteredItems() {
    const q = nodes.search.value.trim().toLowerCase();
    if (!q) return state.items;
    return state.items.filter(a => [a.tutorName, a.petName, a.services, a.statusName].join(' ').toLowerCase().includes(q));
  }

  function slotTimesForDate(date) {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    return state.slots.filter(s => Number(s.weekday) === weekday && Number(s.capacity) > 0).map(s => s.slotTime);
  }

  function slotCapacity(date, time) {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const slot = state.slots.find(s => Number(s.weekday) === weekday && String(s.slotTime).slice(0,5) === String(time).slice(0,5));
    return Number(slot?.capacity || 0);
  }

  function slotUsed(date, time) {
    return state.items.filter(a => String(a.startsAt).slice(0,10) === date && hm(a.startsAt) === String(time).slice(0,5)).length;
  }

  function daySlotStats(date) {
    const times = slotTimesForDate(date);
    const capacity = times.reduce((sum, t) => sum + slotCapacity(date, t), 0);
    const used = state.items.filter(a => String(a.startsAt).slice(0,10) === date).length;
    return { used, capacity, available: Math.max(0, capacity - used), times };
  }

  function slotTag(date, time = '') {
    if (time) {
      const used = slotUsed(date, time);
      const capacity = slotCapacity(date, time);
      const available = Math.max(0, capacity - used);
      return `<span class="slot-mini-tag ${available > 0 ? 'available' : 'full'}">${used}/${capacity || 0} slots</span>`;
    }
    const stats = daySlotStats(date);
    return `<span class="slot-mini-tag ${stats.available > 0 ? 'available' : 'full'}">${stats.used}/${stats.capacity || 0} slots</span>`;
  }

  function quickScheduleButton(date, time = '') {
    const available = time ? Math.max(0, slotCapacity(date, time) - slotUsed(date, time)) : daySlotStats(date).available;
    if (available <= 0) return '';
    return `<button class="quick-schedule-btn" type="button" data-new-date="${esc(date)}" data-new-time="${esc(time)}" title="Novo agendamento neste horário">＋</button>`;
  }

  function populateSelects() {
    nodes.status.innerHTML = '<option value="all">Todos</option>' + state.statuses.map(s => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
    fields.status.innerHTML = state.statuses.map(s => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
    nodes.collab.innerHTML = '<option value="all">Todos</option>' + state.collaborators.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    fields.collab.innerHTML = '<option value="">Equipe PetFunny</option>' + state.collaborators.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    fields.tutorId.innerHTML = '<option value="">Selecione</option>' + state.tutors.map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.whatsapp || '')}</option>`).join('');
    fields.paymentStatus.innerHTML = (state.paymentStatuses || []).map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('') || '<option value="pending">Pendente</option><option value="paid">Pago</option>';
    fields.paymentMethod.innerHTML = '<option value="">A definir</option>' + (state.paymentMethods || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    renderTimes();
  }

  function renderTimes() {
    const times = slotTimesForDate(fields.date.value || state.date);
    fields.time.innerHTML = times.length ? times.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('') : '<option value="">Sem slots neste dia</option>';
  }

  function notesFromContext(tutor, pet) {
    const parts = [];
    const tutorNote = tutor?.notes || tutor?.observations || tutor?.preferences || '';
    const petNote = pet?.notes || pet?.observations || pet?.restrictions || pet?.behavior_notes || '';
    if (tutorNote) parts.push(`Tutor: ${tutorNote}`);
    if (petNote) parts.push(`Pet: ${petNote}`);
    return parts.join('\n');
  }

  function completeFieldsFromSelection({ forceNotes = false } = {}) {
    const tutor = state.tutors.find(t => t.id === fields.tutorId.value);
    const pet = petById(fields.petId.value);
    if (tutor?.whatsapp && fields.whatsapp) fields.whatsapp.value = tutor.whatsapp;
    const contextNotes = notesFromContext(tutor, pet);
    if (!state.editing && contextNotes && (forceNotes || !fields.notes.value.trim())) {
      fields.notes.value = contextNotes;
    }
  }

  function renderPetsForTutor({ autoSelectSingle = false } = {}) {
    const tutorId = fields.tutorId.value;
    const pets = state.pets.filter(p => p.tutorId === tutorId);
    fields.petId.innerHTML = '<option value="">Selecione</option>' + pets.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.size || '')}</option>`).join('');
    if (autoSelectSingle && pets.length === 1) fields.petId.value = pets[0].id;
    completeFieldsFromSelection();
    renderServiceChecks();
  }

  function renderServiceChecks() {
    const pet = petById(fields.petId.value);
    if (!pet) {
      if (appointmentServiceCard) appointmentServiceCard.hidden = true;
      fields.services.innerHTML = '<p>Selecione um pet para carregar os serviços compatíveis.</p>';
      updateTotal();
      return;
    }
    if (appointmentServiceCard) appointmentServiceCard.hidden = false;
    const petSize = pet?.size || 'todos';
    const petType = pet?.species || '';
    const selected = new Set(Array.from(fields.services.querySelectorAll('input:checked')).map(i => i.value));
    const services = state.services.filter(s => {
      const serviceSizeOk = s.petSize === 'todos' || s.petSize === petSize;
      const categorySizeOk = !s.categoryPetSizeCode || s.categoryPetSizeCode === petSize || s.categoryPetSizeCode === 'todos';
      const categoryTypeOk = !s.categoryPetTypeCode || s.categoryPetTypeCode === petType;
      return serviceSizeOk && categorySizeOk && categoryTypeOk;
    });
    const byCategory = new Map();
    services.forEach(service => {
      const key = service.categoryId || 'outros';
      if (!byCategory.has(key)) byCategory.set(key, { name: service.categoryName || 'Outros serviços', items: [] });
      byCategory.get(key).items.push(service);
    });
    fields.services.innerHTML = services.length ? Array.from(byCategory.values()).map(group => `
      <div class="service-type-group">
        <div class="service-type-group-head">
          <span class="service-type-icon" aria-hidden="true">✂️</span>
          <div class="service-type-title"><strong>${esc(group.name)}</strong><small>${group.items.length} serviço(s) compatíveis com este pet</small></div>
        </div>
        <div class="service-check-grid-inner">
          ${group.items.map(s => `
            <label class="service-check-card">
              <input type="checkbox" value="${esc(s.id)}" ${selected.has(s.id) ? 'checked' : ''}>
              <span><strong>${esc(s.name)}</strong><small>${esc(s.petSizeName || s.petSize)} · ${s.durationMinutes}min</small></span>
              <b>${money(s.priceCents)}</b>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('') : '<p>Nenhum serviço ativo para o tipo e porte deste pet. Confira Tipos de Serviços, Portes e Serviços em Configurações.</p>';
    updateTotal();
  }

  async function lookupClientByWhatsapp() {
    const whatsapp = fields.whatsapp.value.replace(/\D/g, '');
    if (whatsapp.length < 10) return;
    try {
      showLoading('Buscando cliente...', 'Consultando cadastro pelo WhatsApp.');
      const data = await api.get(`/agenda/client-lookup?whatsapp=${encodeURIComponent(whatsapp)}`);
      if (!data.found) {
        toast('Cliente não encontrado. Cadastre o tutor antes de continuar.', 'warning');
        fields.tutorId.value = '';
        fields.petId.innerHTML = '<option value="">Cliente não encontrado</option>';
        renderServiceChecks();
        return;
      }
      if (!state.tutors.some(t => t.id === data.tutor.id)) state.tutors.push(data.tutor);
      data.pets.forEach(pet => { if (!state.pets.some(p => p.id === pet.id)) state.pets.push(pet); });
      populateSelects();
      fields.whatsapp.value = data.tutor.whatsapp || fields.whatsapp.value;
      fields.tutorId.value = data.tutor.id;
      renderPetsForTutor({ autoSelectSingle: data.pets.length === 1 });
      completeFieldsFromSelection({ forceNotes: data.pets.length === 1 });
      toast('Cliente localizado. Pets carregados automaticamente.', 'success');
    } catch (error) { toast(error.message, 'error'); }
    finally { hideLoading(); }
  }

  function updateTotal() {
    const ids = Array.from(fields.services.querySelectorAll('input:checked')).map(i => i.value);
    const subtotal = ids.reduce((sum, id) => sum + Number(serviceById(id)?.priceCents || 0), 0);
    const disc = Math.max(0, Math.min(100, Number(fields.discount.value || 0)));
    fields.total.value = money(Math.max(0, subtotal - Math.round(subtotal * disc / 100)));
  }

  function getGlobalActionMenu() {
    let menu = document.getElementById('agenda-global-action-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'agenda-global-action-menu';
      menu.className = 'agenda-global-action-menu';
      menu.hidden = true;
      document.body.appendChild(menu);
    }
    return menu;
  }

  function closeFloatingMenus() {
    document.querySelectorAll('.kebab-btn[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
    const menu = getGlobalActionMenu();
    menu.hidden = true;
    menu.classList.remove('is-open');
    menu.innerHTML = '';
    menu.removeAttribute('data-id');
  }

  function openFloatingMenu(button) {
    const id = button.dataset.id || button.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const appointment = state.items.find(item => item.id === id) || {};
    const menu = getGlobalActionMenu();
    const alreadyOpen = !menu.hidden && menu.dataset.id === id;
    closeFloatingMenus();
    if (alreadyOpen) return;

    const receiptButton = isPaymentPaid(appointment) ? `<button class="view-receipt-modal" data-id="${esc(id)}" type="button">🧾 Recibo</button>` : '';
    menu.dataset.id = id;
    menu.innerHTML = `
      <button class="edit-appointment" data-id="${esc(id)}" type="button">✏️ Editar</button>
      <button class="status-action" data-id="${esc(id)}" data-status="cancelado" type="button">🚫 Cancelar</button>
      <button class="view-command-modal" data-id="${esc(id)}" type="button">📋 Comanda</button>
      ${receiptButton}
      <button data-whatsapp-action="confirmacao_agendamento" data-appointment-id="${esc(id)}" type="button">💬 WhatsApp confirmação</button>
    `;

    const rect = button.getBoundingClientRect();
    const gutter = 12;
    menu.hidden = false;
    menu.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');

    const width = Math.max(menu.offsetWidth || 224, 224);
    const height = Math.max(menu.offsetHeight || 220, 180);
    const left = Math.min(window.innerWidth - width - gutter, Math.max(gutter, rect.right - width));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - gutter) top = Math.max(gutter, rect.top - height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function appointmentActionsMenu(a) {
    return `<div class="card-kebab-wrap">
      <button class="kebab-btn kebab" type="button" data-id="${esc(a.id)}" aria-label="Abrir ações do agendamento" aria-expanded="false">⋯</button>
    </div>`;
  }

  function appointmentCard(a) {
    const st = statusByCode(a.status);
    const color = st.color || '#00A9B7';
    return `<article class="appointment-card module-card status-tinted-card agenda-compact-card" draggable="true" data-id="${esc(a.id)}" data-status="${esc(a.status)}" style="--status-color:${esc(color)}">
      ${appointmentActionsMenu(a)}
      <div class="appointment-status-line"><span class="status-pill" style="--status-color:${esc(color)}">${esc(st.name || a.status)}</span></div>
      <div class="appointment-card-head">
        ${petAvatar(a, 'md')}
        <div><h3>${hm(a.startsAt)} · ${esc(a.petName || 'Pet')}</h3><small>${esc(a.tutorName || 'Tutor')}</small></div>
      </div>
      <p><strong>${esc(a.services || 'Serviço não informado')}</strong></p>
      <div class="appointment-meta-row"><small>${esc(a.collaboratorName || 'Equipe PetFunny')}<span class="payment-info-line">${esc(paymentStatusName(a.paymentStatus))}${a.paymentMethodName ? ` · ${esc(a.paymentMethodName)}` : ''}</span></small><b>${money(a.totalCents)}</b></div>
    </article>`;
  }

  function agendaDocumentHtml(data, mode = 'command') {
    const appointment = data.appointment || data.document?.appointment || data.receipt?.payload?.appointment || {};
    const business = data.business || data.document?.business || data.receipt?.payload?.business || {};
    const totals = data.totals || data.document?.totals || data.receipt?.payload?.totals || {};
    const items = appointment.items || [];
    const isReceipt = mode === 'receipt';
    const discountPercent = Number(totals.discountPercent ?? appointment.discountPercent ?? 0);
    return `<article class="print-document agenda-inline-document">
      <div class="doc-brand"><img src="/assets/img/logo-petfunny-full.png" alt="PetFunny"><div><strong>${esc(business.name || 'PetFunny - Banho e Tosa')}</strong><small>${esc(business.address || 'Ribeirão Preto / SP')} · WhatsApp ${esc(business.whatsapp || '')}</small></div></div>
      <div class="doc-head"><div><p class="eyebrow">${isReceipt ? 'Recibo oficial' : 'Comanda de atendimento'}</p><h2>${isReceipt ? 'Recibo' : 'Comanda'}</h2><p>${isReceipt ? 'Pagamento recebido e atendimento documentado.' : 'Conferência dos serviços antes do pagamento.'}</p></div><div class="doc-number"><span>Nº</span><strong>${esc(data.receipt?.documentNumber || data.documentNumber || appointment.id?.slice(0,8) || '—')}</strong></div></div>
      <div class="doc-grid"><div><span>Tutor</span><strong>${esc(appointment.tutorName || '—')}</strong><small>${esc(appointment.tutorWhatsapp || '')}</small></div><div><span>Pet</span><strong>${esc(appointment.petName || '—')}</strong><small>${esc(appointment.petSize || '')}</small></div><div><span>Data</span><strong>${esc(appointment.startsAt ? dt(appointment.startsAt).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—')}</strong></div><div><span>Status</span><strong>${esc(appointment.statusName || appointment.status || '—')}</strong></div></div>
      <table class="doc-table"><thead><tr><th>Serviço</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${items.map(item=>`<tr><td>${esc(item.description || item.name || 'Serviço')}</td><td>${esc(item.quantity || 1)}</td><td>${money(item.unitPriceCents)}</td><td>${money(item.totalCents)}</td></tr>`).join('') || `<tr><td colspan="4">${esc(appointment.services || 'Sem itens detalhados.')}</td></tr>`}</tbody></table>
      <div class="doc-totals"><div><span>Total original</span><strong>${money(totals.subtotalCents ?? appointment.subtotalCents)}</strong></div><div><span>Desconto</span><strong>${money(totals.discountCents ?? appointment.discountCents)} · ${discountPercent}%</strong></div><div class="doc-total-final"><span>Total final</span><strong>${money(totals.totalCents ?? appointment.totalCents)}</strong></div></div>
      <footer class="doc-footer">${isReceipt ? 'Obrigado pela confiança no PetFunny. Recibo gerado eletronicamente.' : 'Esta comanda é uma conferência interna do atendimento. O recibo é liberado após a baixa do pagamento.'}</footer>
    </article>`;
  }

  async function openAgendaDocumentModal(id, mode = 'command') {
    const modal = document.getElementById('agenda-document-modal');
    const preview = document.getElementById('agenda-document-preview');
    const type = document.getElementById('agenda-document-type');
    const title = document.getElementById('agenda-document-title');
    const subtitle = document.getElementById('agenda-document-subtitle');
    const copyButton = document.getElementById('copy-agenda-document-link');
    const whatsapp = document.getElementById('whatsapp-agenda-document');
    if (!modal || !preview) return;
    try {
      type.textContent = mode === 'receipt' ? 'Recibo oficial' : 'Comanda de atendimento';
      title.textContent = mode === 'receipt' ? 'Preparando recibo' : 'Preparando comanda';
      subtitle.textContent = 'Carregando as informações do atendimento com segurança, sem sair da Agenda.';
      preview.innerHTML = '<div class="document-loading-state"><img src="/assets/img/loading-dog.gif" alt="Carregando"><strong>Preparando documento...</strong><small>Buscando serviços, valores, tutor e pet.</small></div>';
      if (!modal.open) modal.showModal();
      showLoading(mode === 'receipt' ? 'Preparando recibo...' : 'Preparando comanda...', 'Carregando documento do atendimento.');
      const data = mode === 'receipt'
        ? await api.post(`/documentos/recibos/${id}/generate`, {})
        : await api.get(`/documentos/comanda/${id}`);
      const receipt = data.receipt;
      const documentData = mode === 'receipt' ? { receipt, ...(receipt?.payload || {}) } : data.document;
      const appointment = documentData?.appointment || receipt?.payload?.appointment || {};
      const publicUrl = mode === 'receipt' ? receipt?.printUrl : (documentData?.publicUrl || data.document?.publicUrl || `/documentos/comanda/${id}`);
      type.textContent = mode === 'receipt' ? 'Recibo oficial' : 'Comanda de atendimento';
      title.textContent = mode === 'receipt' ? `Recibo ${receipt?.documentNumber || ''}`.trim() : 'Comanda do agendamento';
      subtitle.textContent = mode === 'receipt' ? 'Pagamento recebido e pronto para envio ao tutor.' : 'Confira serviços, descontos e totais antes de finalizar ou enviar ao tutor.';
      preview.innerHTML = agendaDocumentHtml(documentData, mode);
      copyButton.disabled = !publicUrl;
      copyButton.dataset.publicUrl = publicUrl ? `${location.origin}${publicUrl}` : '';
      const phone = String(appointment.tutorWhatsapp || '').replace(/\D/g, '');
      const fullUrl = publicUrl ? `${location.origin}${publicUrl}` : '';
      const petName = appointment.petName ? ` do ${appointment.petName}` : '';
      const message = mode === 'receipt'
        ? `Oi! Tudo bem? Segue o recibo do atendimento${petName} aqui no PetFunny - Banho e Tosa. Você pode acessar pelo link: ${fullUrl}`
        : `Oi! Tudo bem? Segue a comanda do atendimento${petName} aqui no PetFunny - Banho e Tosa para conferência. Você pode acessar pelo link: ${fullUrl}`;
      whatsapp.href = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
    } catch (error) {
      toast(error.message || 'Não foi possível abrir o documento.', 'error');
      if (modal.open) modal.close();
    } finally {
      hideLoading();
    }
  }

  function renderStatusBoard() {
    const items = filteredItems();
    const activeStatuses = state.statuses.filter(s => s.active !== false);
    nodes.statusBoard.innerHTML = activeStatuses.map(st => {
      const list = items.filter(a => a.status === st.code);
      return `<section class="status-column" data-status="${esc(st.code)}" style="--status-color:${esc(st.color || '#00A9B7')}">
        <header><span class="status-pill" style="--status-color:${esc(st.color || '#00A9B7')}">${esc(st.name)}</span><strong>${list.length}</strong></header>
        <div class="status-dropzone" data-status="${esc(st.code)}">
          ${list.length ? list.map(appointmentCard).join('') : '<div class="empty-status-slot">Arraste um agendamento para cá</div>'}
        </div>
      </section>`;
    }).join('');
    bindDragAndDrop();
  }

  function bindDragAndDrop() {
    document.querySelectorAll('.appointment-card[draggable="true"]').forEach(card => {
      card.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', card.dataset.id);
        event.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    });
    document.querySelectorAll('.status-dropzone').forEach(zone => {
      zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
      zone.addEventListener('drop', async event => {
        event.preventDefault();
        zone.classList.remove('is-over');
        const id = event.dataTransfer.getData('text/plain');
        const status = zone.dataset.status;
        const item = state.items.find(a => a.id === id);
        if (!id || !status || item?.status === status) return;
        try {
          showLoading('Atualizando status...', `Movendo agendamento para ${statusName(status)}.`);
          await api.patch(`/agenda/${id}/status`, { status });
          toast('Status atualizado por drag & drop.', 'success');
          await loadAgenda({ silent: true });
        } catch (error) { toast(error.message, 'error'); }
        finally { hideLoading(); }
      });
    });
  }

  function renderMetrics() {
    const list = filteredItems();
    const total = list.reduce((sum, a) => sum + Number(a.totalCents || 0), 0);
    const activeSlots = state.slots.filter(s => Number(s.capacity) > 0).length;
    nodes.metrics.innerHTML = bigNumberGrid([[ 'Agendamentos', String(list.length), state.view ], [ 'Faturamento', money(total), 'previsto' ], [ 'Slots', String(activeSlots), 'por semana' ]]);
    nodes.count.textContent = `${list.length} registro(s)`;
  }

  function calendarEvent(a, compact = false) {
    const paymentLine = `${paymentStatusName(a.paymentStatus)}${a.paymentMethodName ? ` · ${a.paymentMethodName}` : ''}`;
    const st = statusByCode(a.status);
    const color = st.color || statusColor(a.status);
    return `<article draggable="true" class="cal-event calendar-appointment-card" style="--status-color:${esc(color)}" data-id="${esc(a.id)}" data-start="${esc(a.startsAt)}">
      ${appointmentActionsMenu(a)}
      <div class="cal-event-main edit-appointment" data-id="${esc(a.id)}">
        ${petAvatar(a, compact ? 'xs' : 'sm')}
        <div class="cal-event-text"><strong>${compact ? `${hm(a.startsAt)} ${esc(a.petName)}` : `${hm(a.startsAt)} · ${esc(a.petName)}`}</strong><small>${esc(a.tutorName)}${compact ? '' : ` · ${money(a.totalCents)}`}<span class="payment-info-line">${esc(paymentLine)}</span><span class="mini-status-name">${esc(st.name || a.status)}</span></small></div>
      </div>
    </article>`;
  }

  async function rescheduleAppointment(id, targetDate, targetTime = '') {
    const item = state.items.find(a => a.id === id);
    if (!item || !targetDate) return;
    const time = targetTime || hm(item.startsAt);
    const startsAt = `${targetDate}T${time}:00`;
    if (String(item.startsAt).slice(0,16) === startsAt.slice(0,16)) return;
    try {
      showLoading('Reagendando atendimento...', `Movendo para ${brDate(targetDate)} às ${time}.`);
      await api.patch(`/agenda/${id}/reschedule`, { startsAt });
      toast('Agendamento atualizado no calendário.', 'success');
      await loadAgenda({ silent: true });
    } catch (error) { toast(error.message, 'error'); }
    finally { hideLoading(); }
  }

  function renderDay() {
    const times = slotTimesForDate(state.date);
    nodes.day.innerHTML = times.length ? times.map(t => {
      const hourItems = filteredItems().filter(a => hm(a.startsAt) === t);
      return `<div class="time-cell"><strong>${esc(t)}</strong></div><div class="slot-cell calendar-drop-target" data-date="${esc(state.date)}" data-slot="${esc(t)}"><div class="slot-cell-head"><div class="slot-actions-inline">${quickScheduleButton(state.date, t)}${slotTag(state.date, t)}</div></div>${hourItems.map(a => calendarEvent(a)).join('') || '<small>Horário livre</small>'}</div>`;
    }).join('') : '<div class="time-cell">--</div><div class="slot-cell">Sem slots configurados para este dia.</div>';
  }

  function renderWeek() {
    const start = dateAdd(state.date, -new Date(`${state.date}T12:00:00`).getDay());
    const days = Array.from({ length:7 }, (_, i) => dateAdd(start, i));
    const times = [...new Set(state.slots.map(s => s.slotTime))].sort();
    nodes.week.innerHTML = '<div class="time-cell">Hora</div>' + days.map(d => `<div class="time-cell day-heading"><strong>${new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}</strong></div>`).join('') + times.map(t => `<div class="time-cell"><strong>${esc(t)}</strong></div>${days.map(d => {
      const items = filteredItems().filter(a => String(a.startsAt).slice(0,10) === d && hm(a.startsAt) === t);
      return `<div class="slot-cell calendar-drop-target" data-date="${esc(d)}" data-slot="${esc(t)}"><div class="slot-cell-head"><div class="slot-actions-inline">${quickScheduleButton(d, t)}${slotTag(d, t)}</div></div>${items.map(a => calendarEvent(a)).join('')}</div>`;
    }).join('')}`).join('');
  }

  function renderMonth() {
    const first = firstDayOfMonth(state.date);
    const month = first.getMonth();
    const gridStart = new Date(first); gridStart.setDate(first.getDate() - first.getDay());
    const days = Array.from({ length:42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate()+i); return d; });
    nodes.month.innerHTML = days.map(d => {
      const iso = d.toISOString().slice(0,10);
      const items = filteredItems().filter(a => String(a.startsAt).slice(0,10) === iso);
      const stats = daySlotStats(iso);
      return `<div class="calendar-day calendar-drop-target ${d.getMonth() !== month ? 'muted' : ''} ${iso === new Date().toISOString().slice(0,10) ? 'today' : ''}" data-date="${esc(iso)}"><div class="calendar-date"><span>${d.getDate()}</span><span class="calendar-count">${items.length}</span></div><div class="month-slot-row"><div class="slot-actions-inline">${quickScheduleButton(iso, stats.times[0] || '')}${slotTag(iso)}</div></div>${items.slice(0,3).map(a => calendarEvent(a, true)).join('')}</div>`;
    }).join('');
  }

  function renderAll() {
    nodes.calendar.dataset.view = state.view;
    nodes.title.textContent = `${state.view === 'day' ? 'Dia' : state.view === 'week' ? 'Semana' : 'Mês'} · ${brDate(state.date)}`;
    nodes.list.innerHTML = filteredItems().length ? filteredItems().map(appointmentCard).join('') : '<article class="module-card empty-state"><strong>Nenhum agendamento encontrado.</strong><p>Ajuste os filtros ou crie um novo agendamento.</p></article>';
    if (state.view === 'day') renderDay();
    if (state.view === 'week') renderWeek();
    if (state.view === 'month') renderMonth();
    renderStatusBoard(); renderMetrics(); setupPremiumInteractions(document); bindHybridWhatsAppButtons(document);
  }

  async function loadBaseData() {
    const [options, tutors, pets, services] = await Promise.all([
      api.get('/agenda/options'),
      api.get('/tutores?status=active&limit=100'),
      api.get('/pets?status=active&limit=200'),
      api.get('/servicos?status=active&limit=200')
    ]);
    state.statuses = options.statuses || [];
    state.collaborators = options.collaborators || [];
    state.paymentStatuses = options.paymentStatuses || [];
    state.paymentMethods = options.paymentMethods || [];
    state.serviceTypes = options.serviceTypes || [];
    state.petTypes = options.petTypes || [];
    state.petSizes = options.petSizes || [];
    state.slots = options.timeSlotCapacities || [];
    state.tutors = tutors.items || [];
    state.pets = pets.items || [];
    state.services = services.items || [];
    populateSelects();
  }

  async function loadAgenda(options = {}) {
    if (!options.silent) showLoading('Atualizando agenda...', 'Carregando horários, cards e informações dos atendimentos.');
    try {
      const params = new URLSearchParams({ date: state.date, view: state.view, status: state.status, collaboratorId: state.collaboratorId });
      const data = await api.get(`/agenda?${params.toString()}`);
      state.items = data.items || [];
      renderAll();
    } finally {
      if (!options.silent) hideLoading();
    }
  }

  async function openForm(item = null) {
    const prefill = item && item.__prefill ? item : null;
    if (prefill) item = null;
    state.editing = item;
    document.getElementById('modal-title').textContent = item ? 'Editar agendamento' : 'Novo agendamento';
    fields.id.value = item?.id || '';
    fields.whatsapp.value = item?.tutorWhatsapp || (state.tutors.find(t => t.id === item?.tutorId)?.whatsapp || '');
    fields.tutorId.value = item?.tutorId || '';
    renderPetsForTutor();
    fields.petId.value = item?.petId || '';
    fields.date.value = item?.startsAt ? String(item.startsAt).slice(0,10) : (prefill?.date || state.date);
    renderTimes();
    fields.time.value = item?.startsAt ? hm(item.startsAt) : (prefill?.time || fields.time.options[0]?.value || '');
    fields.status.value = item?.status || 'agendado';
    fields.collab.value = item?.collaboratorId || '';
    fields.paymentStatus.value = item?.paymentStatus || 'pending';
    fields.paymentMethod.value = item?.paymentMethodId || '';
    fields.discount.value = item?.discountPercent || 0;
    fields.notes.value = item?.notes || '';
    renderServiceChecks();
    const ids = new Set((item?.items || []).map(i => i.serviceId));
    fields.services.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = ids.has(input.value); });
    updateTotal();
    setupPremiumInteractions(nodes.modal);
    nodes.modal.showModal();
  }

  async function saveAppointment(event) {
    event.preventDefault();
    const serviceIds = Array.from(fields.services.querySelectorAll('input:checked')).map(i => i.value);
    const payload = {
      tutorId: fields.tutorId.value,
      petId: fields.petId.value,
      collaboratorId: fields.collab.value,
      startsAt: `${fields.date.value}T${fields.time.value}:00`,
      status: fields.status.value,
      paymentStatus: fields.paymentStatus.value,
      paymentMethodId: fields.paymentMethod.value,
      serviceIds,
      discountPercent: fields.discount.value,
      notes: fields.notes.value
    };
    try {
      const editing = Boolean(fields.id.value);
      if (editing) await api.put(`/agenda/${fields.id.value}`, payload); else await api.post('/agenda', payload);
      nodes.modal.close();
      await loadAgenda({ silent: true });
      await showSuccessModal(editing ? 'Agendamento atualizado' : 'Agendamento cadastrado', editing ? 'As alterações foram salvas e a agenda já está atualizada.' : 'O atendimento foi cadastrado e já aparece na agenda.');
    } catch (error) {
      await showResultModal({ type: 'error', title: 'Não foi possível salvar', message: error.message || 'Revise os dados do agendamento e tente novamente.', okText: 'OK' });
    }
  }

  nodes.calendar.addEventListener('dragstart', (event) => {
    const card = event.target.closest('.cal-event[data-id]');
    if (!card) return;
    event.dataTransfer.setData('text/plain', card.dataset.id);
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });
  nodes.calendar.addEventListener('dragend', (event) => {
    event.target.closest('.cal-event')?.classList.remove('is-dragging');
  });
  nodes.calendar.addEventListener('dragover', (event) => {
    const target = event.target.closest('.calendar-drop-target');
    if (!target) return;
    event.preventDefault();
    target.classList.add('is-over');
  });
  nodes.calendar.addEventListener('dragleave', (event) => {
    event.target.closest('.calendar-drop-target')?.classList.remove('is-over');
  });
  nodes.calendar.addEventListener('drop', async (event) => {
    const target = event.target.closest('.calendar-drop-target');
    if (!target) return;
    event.preventDefault();
    target.classList.remove('is-over');
    const id = event.dataTransfer.getData('text/plain');
    await rescheduleAppointment(id, target.dataset.date, target.dataset.slot);
  });

  nodes.date.value = state.date;
  nodes.date.addEventListener('change', async e => { state.date = e.target.value; await loadAgenda(); });
  nodes.status.addEventListener('change', async e => { state.status = e.target.value; await loadAgenda(); });
  nodes.collab.addEventListener('change', async e => { state.collaboratorId = e.target.value; await loadAgenda(); });
  nodes.search.addEventListener('input', renderAll);
  document.getElementById('today-btn').addEventListener('click', async () => { state.date = new Date().toISOString().slice(0,10); nodes.date.value = state.date; await loadAgenda(); });
  document.getElementById('prev-btn').addEventListener('click', async () => { state.date = dateAdd(state.date, state.view === 'month' ? -30 : state.view === 'week' ? -7 : -1); nodes.date.value = state.date; await loadAgenda(); });
  document.getElementById('next-btn').addEventListener('click', async () => { state.date = dateAdd(state.date, state.view === 'month' ? 30 : state.view === 'week' ? 7 : 1); nodes.date.value = state.date; await loadAgenda(); });
  document.getElementById('view-buttons').addEventListener('click', async e => { const b = e.target.closest('button[data-view]'); if (!b) return; state.view = b.dataset.view; document.querySelectorAll('#view-buttons button').forEach(x => x.classList.toggle('active', x === b)); await loadAgenda(); });
  document.getElementById('new-appointment-btn').addEventListener('click', () => openForm());
  document.getElementById('close-modal').addEventListener('click', () => nodes.modal.close());
  document.getElementById('cancel-modal').addEventListener('click', () => nodes.modal.close());
  document.getElementById('close-document-modal')?.addEventListener('click', () => document.getElementById('agenda-document-modal')?.close());
  document.getElementById('print-agenda-document')?.addEventListener('click', () => window.print());
  document.getElementById('copy-agenda-document-link')?.addEventListener('click', async (event) => {
    const url = event.currentTarget.dataset.publicUrl;
    if (!url) return toast('A comanda não possui link público. Gere o recibo após o pagamento para compartilhar o link.', 'warning');
    await navigator.clipboard.writeText(url);
    toast('Link copiado para a área de transferência.', 'success');
  });
  fields.whatsapp?.addEventListener('input', (event) => {
    const d = event.target.value.replace(/\D/g, '').replace(/^55/, '').slice(0, 11);
    event.target.value = d.length > 7 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : d.length > 2 ? `(${d.slice(0,2)}) ${d.slice(2)}` : d;
  });
  fields.whatsapp?.addEventListener('blur', lookupClientByWhatsapp);
  fields.tutorId?.addEventListener('change', () => { renderPetsForTutor({ autoSelectSingle: true }); completeFieldsFromSelection({ forceNotes: true }); });
  fields.petId?.addEventListener('change', () => { completeFieldsFromSelection({ forceNotes: true }); renderServiceChecks(); });
  fields.date?.addEventListener('change', renderTimes);
  fields.services?.addEventListener('change', updateTotal);
  fields.discount?.addEventListener('input', updateTotal);
  nodes.form?.addEventListener('submit', saveAppointment);
  window.addEventListener('scroll', closeFloatingMenus, true);
  window.addEventListener('resize', closeFloatingMenus);
  document.addEventListener('click', async e => {
    const quick = e.target.closest('.quick-schedule-btn');
    if (quick) {
      e.preventDefault();
      e.stopPropagation();
      await openForm({ __prefill: true, date: quick.dataset.newDate || state.date, time: quick.dataset.newTime || '' });
      return;
    }
    const kebabButton = e.target.closest('.kebab-btn');
    if (kebabButton) {
      e.preventDefault();
      e.stopPropagation();
      openFloatingMenu(kebabButton);
      return;
    }
    if (!e.target.closest('.agenda-global-action-menu')) closeFloatingMenus();
    const commandButton = e.target.closest('.view-command-modal');
    if (commandButton) {
      e.preventDefault();
      e.stopPropagation();
      closeFloatingMenus();
      await openAgendaDocumentModal(commandButton.dataset.id, 'command');
      return;
    }
    const receiptButton = e.target.closest('.view-receipt-modal');
    if (receiptButton) {
      e.preventDefault();
      e.stopPropagation();
      closeFloatingMenus();
      await openAgendaDocumentModal(receiptButton.dataset.id, 'receipt');
      return;
    }
    const status = e.target.closest('.status-action');
    if (status) {
      e.preventDefault();
      closeFloatingMenus();
      try { showLoading('Atualizando status...'); await api.patch(`/agenda/${status.dataset.id}/status`, { status: status.dataset.status }); await loadAgenda(); toast('Status atualizado.', 'success'); }
      catch (error) { toast(error.message, 'error'); }
      finally { hideLoading(); }
      return;
    }
    const edit = e.target.closest('.edit-appointment');
    if (edit) {
      if (e.target.closest('.card-menu a')) return;
      const id = edit.dataset.id || edit.closest('[data-id]')?.dataset.id;
      if (!id) return;
      closeFloatingMenus();
      const full = await api.get(`/agenda/${id}`);
      await openForm(full.appointment);
    }
  });

  try {
    await loadBaseData();
    await loadAgenda({ silent: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        finishPageLoading();
        hideLoading();
      });
    });
  }
