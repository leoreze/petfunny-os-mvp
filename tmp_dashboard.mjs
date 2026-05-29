
    import { api } from '/assets/js/api.js';
    import { buildShell, setupPremiumInteractions } from '/assets/js/shell.js';
    import { showLoading, hideLoading, showSuccessModal, showResultModal } from '/assets/js/loading.js';

    let currentSummary = null;
    let agendaItems = [];
    let tableSort = { key: 'startsAt', direction: 'asc' };
    let calendarView = 'day';
    let selectedDate = new Date();

    const brl = (cents = 0) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num = (value = 0) => Number(value || 0).toLocaleString('pt-BR');
    const pad = (value) => String(value).padStart(2, '0');
    const time = (value) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const dateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--';
    const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const timeKey = (date) => `${pad(date.getHours())}:00`;
    const toInputDateTime = (value) => {
      if (!value) return '';
      const d = new Date(value);
      return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const paymentText = (item) => `${item.paymentStatusName || (item.paymentStatus === 'paid' ? 'Pago' : 'Pendente')} · ${item.paymentMethodName || 'A definir'}`;
    const initials = (name = '') => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '?';
    const esc = (value = '') => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

    const statusLabels = {
      agendado: 'Agendado',
      confirmado: 'Confirmado',
      em_atendimento: 'Em atendimento',
      finalizado: 'Finalizado',
      cancelado: 'Cancelado',
      nao_compareceu: 'Não compareceu'
    };

    const statusClass = (status = '') => `status-pill status-${String(status).replace(/_/g, '-')}`;
    const itemById = (id) => [...(currentSummary?.agendaToday || []), ...(currentSummary?.calendarAppointments || [])].find(item => String(item.id) === String(id));
    const appointmentStatusColor = (item = {}) => item.statusColor || item.status_color || (currentSummary?.appointmentStatuses || []).find(status => status.code === item.status)?.color || '#00A9B7';

    function petAvatar(item, small = false) {
      const cls = small ? 'pet-mini-avatar sm' : 'pet-mini-avatar md';
      if (item.petPhotoUrl) return `<span class="${cls}"><img src="${esc(item.petPhotoUrl)}" alt="Foto de ${esc(item.petName)}"></span>`;
      return `<span class="${cls}">${esc(initials(item.petName))}</span>`;
    }

    function metricCard(label, value, hint, icon) {
      return `
        <article class="dashboard-metric-card">
          <div class="metric-icon">${icon}</div>
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${hint}</small>
        </article>`;
    }

    function alertCard(alert) {
      return `
        <article class="alert-card alert-${alert.type || 'info'}">
          <strong>${alert.title}</strong>
          <p>${alert.message}</p>
        </article>`;
    }

    function sortValue(item, key) {
      const map = {
        pet: item.petName,
        tutor: item.tutorName,
        services: item.services,
        startsAt: item.startsAt,
        status: item.status,
        payment: paymentText(item),
        total: Number(item.totalCents || 0)
      };
      return map[key] ?? '';
    }

    function getFilteredAgenda() {
      const input = document.getElementById('agenda-filter');
      const term = String(input?.value || '').toLowerCase().trim();
      const filtered = agendaItems.filter((item) => !term || [item.petName, item.tutorName, item.tutorWhatsapp, item.services, item.status, paymentText(item)].join(' ').toLowerCase().includes(term));
      filtered.sort((a, b) => {
        const av = sortValue(a, tableSort.key);
        const bv = sortValue(b, tableSort.key);
        if (tableSort.key === 'total') return tableSort.direction === 'asc' ? av - bv : bv - av;
        const compare = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
        return tableSort.direction === 'asc' ? compare : -compare;
      });
      return filtered;
    }

    function agendaRow(item, index) {
      return `
        <tr>
          <td>${String(index + 1).padStart(2, '0')}</td>
          <td>
            <div class="pet-cell">
              ${petAvatar(item, true)}
              <div><strong>${item.petName}</strong><small>${item.petSize || 'porte não informado'}</small></div>
            </div>
          </td>
          <td><strong>${item.tutorName}</strong><small>${item.tutorWhatsapp || 'WhatsApp não informado'}</small></td>
          <td>${item.services}</td>
          <td>${time(item.startsAt)}</td>
          <td><span class="${statusClass(item.status)}" style="--status-color:${appointmentStatusColor(item)}">${statusLabels[item.status] || item.status}</span></td>
          <td><span class="payment-chip" style="--payment-color:${item.paymentStatusColor || '#00A9B7'}">${paymentText(item)}</span></td>
          <td>${brl(item.totalCents)}</td>
          <td><button class="kebab-btn dashboard-kebab-btn" type="button" data-dashboard-menu-button="true" data-id="${esc(item.id)}" aria-label="Abrir ações do atendimento" aria-expanded="false">⋯</button></td>
        </tr>`;
    }


    function getDashboardActionMenu() {
      let menu = document.getElementById('dashboard-global-action-menu');
      if (!menu) {
        menu = document.createElement('div');
        menu.id = 'dashboard-global-action-menu';
        menu.className = 'agenda-global-action-menu dashboard-global-action-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        document.body.appendChild(menu);
      }
      return menu;
    }

    function closeDashboardActionMenu() {
      document.querySelectorAll('[data-dashboard-menu-button][aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
      const menu = getDashboardActionMenu();
      menu.hidden = true;
      menu.classList.remove('is-open');
      menu.style.display = 'none';
      menu.style.pointerEvents = 'none';
      menu.innerHTML = '';
      menu.removeAttribute('data-id');
    }

    function openDashboardActionMenu(button) {
      const id = button.dataset.id;
      const item = itemById(id) || {};
      const menu = getDashboardActionMenu();
      const alreadyOpen = !menu.hidden && menu.dataset.id === id;
      closeDashboardActionMenu();
      if (alreadyOpen) return;
      const receiptButton = item.paymentStatus === 'paid' ? `<button data-dashboard-menu-action="receipt" data-id="${esc(id)}" type="button">🧾 Recibo</button>` : '';
      menu.dataset.id = id;
      menu.innerHTML = `
        <button data-dashboard-menu-action="edit" data-id="${esc(id)}" type="button">✏️ Editar</button>
        <button data-dashboard-menu-action="cancel" data-id="${esc(id)}" type="button">🚫 Cancelar</button>
        <button data-dashboard-menu-action="command" data-id="${esc(id)}" type="button">📋 Comanda</button>
        ${receiptButton}
        <button data-dashboard-menu-action="whatsapp" data-id="${esc(id)}" type="button">💬 WhatsApp confirmação</button>
      `;
      const rect = button.getBoundingClientRect();
      const gutter = 12;
      menu.hidden = false;
      menu.classList.add('is-open');
      menu.style.display = 'grid';
      menu.style.pointerEvents = 'auto';
      button.setAttribute('aria-expanded', 'true');
      const width = Math.max(menu.offsetWidth || 224, 224);
      const height = Math.max(menu.offsetHeight || 210, 180);
      const left = Math.min(window.innerWidth - width - gutter, Math.max(gutter, rect.right - width));
      let top = rect.bottom + 8;
      if (top + height > window.innerHeight - gutter) top = Math.max(gutter, rect.top - height - 8);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    async function openDashboardCommand(id) {
      window.open(`/documentos/comanda/${encodeURIComponent(id)}`, '_blank', 'noopener');
    }

    async function openDashboardReceipt(id) {
      try {
        const data = await api.post(`/documentos/recibos/${id}/generate`, {});
        const url = data?.receipt?.printUrl;
        if (url) window.open(url, '_blank', 'noopener');
      } catch (error) {
        await showResultModal({ type: 'error', title: 'Recibo indisponível', message: error.message || 'Não foi possível abrir o recibo.', okText: 'OK' });
      }
    }

    function openDashboardWhatsapp(id) {
      const item = itemById(id) || {};
      const phone = String(item.tutorWhatsapp || '').replace(/\D/g, '');
      const msg = `Oi! Tudo bem? Passando para confirmar o horário do ${item.petName || 'seu pet'} aqui no PetFunny - Banho e Tosa. Podemos confirmar?`;
      window.open(`https://wa.me/${phone || ''}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    }

    function renderAgendaTable() {
      const tbody = document.querySelector('#agenda-table tbody');
      const rows = getFilteredAgenda();
      if (!tbody) return;
      tbody.innerHTML = rows.length ? rows.map(agendaRow).join('') : `<tr><td colspan="9">Nenhum atendimento encontrado com esse filtro.</td></tr>`;
      tbody.querySelectorAll('[data-action="edit-appointment"]').forEach(btn => btn.addEventListener('click', () => openAppointmentModal(itemById(btn.dataset.id))));
      document.querySelectorAll('#agenda-table th[data-sort]').forEach((th) => {
        const active = th.dataset.sort === tableSort.key;
        th.classList.toggle('is-sorted', active);
        th.dataset.direction = active ? tableSort.direction : '';
        const arrow = th.querySelector('.sort-arrow');
        if (arrow) arrow.textContent = active ? (tableSort.direction === 'asc' ? '↑' : '↓') : '↕';
      });
    }

    function agendaCard(item) {
      const color = appointmentStatusColor(item);
      const statusName = statusLabels[item.status] || item.status || 'Status';
      const paymentLine = paymentText(item);
      return `
        <article class="appointment-card module-card status-tinted-card agenda-compact-card dashboard-appointment-card" draggable="true" data-id="${esc(item.id)}" data-status="${esc(item.status)}" style="--status-color:${esc(color)}">
          <div class="appointment-status-line"><span class="status-pill" style="--status-color:${esc(color)}">${esc(statusName)}</span></div>
          <div class="appointment-card-head edit-appointment" data-id="${esc(item.id)}">
            ${petAvatar(item, false)}
            <div><h3>${esc(time(item.startsAt))} · ${esc(item.petName || 'Pet')}</h3><small>${esc(item.tutorName || 'Tutor')}</small></div>
          </div>
          <p><strong>${esc(item.services || 'Serviço não informado')}</strong></p>
          <div class="appointment-meta-row"><small>${esc(item.collaboratorName || 'Equipe PetFunny')}<span class="payment-info-line">${esc(paymentLine)}</span>${item.packageSessionLabel ? `<span class="payment-info-line">${esc(item.packageSessionLabel)}</span>` : ''}</small><b>${brl(item.totalCents)}</b></div>
        </article>`;
    }

    function dashboardStatusBoard(statuses, agenda) {
      const grouped = new Map(statuses.map((status) => [status.code, { ...status, items: [] }]));
      agenda.forEach((item) => {
        const current = grouped.get(item.status) || { code: item.status, name: statusLabels[item.status] || item.status, color: appointmentStatusColor(item), items: [] };
        current.items.push(item);
        grouped.set(item.status, current);
      });

      return `
        <div class="status-board custom-scroll dashboard-health-board" id="dashboard-status-board">
          ${Array.from(grouped.values()).map((status) => `
            <section class="status-column dashboard-status-column" style="--status-color:${esc(status.color || '#00A9B7')}">
              <header>
                <div>
                  <span class="status-pill" style="--status-color:${esc(status.color || '#00A9B7')}">${esc(status.name || status.code)}</span>
                  <small>${status.items.length} atendimento(s)</small>
                </div>
                <strong>${status.items.length}</strong>
              </header>
              <div class="status-dropzone dashboard-health-dropzone" data-status="${esc(status.code)}">
                ${status.items.length ? status.items.map(agendaCard).join('') : `<div class="empty-status-slot">Nenhum atendimento neste status.</div>`}
              </div>
            </section>
          `).join('')}
        </div>`;
    }

    function getSlotMap(summary) {
      const slotMap = new Map();
      (summary.operational?.timeSlotCapacities || []).forEach(slot => slotMap.set(`${slot.weekday}-${slot.slotTime}`, Number(slot.capacity || 0)));
      const usageMap = new Map();
      (summary.slotUsage || []).forEach(slot => usageMap.set(`${slot.date}-${slot.slotTime}`, Number(slot.used || 0)));
      return { slotMap, usageMap };
    }

    function daySlots(date, summary) {
      const weekday = date.getDay();
      const dateStr = dateKey(date);
      const hours = (summary.operational?.businessHours || []).find(h => Number(h.weekday) === weekday);
      if (!hours?.isOpen) return [];
      const start = Number(String(hours.opensAt || '08:00').slice(0, 2));
      const end = Number(String(hours.closesAt || '18:00').slice(0, 2));
      const { slotMap, usageMap } = getSlotMap(summary);
      return Array.from({ length: Math.max(0, end - start) }, (_, idx) => {
        const h = start + idx;
        const slotTime = `${pad(h)}:00`;
        const capacity = slotMap.get(`${weekday}-${slotTime}`) || 0;
        const used = usageMap.get(`${dateStr}-${slotTime}`) || 0;
        const free = Math.max(0, capacity - used);
        return { date: dateStr, slotTime, capacity, used, free, weekday };
      });
    }

    function eventsForDate(date, summary) {
      const key = dateKey(date);
      return (summary.calendarAppointments || []).filter(item => dateKey(new Date(item.startsAt)) === key);
    }

    function dashboardCalendarEvent(item, compact = false) {
      const color = appointmentStatusColor(item);
      const statusName = statusLabels[item.status] || item.status || 'Status';
      return `<article draggable="true" class="cal-event calendar-appointment-card" style="--status-color:${esc(color)}" data-id="${esc(item.id)}" data-start="${esc(item.startsAt)}">
        <div class="cal-event-main edit-appointment" data-id="${esc(item.id)}">
          ${petAvatar(item, compact)}
          <div class="cal-event-text"><strong>${compact ? `${esc(time(item.startsAt))} ${esc(item.petName || 'Pet')}` : `${esc(time(item.startsAt))} · ${esc(item.petName || 'Pet')}`}</strong><small>${esc(item.tutorName || 'Tutor')}${compact ? '' : ` · ${brl(item.totalCents)}`}<span class="payment-info-line">${esc(paymentText(item))}</span><span class="mini-status-name">${esc(statusName)}</span></small></div>
        </div>
        <button class="kebab-btn dashboard-kebab-btn dashboard-calendar-kebab" type="button" data-dashboard-menu-button="true" data-id="${esc(item.id)}" aria-label="Abrir ações do atendimento" aria-expanded="false">⋯</button>
      </article>`;
    }

    async function rescheduleAppointment(id, targetDate, targetTime = '') {
      const item = itemById(id);
      if (!item || !targetDate) return;
      const target = targetTime || time(item.startsAt);
      const startsAt = `${targetDate}T${target}:00`;
      if (String(item.startsAt).slice(0,16) === startsAt.slice(0,16)) return;
      showLoading('Reagendando atendimento...', `Movendo para ${targetDate} às ${target}.`);
      try {
        await api.patch(`/agenda/${id}/reschedule`, { startsAt });
        await loadDashboard();
      } catch (error) {
        alert(error.message || 'Não foi possível reagendar.');
      } finally {
        hideLoading();
      }
    }

    async function updateAppointmentStatus(id, status) {
      const item = itemById(id);
      if (!item || !status || item.status === status) return;
      showLoading('Atualizando status...', 'Movendo atendimento para a nova coluna.');
      try {
        await api.patch(`/agenda/${id}/status`, { status });
        await loadDashboard();
      } catch (error) {
        alert(error.message || 'Não foi possível alterar o status.');
      } finally {
        hideLoading();
      }
    }

    function monthCalendar(summary) {
      const first = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const startOffset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
      const cells = Array.from({ length: 42 }, (_, i) => {
        const day = i - startOffset + 1;
        const muted = day < 1 || day > daysInMonth;
        const cellDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), Math.max(1, Math.min(daysInMonth, day)));
        const events = muted ? [] : eventsForDate(cellDate, summary);
        const slots = muted ? [] : daySlots(cellDate, summary);
        const capacity = slots.reduce((sum, s) => sum + s.capacity, 0);
        const used = slots.reduce((sum, s) => sum + s.used, 0);
        const free = Math.max(0, capacity - used);
        const isToday = !muted && dateKey(cellDate) === dateKey(new Date());
        return `
          <div class="calendar-day calendar-drop-target ${muted ? 'muted' : ''} ${isToday ? 'today' : ''}" data-calendar-date="${muted ? '' : dateKey(cellDate)}" data-date="${muted ? '' : dateKey(cellDate)}">
            <div class="calendar-date"><span>${muted ? '' : day}</span>${!muted ? `<span class="calendar-count">${used}/${capacity || 0}</span>` : ''}</div>
            ${!muted && free > 0 ? `<button class="slot-plus" type="button" data-calendar-date="${dateKey(cellDate)}">+ ${free} vaga(s)</button>` : ''}
            ${events.slice(0, 2).map(item => dashboardCalendarEvent(item, true)).join('')}
            ${events.length > 2 ? `<small class="calendar-more">+${events.length - 2} atendimento(s)</small>` : ''}
          </div>`;
      }).join('');
      return `<div class="calendar-weekdays month-only"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div><div class="calendar-month-grid">${cells}</div>`;
    }

    function weekCalendar(summary) {
      const base = new Date(selectedDate);
      const monday = new Date(base);
      monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
      const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
      const allSlots = days.flatMap(day => daySlots(day, summary));
      const hours = [...new Set(allSlots.map(s => s.slotTime))].sort();
      if (!hours.length) return `<div class="empty-state"><strong>Semana sem funcionamento configurado</strong><p>Configure dias e slots em Configurações para visualizar os horários disponíveis.</p></div>`;
      return `
        <div class="dashboard-week-grid">
          <div class="time-cell">Horário</div>${days.map(day => `<div class="time-cell"><strong>${day.toLocaleDateString('pt-BR', { weekday:'short' })}</strong><small>${day.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })}</small></div>`).join('')}
          ${hours.map(hour => `
            <div class="time-cell">${hour}</div>
            ${days.map(day => {
              const slot = daySlots(day, summary).find(s => s.slotTime === hour) || { capacity: 0, used: 0, free: 0, date: dateKey(day), slotTime: hour };
              const events = eventsForDate(day, summary).filter(item => timeKey(new Date(item.startsAt)) === hour);
              return `<div class="slot-cell calendar-drop-target ${slot.free > 0 ? 'has-free-slot' : ''}" data-date="${slot.date}" data-slot="${hour}" data-slot-date="${slot.date}" data-slot-time="${hour}">
                <button class="slot-plus" type="button" data-slot-date="${slot.date}" data-slot-time="${hour}">+ ${slot.free}/${slot.capacity}</button>
                ${events.map(item => dashboardCalendarEvent(item, true)).join('')}
              </div>`;
            }).join('')}
          `).join('')}
        </div>`;
    }

    function dayCalendar(summary) {
      const slots = daySlots(selectedDate, summary);
      if (!slots.length) return `<div class="empty-state"><strong>Dia fechado ou sem slots</strong><p>Este dia não possui funcionamento configurado para agendamentos.</p></div>`;
      return `
        <div class="dashboard-day-grid">
          ${slots.map(slot => {
            const day = new Date(`${slot.date}T12:00:00`);
            const events = eventsForDate(day, summary).filter(item => timeKey(new Date(item.startsAt)) === slot.slotTime);
            return `<div class="time-cell">${slot.slotTime}</div><div class="slot-cell calendar-drop-target ${slot.free > 0 ? 'has-free-slot' : ''}" data-date="${slot.date}" data-slot="${slot.slotTime}" data-slot-date="${slot.date}" data-slot-time="${slot.slotTime}">
              <button class="slot-plus" type="button" data-slot-date="${slot.date}" data-slot-time="${slot.slotTime}">+ ${slot.free} de ${slot.capacity} vaga(s)</button>
              ${events.map(item => dashboardCalendarEvent(item)).join('')}
            </div>`;
          }).join('')}
        </div>`;
    }

    function calendarBody(summary) {
      if (calendarView === 'day') return dayCalendar(summary);
      if (calendarView === 'week') return weekCalendar(summary);
      return monthCalendar(summary);
    }

    function miniCalendar(summary) {
      const title = calendarView === 'month'
        ? selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      return `
        <div class="calendar-pro dashboard-calendar" data-view="${calendarView}">
          <div class="calendar-pro-header">
            <div class="calendar-nav">
              <button type="button" data-cal-nav="prev">‹</button>
              <strong class="calendar-title">${title}</strong>
              <button type="button" data-cal-nav="next">›</button>
              <button type="button" data-cal-nav="today">Hoje</button>
            </div>
            <div class="calendar-views">
              <button type="button" class="${calendarView === 'day' ? 'active' : ''}" data-calendar-view="day">Dia</button>
              <button type="button" class="${calendarView === 'week' ? 'active' : ''}" data-calendar-view="week">Semana</button>
              <button type="button" class="${calendarView === 'month' ? 'active' : ''}" data-calendar-view="month">Mês</button>
            </div>
          </div>
          <div class="calendar-scroll custom-scroll"><div class="calendar-pro-grid dashboard-calendar-body">${calendarBody(summary)}</div></div>
        </div>`;
    }

    function emptyState(title, text) {
      return `<article class="empty-state"><strong>${title}</strong><p>${text}</p></article>`;
    }

    function renderDashboard(summary) {
      currentSummary = summary;
      agendaItems = summary.agendaToday || [];
      const m = summary.metrics || {};
      const agenda = summary.agendaToday || [];
      const upcoming = summary.upcomingAppointments || [];
      const alerts = summary.alerts || [];
      const insights = summary.insights || [];
      const configuredStatuses = summary.appointmentStatuses?.length
        ? summary.appointmentStatuses
        : Object.entries(statusLabels).map(([code, name]) => ({ code, name, total: summary.statusBreakdown?.[code] || 0 }));
      configuredStatuses.forEach(item => { statusLabels[item.code] = item.name; });

      buildShell({
        active: 'Dashboard',
        eyebrow: 'Gestão do dia',
        title: 'Painel de controle PetFunny',
        subtitle: 'Acompanhe a rotina do banho e tosa com informações claras para decidir rápido: agenda, caixa, pagamentos, pacotes, alertas e oportunidades em um só lugar.',
        content: `
          <section class="hero-panel dashboard-hero">
            <div class="dashboard-hero-copy">
              <p class="eyebrow">Rotina em tempo real</p>
              <h1>O dia do PetFunny organizado para a equipe agir com segurança</h1>
              <p>Veja rapidamente o que precisa de atenção: horários de hoje, pagamentos pendentes, atendimentos em andamento, pacotes ativos e oportunidades para melhorar a operação.</p>
            </div>
            <div class="actions dashboard-actions">
              <button class="btn" id="refresh-dashboard">Atualizar painel</button>
              <a class="btn btn-secondary" href="/admin/agenda">Ver agenda</a>
            </div>
          </section>

          <section class="dashboard-metrics-grid">
            ${metricCard('Agendamentos hoje', num(m.appointmentsToday), `${num(m.appointmentsWeek)} na semana`, '📅')}
            ${metricCard('Faturamento hoje', brl(m.revenueTodayCents), `${brl(m.revenueWeekCents)} na semana`, '💰')}
            ${metricCard('A receber', brl(m.pendingPaymentsTotalCents), `${num(m.pendingPaymentsCount)} pendência(s)`, '⏳')}
            ${metricCard('Em atendimento', num(m.activeCheckins), `${num(m.finishedToday)} finalizado(s)`, '🐶')}
            ${metricCard('Pets atendidos', num(m.petsServedToday), `${num(m.petsTotal)} pet(s) cadastrados`, '🐾')}
            ${metricCard('Pacotes ativos', num(m.activePackages), `${num(m.recurringClients)} cliente(s) recorrentes`, '🎁')}
          </section>

          <section class="dashboard-single-row">
            <article class="surface-panel dashboard-main-panel">
              <div class="panel-heading">
                <div><p class="eyebrow">Agenda do dia</p><h2>Atendimentos de hoje</h2></div>
                <span class="badge">${num(agenda.length)} registro(s)</span>
              </div>
              <div class="dashboard-table-filter"><input class="input" id="agenda-filter" placeholder="Buscar por pet, tutor, serviço, status ou pagamento"></div>
              <div class="table-wrap dashboard-table-wrap">
                <div class="table-scroll custom-scroll">
                  <table id="agenda-table">
                    <thead><tr>
                      <th>#</th>
                      <th data-sort="pet">Pet <span class="sort-arrow">↕</span></th>
                      <th data-sort="tutor">Tutor <span class="sort-arrow">↕</span></th>
                      <th data-sort="services">Serviço <span class="sort-arrow">↕</span></th>
                      <th data-sort="startsAt">Horário <span class="sort-arrow">↕</span></th>
                      <th data-sort="status">Status <span class="sort-arrow">↕</span></th>
                      <th data-sort="payment">Pagamento <span class="sort-arrow">↕</span></th>
                      <th data-sort="total">Valor <span class="sort-arrow">↕</span></th>
                      <th>Ações</th>
                    </tr></thead>
                    <tbody></tbody>
                  </table>
                </div>
              </div>
            </article>
          </section>

          <section class="dashboard-alert-insight-grid">
            <article class="surface-panel">
              <div class="panel-heading"><div><p class="eyebrow">Alertas</p><h2>Prioridades</h2></div></div>
              <div class="alert-list">${alerts.length ? alerts.map(alertCard).join('') : emptyState('Tudo certo por enquanto', 'Nenhum alerta crítico foi identificado para a operação de hoje.')}</div>
              <div class="panel-actions-bottom"><a class="btn btn-secondary" href="/admin/notificacoes">Ver todos</a></div>
            </article>
            <article class="surface-panel">
              <div class="panel-heading"><div><p class="eyebrow">Insights</p><h2>Leitura rápida</h2></div></div>
              <div class="insight-list">${insights.length ? insights.map((item) => `<article><span>✨</span><p>${item}</p></article>`).join('') : emptyState('Sem novas recomendações', 'Quando houver dados suficientes, os principais insights aparecem aqui.')}</div>
              <div class="panel-actions-bottom"><a class="btn btn-secondary" href="/admin/relatorios">Ver todos</a></div>
            </article>
          </section>

          <section class="dashboard-full-row">
            <article class="surface-panel">
              <div class="panel-heading"><div><p class="eyebrow">Calendário</p><h2>Dia, semana e mês</h2></div><span class="badge">Slots e atendimentos</span></div>
              <div id="dashboard-calendar-wrap">${miniCalendar(summary)}</div>
            </article>
          </section>

          <section class="module-card stack-md dashboard-status-panel">
            <div class="section-toolbar"><div><h3>Visão por status</h3><p>Arraste um card para outra coluna para alterar o status do agendamento.</p></div><span class="badge">Drag & drop por status</span></div>
            ${dashboardStatusBoard(configuredStatuses, agenda)}
            <div class="dashboard-upcoming-block">
              <div class="panel-heading compact"><div><p class="eyebrow">Próximos horários</p><h2>Agenda dos próximos dias</h2></div></div>
              <div class="upcoming-list">
                ${upcoming.length ? upcoming.map((item) => `<article><strong>${dateTime(item.startsAt)} · ${item.petName}</strong><small>${item.tutorName} · ${item.services}</small></article>`).join('') : emptyState('Sem próximos registros', 'Nenhum agendamento futuro encontrado nos próximos 7 dias.')}
              </div>
            </div>
          </section>

          ${appointmentModalHtml(summary)}
          ${slotModalHtml()}`
      });

      bindDashboardInteractions();
      setupPremiumInteractions(document);
    }

    function appointmentModalHtml(summary) {
      return `
        <dialog class="premium-modal small-modal" id="dashboard-appointment-modal">
          <form method="dialog" class="modal-card" id="dashboard-appointment-form">
            <div class="modal-header"><div><h3>Editar agendamento</h3><small>Atualize horário, status e pagamento sem sair do painel.</small></div><button class="icon-btn" value="cancel" type="submit">✕</button></div>
            <div class="modal-body custom-scroll">
              <input type="hidden" id="dash-appointment-id">
              <div class="modal-summary" id="dash-appointment-summary"></div>
              <div class="form-grid">
                <label class="form-field"><span>Data e hora</span><input class="input" type="datetime-local" id="dash-starts-at"></label>
                <label class="form-field"><span>Status</span><select class="select" id="dash-status">${(summary.appointmentStatuses || []).map(s => `<option value="${s.code}">${s.name}</option>`).join('')}</select></label>
                <label class="form-field"><span>Status de pagamento</span><select class="select" id="dash-payment-status">${(summary.operational?.paymentStatuses || []).filter(p => p.isActive !== false).map(p => `<option value="${p.code}">${p.name}</option>`).join('')}</select></label>
                <label class="form-field"><span>Forma de pagamento</span><select class="select" id="dash-payment-method"><option value="">A definir</option>${(summary.operational?.paymentMethods || []).filter(p => p.isActive !== false).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
              </div>
            </div>
            <div class="modal-footer"><a class="btn btn-secondary" id="dash-open-agenda" href="/admin/agenda">Abrir agenda</a><button class="btn" id="dash-save-appointment" type="button">Salvar alterações</button></div>
          </form>
        </dialog>`;
    }

    function slotModalHtml() {
      return `
        <dialog class="premium-modal small-modal" id="dashboard-slot-modal">
          <form method="dialog" class="modal-card">
            <div class="modal-header"><div><h3>Horário disponível</h3><small>Use este atalho para criar um novo agendamento.</small></div><button class="icon-btn" value="cancel" type="submit">✕</button></div>
            <div class="modal-body"><div id="dashboard-slot-summary"></div></div>
            <div class="modal-footer"><a class="btn" id="dashboard-slot-agenda-link" href="/admin/agenda">Abrir agenda</a></div>
          </form>
        </dialog>`;
    }

    function bindDashboardGlobalMenuOnce() {
      if (window.__dashboardMenuBoundV2) return;
      window.__dashboardMenuBoundV2 = true;

      document.addEventListener('pointerdown', (event) => {
        const button = event.target.closest?.('[data-dashboard-menu-button="true"], .dashboard-kebab-btn');
        if (button) {
          event.preventDefault();
          event.stopPropagation();
          window.__dashboardMenuPointerHandled = true;
          openDashboardActionMenu(button);
          setTimeout(() => { window.__dashboardMenuPointerHandled = false; }, 350);
          return;
        }
        if (!event.target.closest?.('#dashboard-global-action-menu')) closeDashboardActionMenu();
      }, true);

      document.addEventListener('click', async (event) => {
        const button = event.target.closest?.('[data-dashboard-menu-button="true"], .dashboard-kebab-btn');
        if (button) {
          event.preventDefault();
          event.stopPropagation();
          if (!window.__dashboardMenuPointerHandled) openDashboardActionMenu(button);
          return;
        }

        const action = event.target.closest?.('[data-dashboard-menu-action]');
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          const id = action.dataset.id;
          const type = action.dataset.dashboardMenuAction;
          closeDashboardActionMenu();
          if (type === 'edit') return openAppointmentModal(itemById(id));
          if (type === 'cancel') {
            try {
              await api.patch(`/agenda/${id}/status`, { status: 'cancelado' });
              await loadDashboard();
              await showSuccessModal('Agendamento cancelado', 'O atendimento foi marcado como cancelado.');
            } catch (error) {
              await showResultModal({ type: 'error', title: 'Não foi possível cancelar', message: error.message || 'Tente novamente.', okText: 'OK' });
            }
            return;
          }
          if (type === 'command') return openDashboardCommand(id);
          if (type === 'receipt') return openDashboardReceipt(id);
          if (type === 'whatsapp') return openDashboardWhatsapp(id);
          return;
        }

        if (!event.target.closest?.('#dashboard-global-action-menu')) closeDashboardActionMenu();
      }, true);

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeDashboardActionMenu();
        const button = event.target.closest?.('[data-dashboard-menu-button="true"], .dashboard-kebab-btn');
        if (button && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          openDashboardActionMenu(button);
        }
      }, true);

      window.addEventListener('scroll', closeDashboardActionMenu, true);
      window.addEventListener('resize', closeDashboardActionMenu);
    }

    function bindDashboardInteractions() {
      bindDashboardGlobalMenuOnce();
      document.getElementById('refresh-dashboard')?.addEventListener('click', loadDashboard);
      document.getElementById('agenda-filter')?.addEventListener('input', renderAgendaTable);
      document.querySelectorAll('#agenda-table th[data-sort]').forEach(th => th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (tableSort.key === key) tableSort.direction = tableSort.direction === 'asc' ? 'desc' : 'asc';
        else tableSort = { key, direction: 'asc' };
        renderAgendaTable();
      }));
      document.querySelectorAll('[data-action="edit-appointment"]').forEach(btn => btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openAppointmentModal(itemById(btn.dataset.id));
      }));
      document.querySelectorAll('[data-calendar-view]').forEach(btn => btn.addEventListener('click', () => {
        calendarView = btn.dataset.calendarView;
        refreshCalendar();
      }));
      document.querySelectorAll('[data-cal-nav]').forEach(btn => btn.addEventListener('click', () => {
        if (btn.dataset.calNav === 'today') selectedDate = new Date();
        if (btn.dataset.calNav === 'prev') selectedDate.setDate(selectedDate.getDate() - (calendarView === 'month' ? 30 : calendarView === 'week' ? 7 : 1));
        if (btn.dataset.calNav === 'next') selectedDate.setDate(selectedDate.getDate() + (calendarView === 'month' ? 30 : calendarView === 'week' ? 7 : 1));
        refreshCalendar();
      }));
      document.querySelectorAll('[data-calendar-date]').forEach(cell => cell.addEventListener('click', (event) => {
        if (event.target.closest('[data-action="edit-appointment"], [data-dashboard-menu-button], #dashboard-global-action-menu')) return;
        const value = cell.dataset.calendarDate;
        if (!value) return;
        selectedDate = new Date(`${value}T12:00:00`);
        calendarView = 'day';
        refreshCalendar();
      }));
      document.querySelectorAll('[data-slot-date]').forEach(btn => btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openSlotModal(btn.dataset.slotDate || btn.dataset.calendarDate, btn.dataset.slotTime);
      }));
      const statusBoard = document.getElementById('dashboard-status-board');
      if (statusBoard && !statusBoard.dataset.bound) {
        statusBoard.dataset.bound = 'true';
        statusBoard.addEventListener('dragstart', (event) => {
          const card = event.target.closest('.appointment-card[data-id]');
          if (!card) return;
          event.dataTransfer.setData('text/plain', card.dataset.id);
          event.dataTransfer.effectAllowed = 'move';
          card.classList.add('is-dragging');
        });
        statusBoard.addEventListener('dragend', (event) => event.target.closest('.appointment-card')?.classList.remove('is-dragging'));
        statusBoard.addEventListener('dragover', (event) => {
          const zone = event.target.closest('.status-dropzone[data-status]');
          if (!zone) return;
          event.preventDefault();
          zone.classList.add('is-over');
        });
        statusBoard.addEventListener('dragleave', (event) => event.target.closest('.status-dropzone')?.classList.remove('is-over'));
        statusBoard.addEventListener('drop', async (event) => {
          const zone = event.target.closest('.status-dropzone[data-status]');
          if (!zone) return;
          event.preventDefault();
          zone.classList.remove('is-over');
          const id = event.dataTransfer.getData('text/plain');
          await updateAppointmentStatus(id, zone.dataset.status);
        });
      }

      const dashboardCalendar = document.querySelector('.dashboard-calendar');
      if (dashboardCalendar && !dashboardCalendar.dataset.dragBound) {
        dashboardCalendar.dataset.dragBound = 'true';
        dashboardCalendar.addEventListener('dragstart', (event) => {
          const card = event.target.closest('.cal-event[data-id]');
          if (!card) return;
          event.dataTransfer.setData('text/plain', card.dataset.id);
          event.dataTransfer.effectAllowed = 'move';
          card.classList.add('is-dragging');
        });
        dashboardCalendar.addEventListener('dragend', (event) => event.target.closest('.cal-event')?.classList.remove('is-dragging'));
        dashboardCalendar.addEventListener('dragover', (event) => {
          const target = event.target.closest('.calendar-drop-target');
          if (!target || !target.dataset.date) return;
          event.preventDefault();
          target.classList.add('is-over');
        });
        dashboardCalendar.addEventListener('dragleave', (event) => event.target.closest('.calendar-drop-target')?.classList.remove('is-over'));
        dashboardCalendar.addEventListener('drop', async (event) => {
          const target = event.target.closest('.calendar-drop-target');
          if (!target || !target.dataset.date) return;
          event.preventDefault();
          target.classList.remove('is-over');
          const id = event.dataTransfer.getData('text/plain');
          await rescheduleAppointment(id, target.dataset.date, target.dataset.slot || '');
        });
      }

      document.querySelectorAll('.edit-appointment[data-id]').forEach(btn => btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openAppointmentModal(itemById(btn.dataset.id));
      }));

      // Menu de ações do Dashboard é tratado por delegação global em bindDashboardGlobalMenuOnce().

      document.getElementById('dash-save-appointment')?.addEventListener('click', saveAppointmentFromDashboard);
      renderAgendaTable();
    }

    function refreshCalendar() {
      const wrap = document.getElementById('dashboard-calendar-wrap');
      if (!wrap || !currentSummary) return;
      wrap.innerHTML = miniCalendar(currentSummary);
      bindDashboardInteractions();
    }

    function openAppointmentModal(item) {
      if (!item) return;
      const modal = document.getElementById('dashboard-appointment-modal');
      document.getElementById('dash-appointment-id').value = item.id;
      document.getElementById('dash-starts-at').value = toInputDateTime(item.startsAt);
      document.getElementById('dash-status').value = item.status || 'agendado';
      document.getElementById('dash-payment-status').value = item.paymentStatus || 'pending';
      document.getElementById('dash-payment-method').value = item.paymentMethodId || '';
      document.getElementById('dash-open-agenda').href = `/admin/agenda?appointment=${encodeURIComponent(item.id)}`;
      document.getElementById('dash-appointment-summary').innerHTML = `<div class="dashboard-modal-pet">${petAvatar(item, true)}<div><strong>${item.petName} · ${item.tutorName}</strong><small>${time(item.startsAt)} · ${item.services}</small></div></div>`;
      modal?.showModal();
    }

    function openSlotModal(date, slotTime) {
      const modal = document.getElementById('dashboard-slot-modal');
      const label = date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR') : 'data selecionada';
      document.getElementById('dashboard-slot-summary').innerHTML = `<p><strong>${label}${slotTime ? ` às ${slotTime}` : ''}</strong></p><p>Este espaço possui vagas configuradas. Abra a Agenda para cadastrar o atendimento com cliente, pet e serviço.</p>`;
      document.getElementById('dashboard-slot-agenda-link').href = `/admin/agenda?date=${encodeURIComponent(date || '')}&time=${encodeURIComponent(slotTime || '')}`;
      modal?.showModal();
    }

    async function saveAppointmentFromDashboard() {
      const id = document.getElementById('dash-appointment-id')?.value;
      if (!id) return;
      const startsAt = document.getElementById('dash-starts-at')?.value;
      const status = document.getElementById('dash-status')?.value;
      const paymentStatus = document.getElementById('dash-payment-status')?.value;
      const paymentMethodId = document.getElementById('dash-payment-method')?.value;
      try {
        await api.patch(`/agenda/${id}/reschedule`, { startsAt });
        await api.patch(`/agenda/${id}/status`, { status });
        await api.patch(`/agenda/${id}/payment`, { paymentStatus, paymentMethodId });
        document.getElementById('dashboard-appointment-modal')?.close();
        await loadDashboard();
        await showSuccessModal('Agendamento atualizado', 'As alterações foram salvas e o painel já foi atualizado.');
      } catch (error) {
        await showResultModal({ type: 'error', title: 'Não foi possível salvar', message: error.message || 'Revise os dados do agendamento e tente novamente.', okText: 'OK' });
      }
    }

    async function loadDashboard() {
      showLoading('Atualizando painel PetFunny...');
      try {
        const summary = await api.get('/dashboard/summary');
        renderDashboard(summary);
      } catch (error) {
        buildShell({
          active: 'Dashboard',
          eyebrow: 'Painel indisponível',
          title: 'Não foi possível carregar as informações do dia',
          subtitle: 'Tente atualizar a tela. Se o problema continuar, verifique a conexão e o acesso do usuário administrador.',
          content: `<section class="hero-panel"><p class="eyebrow">Ação necessária</p><h1>Não conseguimos atualizar o painel agora</h1><p>${error.message}</p><div class="actions"><a class="btn" href="/admin/login">Voltar ao login</a><button class="btn btn-secondary" id="retry-dashboard">Tentar novamente</button></div></section>`
        });
        document.getElementById('retry-dashboard')?.addEventListener('click', loadDashboard);
      } finally {
        hideLoading();
      }
    }

    loadDashboard();
  