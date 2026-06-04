
  import { buildClientApp, clientCards, currentClientSection, renderAppointmentCard, renderPetCard, renderPackageCard, money, dateTime, shortDate } from '/assets/js/client-shell.js';
  import { clientApi } from '/assets/js/client-api.js';
  import { setClientUser, setClientToken, clientLogout } from '/assets/js/client-auth.js';
  import { finishPageLoading } from '/assets/js/loading.js';
  import { getPushState, enablePushNotifications, disablePushNotifications, registerClientServiceWorker } from '/assets/js/client-push.js';
    import { initClientInstallPrompt } from '/assets/js/client-pwa-install.js';

  const section = currentClientSection();
  initClientInstallPrompt();
  let data = null;
  let options = { pets: [], services: [], packages: [], paymentMethods: [], petSizes: [], petBreeds: [], collaborators: [], gifts: [], promotions: [] };
  let timelineVisibleCount = 8;
  const timelineStep = 8;
  let timelineObserver = null;
  let notificationState = { items: [], offset: 0, limit: 10, total: 0, hasMore: true, loading: false, observer: null };

  const empty = (icon, title, text) => `<article class="client-empty"><span>${icon}</span><h3>${title}</h3><p>${text}</p></article>`;
  const escapeHtml = (value = '') => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const today = () => new Date().toISOString().slice(0, 10);
  function initialScheduleDate() {
    const contextDate = getRoletaScheduleContext()?.date;
    const date = contextDate || today();
    return date < today() ? today() : date;
  }
  function initialScheduleTime(dateValue = initialScheduleDate()) {
    const weekday = new Date(`${dateValue}T12:00:00`).getDay();
    const slots = (options.timeSlotCapacities || []).filter((slot) => Number(slot.weekday) === Number(weekday) && Number(slot.capacity || 0) > 0);
    return slots[0]?.slotTime || '09:00';
  }
  function localStartsAt(dateValue, timeValue) {
    const date = String(dateValue || '').slice(0, 10);
    const time = String(timeValue || '').slice(0, 5);
    return date && time ? `${date}T${time}` : '';
  }


  async function consumeMomentsAccessFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('momentsAccess') || params.get('ml') || '';
    if (!accessToken) return;
    const response = await clientApi.post('/app/auth/moments-access', { token: accessToken });
    if (response.token) setClientToken(response.token);
    if (response.tutor || response.account) setClientUser({ account: response.account, tutor: response.tutor });
    const url = new URL(window.location.href);
    url.searchParams.delete('momentsAccess');
    url.searchParams.delete('ml');
    if (response.focusMediaId) url.searchParams.set('focus', response.focusMediaId);
    window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
  }

  function getRoletaScheduleContext() {
    const params = new URLSearchParams(window.location.search);
    const giftTitle = params.get('mimo') || params.get('gift') || '';
    if (!giftTitle) return null;
    return {
      giftTitle,
      giftDescription: params.get('desc') || '',
      petId: params.get('petId') || '',
      spinId: params.get('spinId') || ''
    };
  }

  function clearRoletaScheduleContext() {
    const url = new URL(window.location.href);
    ['mimo', 'gift', 'desc', 'petId', 'spinId'].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''));
  }


  function getPromotionScheduleContext() {
    const params = new URLSearchParams(window.location.search);
    const promoId = params.get('promoId') || params.get('promocao') || '';
    if (!promoId) return null;
    const promo = (options.promotions || []).find((item) => String(item.id) === String(promoId));
    return promo ? { promoId, promo } : { promoId, promo: null };
  }

  function isDateAllowedByPromotion(dateValue, promo) {
    if (!promo || !Array.isArray(promo.weekdays) || !promo.weekdays.length) return true;
    const weekday = weekdayFromDate(dateValue);
    return promo.weekdays.map(Number).includes(Number(weekday));
  }

  function promotionAllowedDaysText(promo) {
    if (!promo || !Array.isArray(promo.weekdays) || !promo.weekdays.length) return 'todos os dias disponíveis';
    const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    return promo.weekdays.map((d) => names[Number(d)]).filter(Boolean).join(', ');
  }

  function nextPromotionAllowedDate(promo, baseDate = today()) {
    if (!promo || !Array.isArray(promo.weekdays) || !promo.weekdays.length) return baseDate;
    const start = new Date(`${baseDate}T12:00:00`);
    for (let i = 0; i < 21; i += 1) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + i);
      const iso = candidate.toISOString().slice(0, 10);
      if (isDateAllowedByPromotion(iso, promo)) return iso;
    }
    return baseDate;
  }

  const heroFor = {
    home: ['Meu PetFunny', 'Acompanhe cuidados, mimos, ossinhos, agenda e momentos do seu pet.'],
    agenda: ['Criar agendamento', 'Escolha o pet, selecione os serviços, data e horário do atendimento.'],
    agendamentos: ['Meus Agendamentos', 'Acompanhe os próximos horários e consulte o histórico de atendimentos do seu pet.'],
    pets: ['Pets cadastrados', 'Cadastre e atualize dados de cada pet para um atendimento mais seguro.'],
    historico: ['Histórico', 'Acesse atendimentos anteriores, comandas e recibos.'],
    momentos: ['Momentos', 'Fotos, vídeos e lembranças dos atendimentos PetFunny.'],
    pacotes: ['Contratar pacotes', 'Escolha o pet, o pacote, a data inicial e acompanhe as sessões.'],
    mimos: ['Mimos PetFunny', 'Campanhas, benefícios e recompensas para tutores recorrentes.'],
    indique: ['Indique e Ganhe', 'Compartilhe a PetFunny com amigos e acompanhe seus ossinhos de indicação.'],
    roleta: ['Roleta de Mimos', 'Gire a roleta, descubra benefícios e acompanhe suas recompensas.'],
    saude: ['Saúde 360', 'Health Score, triagem preventiva e prontuário básico dentro do App do Tutor.'],
    teleconsultas: ['Tele Consultas', 'Escolha o pet, selecione o veterinário parceiro, dia, horário e finalize o pagamento online.'],
    notificacoes: ['Notificações', 'Acompanhe lembretes, avisos e novidades do PetFunny separados por data.'],
    perfil: ['Meu perfil', 'Atualize seus dados de cadastro. O WhatsApp fica protegido e não pode ser alterado pelo app.'],
    promocoes: ['Promoções PetFunny', 'Descontos ativos entram automaticamente no agendamento quando o serviço, porte e dia combinarem.'],
    bemestar: ['PetFunny 360 IA', 'Avaliação de bem-estar, comportamento, rotina e cuidado do pet com linguagem responsável.']
  };

  function toast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `client-toast ${type}`;
    node.textContent = message;
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 3600);
  }

  function closeModal() {
    document.querySelector('.client-modal-backdrop')?.remove();
  }

  function openModal(title, body, footer = '') {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'client-modal-backdrop';
    wrap.innerHTML = `
      <section class="client-modal-card" role="dialog" aria-modal="true">
        <header><div><p class="eyebrow">Meu PetFunny</p><h2>${escapeHtml(title)}</h2></div><button class="client-icon-btn" data-close-modal type="button">×</button></header>
        <div class="client-modal-body">${body}</div>
        ${footer ? `<footer>${footer}</footer>` : ''}
      </section>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (event) => {
      if (event.target === wrap || event.target.closest('[data-close-modal]')) closeModal();
    });
  }


  function openAnalysisModal(seconds = 18) {
    closeModal();
    const total = Math.max(8, Number(seconds || 18));
    const wrap = document.createElement('div');
    wrap.className = 'client-modal-backdrop client-analysis-backdrop';
    wrap.innerHTML = `
      <section class="client-modal-card client-analysis-modal" role="dialog" aria-modal="true">
        <div class="client-analysis-icon">🧠</div>
        <p class="eyebrow">PetFunny 360 IA</p>
        <h2>Analisando bem-estar do pet...</h2>
        <p>Estamos cruzando comportamento, rotina, saúde percebida e socialização para gerar um diagnóstico responsável.</p>
        <div class="client-analysis-progress"><span style="width:4%"></span></div>
        <strong id="analysis-countdown">${total}s</strong>
        <small>Tempo estimado para concluir a avaliação.</small>
      </section>`;
    document.body.appendChild(wrap);
    const bar = wrap.querySelector('.client-analysis-progress span');
    const counter = wrap.querySelector('#analysis-countdown');
    let remaining = total;
    const timer = window.setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      const progress = Math.min(96, Math.round(((total - remaining) / total) * 96));
      if (bar) bar.style.width = `${progress}%`;
      if (counter) counter.textContent = `${remaining}s`;
      if (remaining <= 0) window.clearInterval(timer);
    }, 1000);
    return {
      finish() {
        window.clearInterval(timer);
        if (bar) bar.style.width = '100%';
        if (counter) counter.textContent = 'Concluído';
        window.setTimeout(() => wrap.remove(), 450);
      },
      close() { window.clearInterval(timer); wrap.remove(); }
    };
  }

  function field(label, name, value = '', extra = '') {
    return `<label class="client-field"><span>${label}</span><input name="${name}" value="${escapeHtml(value || '')}" ${extra}></label>`;
  }

  function textArea(label, name, value = '') {
    return `<label class="client-field"><span>${label}</span><textarea name="${name}" rows="3">${escapeHtml(value || '')}</textarea></label>`;
  }

  function selectField(label, name, items = [], selected = '', placeholder = 'Selecione') {
    return `<label class="client-field"><span>${label}</span><select name="${name}"><option value="">${placeholder}</option>${items.map((item) => `<option value="${escapeHtml(item.value)}" ${String(item.value) === String(selected || '') ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}</select></label>`;
  }

  function photoUploadField(label, name, currentUrl = '', fallback = '🐾') {
    return `<label class="client-field client-photo-upload"><span>${label}</span><div class="client-photo-upload-row"><div class="client-photo-preview" data-photo-preview="${escapeHtml(name)}">${currentUrl ? `<img src="${escapeHtml(currentUrl)}" alt="Foto cadastrada">` : `<strong>${escapeHtml(fallback)}</strong>`}</div><div><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-photo-input="${escapeHtml(name)}"><input type="hidden" name="${escapeHtml(name)}" value=""><small>PNG, JPG ou WebP. A imagem será exibida no app e no cadastro.</small></div></div></label>`;
  }

  function serviceOptionsForPet(petId) {
    const pet = options.pets.find((p) => p.id === petId);
    const size = pet?.size || 'todos';
    return options.services.filter((service) => !service.petSize || service.petSize === 'todos' || service.petSize === size);
  }

  function normalizedServiceText(service = {}) {
    return `${service.name || ''} ${service.categoryName || ''} ${service.category || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function isBathService(service = {}) {
    const text = normalizedServiceText(service);
    return text.includes('banho');
  }

  function isTosaService(service = {}) {
    const text = normalizedServiceText(service);
    return text.includes('tosa');
  }

  function isTransportService(service = {}) {
    const text = normalizedServiceText(service);
    return text.includes('transporte') || text.includes('leva e traz') || text.includes('buscar e entregar') || text.includes('taxi dog') || text.includes('taxidog');
  }

  function selectedTransportServiceIds(scope = document) {
    return [...scope.querySelectorAll('input[name="serviceIds"]:checked')]
      .map((input) => input.value)
      .filter((serviceId) => isTransportService((options.services || []).find((item) => String(item.id) === String(serviceId)) || {}));
  }

  function isTransportSelected(scope = document) {
    return selectedTransportServiceIds(scope).length > 0;
  }

  function tutorHasTransportAddress(tutor = data?.tutor || {}) {
    return Boolean(String(tutor.address || '').trim() && String(tutor.addressNumber || '').trim() && String(tutor.addressNeighborhood || '').trim());
  }

  function tutorAddressText(tutor = data?.tutor || {}) {
    const parts = [tutor.address, tutor.addressNumber, tutor.addressNeighborhood, tutor.city || 'Ribeirão Preto', tutor.state || 'SP'].filter(Boolean);
    return parts.join(', ');
  }

  function renderTransportEstimateBox(estimate = null) {
    const hasEstimate = estimate && !estimate.requiresAddress;
    return `<article class="client-transport-estimate" id="transport-estimate" ${hasEstimate ? '' : 'hidden'}>
      <div class="client-transport-estimate-icon">🚗</div>
      <div class="client-transport-estimate-body">
        <strong>${hasEstimate ? `Transporte estimado: ${money(estimate.feeCents || 0)}` : 'Transporte PetFunny'}</strong>
        <p>${hasEstimate ? escapeHtml(estimate.summary || 'Busca e entrega calculadas automaticamente pelo endereço do tutor.') : 'Selecione Transporte para calcular busca e entrega.'}</p>
        ${hasEstimate ? `<small>${escapeHtml(estimate.address || tutorAddressText())}</small>` : ''}
      </div>
      <button class="btn btn-sm btn-secondary" type="button" data-edit-transport-address>${hasEstimate ? 'Editar endereço' : 'Cadastrar endereço'}</button>
    </article>`;
  }

  function transportAddressForm() {
    const tutor = data?.tutor || {};
    return `<form id="transport-address-form" class="client-form-grid">
      ${field('CEP', 'addressZipcode', tutor.addressZipcode || '', 'placeholder="14000-000"')}
      ${field('Rua / Avenida', 'address', tutor.address || '', 'required')}
      ${field('Número', 'addressNumber', tutor.addressNumber || '', 'required')}
      ${field('Bairro', 'addressNeighborhood', tutor.addressNeighborhood || '', 'required')}
      ${field('Cidade', 'city', tutor.city || 'Ribeirão Preto')}
      ${field('Estado', 'state', tutor.state || 'SP', 'maxlength="2"')}
      <input type="hidden" name="name" value="${escapeHtml(tutor.name || 'Tutor PetFunny')}">
      <input type="hidden" name="email" value="${escapeHtml(tutor.email || '')}">
      <p class="client-muted">Esse endereço será usado para calcular o trajeto de busca e entrega do pet.</p>
      <button class="btn" type="submit">Salvar endereço e calcular transporte</button>
    </form>`;
  }

  async function openTransportAddressModal() {
    openModal('Endereço para transporte', transportAddressForm(), '<button class="btn btn-secondary" data-close-modal>Cancelar</button>');
  }

  async function refreshTransportEstimate({ forceModal = false } = {}) {
    const form = document.getElementById('appointment-form');
    if (!form) return null;
    const box = document.getElementById('transport-estimate');
    const requestedInput = form.querySelector('[name="transportRequested"]');
    const feeInput = form.querySelector('[name="transportFeeCents"]');
    const summaryInput = form.querySelector('[name="transportSummary"]');
    if (!isTransportSelected(form)) {
      if (requestedInput) requestedInput.value = 'false';
      if (feeInput) feeInput.value = '0';
      if (summaryInput) summaryInput.value = '';
      if (box) box.hidden = true;
      return null;
    }
    if (requestedInput) requestedInput.value = 'true';
    if (!tutorHasTransportAddress(data?.tutor || {})) {
      if (box) {
        box.hidden = false;
        box.innerHTML = `<div class="client-transport-estimate-icon">📍</div><div class="client-transport-estimate-body"><strong>Endereço necessário</strong><p>Cadastre o endereço para calcular a busca e entrega do pet.</p></div><button class="btn btn-sm" type="button" data-edit-transport-address>Cadastrar endereço</button>`;
      }
      if (forceModal) await openTransportAddressModal();
      return { requiresAddress: true };
    }
    if (box) {
      box.hidden = false;
      box.innerHTML = `<div class="client-transport-estimate-icon">🚗</div><div class="client-transport-estimate-body"><strong>Calculando transporte...</strong><p>Estimando busca e entrega pelo endereço do tutor.</p></div>`;
    }
    try {
      const estimate = await clientApi.get('/app/transport/estimate');
      if (feeInput) feeInput.value = String(estimate.feeCents || 0);
      if (summaryInput) summaryInput.value = estimate.summary || '';
      if (box) box.outerHTML = renderTransportEstimateBox(estimate);
      return estimate;
    } catch (error) {
      if (box) box.innerHTML = `<div class="client-transport-estimate-icon">⚠️</div><div class="client-transport-estimate-body"><strong>Não foi possível calcular</strong><p>${escapeHtml(error.message || 'Tente novamente em instantes.')}</p></div><button class="btn btn-sm btn-secondary" type="button" data-edit-transport-address>Editar endereço</button>`;
      return null;
    }
  }

  function hasBathSelected(scope = document) {
    return [...scope.querySelectorAll('input[name="serviceIds"]:checked')].some((input) => input.dataset.serviceKind === 'banho');
  }

  function renderAppointmentPetPicker(selectedPetId = '', config = {}) {
    const pets = data.pets || [];
    const selected = selectedPetId || pets[0]?.id || '';
    const inputName = config.inputName || 'petId';
    const returnSection = config.returnSection || currentClientSection() || 'agenda';
    const showAdd = config.showAdd !== false;
    const petCards = pets.map((pet) => {
      const isSelected = String(pet.id) === String(selected);
      const initials = String(pet.name || 'P').slice(0, 1).toUpperCase();
      const photo = pet.photoUrl ? `<img src="${escapeHtml(pet.photoUrl)}" alt="${escapeHtml(pet.name || 'Pet')}">` : `<span>${escapeHtml(initials)}</span>`;
      return `<button class="client-appointment-pet-option ${isSelected ? 'is-selected' : ''}" type="button" data-select-appointment-pet="${escapeHtml(pet.id)}">
        <div class="client-appointment-pet-photo">${photo}</div>
        <strong>${escapeHtml(pet.name || 'Pet')}</strong>
        <small>${escapeHtml(pet.breed || pet.size || 'PetFunny')}</small>
      </button>`;
    }).join('');
    const addCard = showAdd ? `<button class="client-appointment-pet-option client-appointment-add-pet" type="button" data-add-pet-agenda data-add-pet-return="${escapeHtml(returnSection)}">
          <div class="client-appointment-pet-photo add">+</div>
          <strong>Adicionar</strong>
          <small>Novo pet</small>
        </button>` : '';
    return `<div class="client-appointment-pet-picker" data-pet-picker-name="${escapeHtml(inputName)}" data-pet-picker-return="${escapeHtml(returnSection)}">
      <input type="hidden" name="${escapeHtml(inputName)}" value="${escapeHtml(selected)}">
      <div class="client-appointment-pet-row">
        ${petCards}
        ${addCard}
      </div>
    </div>`;
  }


  function weekdayFromDate(dateValue) {
    if (!dateValue) return new Date().getDay();
    const parsed = new Date(`${String(dateValue).slice(0, 10)}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? new Date().getDay() : parsed.getDay();
  }

  function activePromotionForService(service, petId, dateValue) {
    const pet = options.pets.find((p) => p.id === petId);
    const size = pet?.size || 'todos';
    const weekday = weekdayFromDate(dateValue || document.querySelector('[name="appointmentDate"]')?.value || today());
    return (options.promotions || [])
      .filter((promo) => {
        if (promo.status && promo.status !== 'active') return false;
        if (promo.petSize && promo.petSize !== 'todos' && promo.petSize !== size) return false;
        if (promo.serviceId && promo.serviceId !== service.id) return false;
        if (Array.isArray(promo.weekdays) && promo.weekdays.length && !promo.weekdays.map(Number).includes(Number(weekday))) return false;
        return true;
      })
      .sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0))[0] || null;
  }

  function renderPromotionsList() {
    const promos = options.promotions || [];
    if (!promos.length) return empty('🏷️', 'Nenhuma promoção ativa agora', 'Quando o PetFunny liberar descontos por serviço ou dia da semana, eles aparecem aqui.');
    const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return promos.map((promo) => `<article class="client-list-card promotion-card">
      <div class="client-list-icon">🏷️</div>
      <div class="client-list-body">
        <div class="client-list-title-row"><h3>${escapeHtml(promo.title)}</h3><span class="client-badge package">${Number(promo.discountPercent || 0)}% OFF</span></div>
        <p>${escapeHtml(promo.description || 'Desconto aplicado automaticamente no agendamento pelo app.')}</p>
        <div class="client-chip-row">
          <span class="client-badge light">${escapeHtml(promo.serviceName || 'Serviços selecionados')}</span>
          <span class="client-badge light">${escapeHtml(promo.petSize === 'todos' ? 'Todos os portes' : promo.petSize)}</span>
          <span class="client-badge light">${promo.weekdays?.length ? promo.weekdays.map((d) => weekdayNames[Number(d)]).join(', ') : 'Todos os dias'}</span>
        </div>
        <div class="client-card-actions"><a class="btn btn-sm" href="/app/agenda?promoId=${encodeURIComponent(promo.id)}">Agendar com promoção</a></div>
      </div>
    </article>`).join('');
  }



  const wellbeingRoles = [
    { value: 'familiar_autorizado', label: 'Familiar autorizado' },
    { value: 'responsavel_temporario', label: 'Responsável temporário' },
    { value: 'cuidador', label: 'Cuidador' },
    { value: 'parceiro_tutor', label: 'Parceiro(a) do tutor' }
  ];

  function riskBadge(level = '') {
    const map = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto', sem_avaliacao: 'Sem avaliação' };
    return `<span class="client-badge wellbeing-risk ${escapeHtml(level || 'sem_avaliacao')}">${escapeHtml(map[level] || level || 'Sem avaliação')}</span>`;
  }

  function renderWellbeingDiagnostic(diag) {
    if (!diag) return empty('🧠', 'Nenhum diagnóstico ainda', 'Responda a avaliação PetFunny 360 para gerar a primeira leitura de bem-estar do pet.');
    const scores = diag.scores || {};
    const blocks = [
      ['Bem-estar geral', scores.overall || '—'],
      ['Atenção emocional', scores.emotionalAttention || '—'],
      ['Sinais de estresse', scores.stressSigns || '—'],
      ['Rotina de cuidados', scores.careRoutine || '—'],
      ['Socialização', scores.socialization || '—'],
      ['Saúde percebida', scores.perceivedHealth || '—']
    ];
    return `<article class="client-wellbeing-result ${escapeHtml(diag.riskLevel || 'baixo')}">
      <div class="client-list-title-row"><h3>Diagnóstico PetFunny 360</h3>${riskBadge(diag.riskLevel)}</div>
      <p>${escapeHtml(diag.summary || 'Diagnóstico gerado com base nas respostas do tutor.')}</p>
      <div class="client-wellbeing-grid">${blocks.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
      <div class="client-wellbeing-insights">
        <h4>Insights</h4>
        ${(diag.insights || []).map((item) => `<p>• ${escapeHtml(item)}</p>`).join('') || '<p>• Continue acompanhando a rotina do pet.</p>'}
        <h4>Recomendações</h4>
        ${(diag.recommendations || []).map((item) => `<p>• ${escapeHtml(item)}</p>`).join('') || '<p>• Atualize o diagnóstico periodicamente.</p>'}
      </div>
      <small class="client-disclaimer">${escapeHtml(diag.disclaimer || 'Este diagnóstico não substitui avaliação veterinária.')}</small>
    </article>`;
  }

  function renderQuestionInput(question) {
    if (question.answerType === 'text') {
      return `<label class="client-field client-wellbeing-question"><span>${escapeHtml(question.question)}</span><textarea name="${escapeHtml(question.code)}" rows="3" placeholder="Conte em poucas palavras"></textarea></label>`;
    }
    return `<fieldset class="client-wellbeing-question"><legend>${escapeHtml(question.question)}</legend><div class="client-radio-grid">${(question.options || []).map((option, index) => `<label><input type="radio" name="${escapeHtml(question.code)}" value="${escapeHtml(option.value)}" ${index === 0 ? 'required' : ''}><span>${escapeHtml(option.label)}</span></label>`).join('')}</div></fieldset>`;
  }

  async function loadWellbeingPanel(petId = '') {
    const root = document.getElementById('wellbeing-dynamic');
    if (!root) return;
    const selectedPetId = petId || root.dataset.petId || data.pets?.[0]?.id || '';
    if (!selectedPetId) {
      root.innerHTML = empty('🐶', 'Cadastre um pet primeiro', 'O PetFunny 360 precisa de um pet cadastrado para iniciar a avaliação.');
      return;
    }
    root.dataset.petId = selectedPetId;
    root.innerHTML = '<article class="client-empty"><span>🧠</span><h3>Carregando PetFunny 360...</h3><p>Buscando perguntas, histórico e responsáveis autorizados.</p></article>';
    try {
      const [questionsPayload, latestPayload, historyPayload, caregiversPayload] = await Promise.all([
        clientApi.get('/app/wellbeing/questions'),
        clientApi.get(`/app/pets/${selectedPetId}/wellbeing/latest`),
        clientApi.get(`/app/pets/${selectedPetId}/wellbeing/history`),
        clientApi.get(`/app/pets/${selectedPetId}/caregivers`)
      ]);
      const questions = questionsPayload.questions || [];
      const latest = latestPayload.diagnostic;
      const history = historyPayload.diagnostics || [];
      const caregivers = caregiversPayload.caregivers || [];
      root.innerHTML = `
        <section class="client-mobile-section">
          <div class="client-section-title"><h2>Avaliação rápida</h2><p>Responda com sinceridade. A IA gera uma leitura de apoio, sem substituir veterinário.</p></div>
          <form class="client-form-card client-wellbeing-form" id="wellbeing-form" data-pet-id="${escapeHtml(selectedPetId)}">
            ${questions.map(renderQuestionInput).join('')}
            <button class="btn" type="submit">Gerar diagnóstico PetFunny 360</button>
          </form>
        </section>
        <section class="client-mobile-section"><div class="client-section-title"><h2>Último diagnóstico</h2><p>Resumo de bem-estar e recomendações para o próximo cuidado.</p></div>${renderWellbeingDiagnostic(latest)}</section>
        <section class="client-mobile-section"><div class="client-section-title"><h2>Responsáveis do mesmo pet</h2><p>Autorize outras pessoas a contribuir com a percepção 360.</p></div>
          <form class="client-form-card client-form-grid compact" id="caregiver-form" data-pet-id="${escapeHtml(selectedPetId)}">
            ${field('Nome do responsável', 'name', '')}
            ${field('WhatsApp', 'whatsapp', '', 'inputmode="tel"')}
            ${field('E-mail', 'email', '', 'type="email"')}
            ${selectField('Papel', 'role', wellbeingRoles, 'familiar_autorizado', 'Escolha')}
            <button class="btn btn-secondary" type="submit">Autorizar responsável</button>
          </form>
          <div class="client-list-stack">${caregivers.length ? caregivers.map((c) => `<article class="client-list-card"><div class="client-list-icon">👥</div><div class="client-list-body"><div class="client-list-title-row"><h3>${escapeHtml(c.name)}</h3><span class="client-badge light">${escapeHtml(c.role)}</span></div><p>${escapeHtml(c.whatsapp || c.email || 'Contato não informado')} · ${escapeHtml(c.status || 'autorizado')}</p></div></article>`).join('') : empty('👥', 'Nenhum responsável adicional', 'Convide familiares, cuidadores ou responsáveis temporários para colaborar.')}</div>
        </section>
        <section class="client-mobile-section"><div class="client-section-title"><h2>Histórico PetFunny 360</h2><p>Evolução das últimas avaliações.</p></div>
          <div class="client-list-stack">${history.length ? history.map((diag) => `<article class="client-list-card"><div class="client-list-icon">🧠</div><div class="client-list-body"><div class="client-list-title-row"><h3>${shortDate(diag.createdAt)}</h3>${riskBadge(diag.riskLevel)}</div><p>${escapeHtml(diag.summary || '')}</p><small>${escapeHtml(diag.aiUsed ? 'Gerado com IA' : 'Gerado com análise local segura')}</small></div></article>`).join('') : empty('📊', 'Sem histórico ainda', 'Cada nova avaliação aparecerá aqui.')}</div>
        </section>`;
    } catch (error) {
      root.innerHTML = `<article class="client-empty"><span>⚠️</span><h3>Não foi possível carregar</h3><p>${escapeHtml(error.message)}</p></article>`;
    }
  }

  function renderBemEstar() {
    const selected = new URLSearchParams(window.location.search).get('petId') || data.pets?.[0]?.id || '';
    return `<section class="client-mobile-section client-wellbeing-hero-card">
      <div class="client-section-title"><h2>PetFunny 360</h2><p>Avaliação socioemocional e comportamental com IA responsável para apoiar a rotina do seu pet.</p></div>
      <article class="client-alert-soft"><strong>Importante:</strong> este diagnóstico é uma análise de bem-estar e comportamento baseada nas respostas dos tutores. Ele não substitui avaliação veterinária.</article>
      <div class="client-field client-pet-picker-field"><span>Escolha o pet</span>${renderAppointmentPetPicker(selected, { inputName: 'wellbeingPetId', returnSection: 'bemestar' })}</div>
    </section>
    <div id="wellbeing-dynamic" data-pet-id="${escapeHtml(selected)}"></div>`;
  }

  function renderPushActivationCard() {
    return `<details class="client-push-card client-push-dropdown" id="notificacoes">
      <summary class="client-push-summary">
        <span class="client-push-icon">🔔</span>
        <span class="client-push-summary-copy">
          <span class="eyebrow">Notificações no celular</span>
          <strong>Receba lembretes do PetFunny</strong>
          <small>Toque para ativar, pausar ou conferir o status neste aparelho.</small>
        </span>
        <span class="client-push-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="client-push-panel">
        <p id="client-push-status">Ative para receber avisos de agenda, pacote, roleta e recibos direto no celular.</p>
        <div class="client-card-actions push-actions">
          <button class="btn btn-sm" id="enable-push" type="button">Ativar notificações</button>
          <button class="btn btn-secondary btn-sm" id="disable-push" type="button">Desativar neste aparelho</button>
        </div>
        <small class="client-muted">No iPhone, instale o app na tela inicial para liberar push web.</small>
      </div>
    </details>`;
  }

  function timelineDateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return today();
    return date.toISOString().slice(0, 10);
  }

  function timelineDateLabel(value) {
    const key = timelineDateKey(value);
    if (key === today()) return 'Hoje';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === yesterday.toISOString().slice(0, 10)) return 'Ontem';
    return new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  }

  function aiTimelinePosts() {
    const petName = data.pets?.[0]?.name || 'seu pet';
    const templates = [
      { icon: '🩺', label: 'Saúde 360 IA', title: `Como está a saúde de ${petName}?`, text: 'Acompanhe apetite, água, energia, sono, pele, respiração, dor e sinais de alerta. A leitura preventiva ajuda a decidir o próximo cuidado com segurança.', url: '/app/saude-360', ctaLabel: 'Abrir Saúde 360' },
      { icon: '🚑', label: 'TeleVet PetFunny', title: 'Precisa falar com veterinário?', text: 'Se notar vômitos, diarreia, dor, apatia ou qualquer mudança importante, agende uma teleconsulta com veterinário parceiro pelo app.', url: '/app/teleconsultas', ctaLabel: 'Agendar teleconsulta' },
      { icon: '🧠', label: 'PetFunny 360 IA', title: 'Bem-estar também é comportamento', text: 'Responda a avaliação 360 para cruzar rotina, socialização, sinais emocionais e saúde percebida do pet.', url: '/app/bem-estar', ctaLabel: 'Avaliar 360 IA' },
      { icon: '🧴', label: 'IA de cuidados', title: 'Banho, pele e pelagem em dia', text: 'Coceira, oleosidade, nós, odor forte ou queda de pelo podem indicar necessidade de cuidado estético e atenção preventiva.', url: '/app/agenda', ctaLabel: 'Agendar banho/tosa' },
      { icon: '📅', label: 'Sugestão Health 360', title: 'Rotina previsível reduz esquecimentos', text: 'Intercale banho, tosa, hidratação e acompanhamento preventivo para manter histórico completo no app.', url: '/app/agenda', ctaLabel: 'Agendar cuidado' },
      { icon: '📋', label: 'Prontuário PetFunny', title: 'Registre sinais e acompanhe evolução', text: 'Triagens, teleconsultas, banhos, tosas e observações ficam na linha do tempo para facilitar decisões futuras.', url: '/app/saude-360', ctaLabel: 'Ver prontuário' },
      { icon: '📦', label: 'Recorrência inteligente', title: 'Pacotes ajudam a manter a rotina', text: 'Pacotes de banho e tosa ajudam a manter cuidados frequentes, previsibilidade e acompanhamento da evolução do pet.', url: '/app/pacotes', ctaLabel: 'Ver pacotes' },
      { icon: '🎁', label: 'IA PetFunny', title: 'Confira promoções e mimos', text: 'Antes de agendar, veja se existem promoções ou mimos ativos para o cuidado do seu pet.', url: '/app/promocoes', ctaLabel: 'Ver promoções' }
    ];
    const now = new Date();
    return Array.from({ length: 30 }).map((_, index) => {
      const template = templates[index % templates.length];
      const date = new Date(now);
      date.setDate(now.getDate() - Math.floor(index / 2));
      date.setHours(9 + (index % 7), index % 2 ? 30 : 0, 0, 0);
      return { ...template, type: 'ai_post', id: `ai-${index}-${timelineDateKey(date)}`, createdAt: date.toISOString(), cta: `<a class="btn btn-sm btn-secondary" href="${template.url}">${template.ctaLabel}</a>` };
    });
  }

  function timelinePosts() {
    const posts = [];
    if ((data.pets || []).length) {
      const pet = data.pets[0];
      const theme = getDailyHealthTheme(new Date(), pet.id || '');
      posts.push({
        id: `daily-triage-${timelineDateKey(new Date())}-${pet.id || 'pet'}`,
        type: 'daily_health_triage',
        createdAt: new Date().toISOString(),
        icon: theme.icon || '🩺',
        label: 'Triagem diária Saúde 360',
        title: `${theme.title} de ${pet.name || 'seu pet'}`,
        text: `${theme.prompt} A devolutiva entra no prontuário e ajuda a IA a sugerir teleconsulta, banho, tosa ou cuidado preventivo quando fizer sentido.`,
        cta: `<button class="btn btn-sm" type="button" data-open-daily-triage="${escapeHtml(pet.id || '')}">Responder hoje</button><a class="btn btn-secondary btn-sm" href="/app/saude-360">Ver Saúde 360</a>`
      });
    }
    const careInsight = data.careInsight || data.engagement?.careInsight || null;
    if (careInsight) {
      posts.push({
        id: `care-insight-${careInsight.petId || 'pet'}-${timelineDateKey(new Date())}`,
        type: 'care_insight',
        createdAt: new Date().toISOString(),
        icon: careInsight.priority === 'high' ? '🚨' : careInsight.priority === 'attention' ? '🟡' : '🧠',
        label: 'IA de Cuidados',
        title: careInsight.title || 'Cuidado recomendado',
        text: careInsight.message || 'O PetFunny analisou raça, porte, pelagem, histórico e Saúde 360 para sugerir o próximo cuidado.',
        cta: `<a class="btn btn-sm" href="${escapeHtml(careInsight.url || '/app/agenda')}">${escapeHtml(careInsight.ctaLabel || 'Agendar cuidado')}</a><a class="btn btn-sm btn-secondary" href="/app/saude-360">Ver Saúde 360</a>`
      });
    }
    (data.timelineEvents || []).forEach((event) => {
      posts.push({
        id: event.id || `event-${posts.length}`,
        type: event.type || 'system',
        createdAt: event.createdAt || new Date().toISOString(),
        icon: event.icon || '🔔',
        label: event.label || 'Atualização PetFunny',
        title: event.title || 'Você tem uma novidade',
        text: event.text || 'Acompanhe os detalhes pelo app.',
        cta: event.url ? `<a class="btn btn-sm" href="${escapeHtml(event.url)}">${escapeHtml(event.ctaLabel || 'Ver detalhes')}</a>` : ''
      });
    });
    if (data.nextAppointment) {
      posts.push({ id: 'next-appointment', createdAt: data.nextAppointment.startsAt || new Date().toISOString(), icon: '📅', label: 'Lembrete de agenda', title: `Próximo cuidado de ${data.nextAppointment.petName}`, text: `${dateTime(data.nextAppointment.startsAt)} · ${data.nextAppointment.services || 'Serviços PetFunny'}`, cta: '<a class="btn btn-sm" href="/app/agenda">Ver agenda</a>' });
    } else {
      posts.push({ id: 'empty-appointment', createdAt: new Date().toISOString(), icon: '✨', label: 'IA PetFunny', title: 'Seu pet ainda não tem horário futuro', text: 'Agende banho, tosa ou hidratação pelo app e acompanhe tudo pela timeline.', cta: '<a class="btn btn-sm" href="/app/agenda">Agendar agora</a>' });
    }
    (data.health360Timeline || []).forEach((event, index) => {
      posts.push({
        id: event.id || `health360-${index}`,
        createdAt: event.createdAt || new Date().toISOString(),
        icon: event.icon || '🩺',
        label: event.label || 'Saúde 360',
        title: event.title || 'Atualização de saúde do pet',
        text: event.text || 'Acompanhe a evolução pelo Saúde 360.',
        cta: event.url ? `<a class="btn btn-sm btn-secondary" href="${escapeHtml(event.url)}">${escapeHtml(event.ctaLabel || 'Ver Saúde 360')}</a>` : '<a class="btn btn-sm btn-secondary" href="/app/saude-360">Ver Saúde 360</a>'
      });
    });
    posts.push({ id: 'timeline-teleconsulta-cta', createdAt: new Date().toISOString(), icon: '🩺', label: 'Teleconsulta veterinária', title: 'Fale com um veterinário parceiro', text: 'Quando houver dúvida sobre sintomas, comportamento ou evolução do pet, agende uma teleconsulta pelo Saúde 360.', cta: '<a class="btn btn-sm" href="/app/teleconsultas">Agendar teleconsulta</a>' });
    posts.push({ id: 'timeline-cuidados-cta', createdAt: new Date().toISOString(), icon: '🛁', label: 'Cuidados PetFunny', title: 'Banho, tosa e rotina preventiva', text: 'Mantenha os cuidados de banho, tosa, hidratação e pelagem atualizados para alimentar o histórico do pet.', cta: '<a class="btn btn-sm btn-secondary" href="/app/agenda">Agendar cuidado</a>' });
    if ((data.packages || []).length) {
      const pkg = data.packages[0];
      posts.push({ id: `package-${pkg.id}`, createdAt: pkg.startsOn || new Date().toISOString(), icon: '📦', label: 'Pacote ativo', title: `${pkg.name} · ${pkg.usedSessions} de ${pkg.totalSessions}`, text: `Restam ${pkg.remainingSessions} sessão(ões) para ${pkg.petName}. ${pkg.recurring ? 'Recorrência automática ativa.' : 'Recorrência não ativada.'}`, cta: '<a class="btn btn-sm btn-secondary" href="/app/pacotes">Acompanhar</a>' });
    } else {
      posts.push({ id: 'package-suggestion', createdAt: new Date().toISOString(), icon: '📦', label: 'Sugestão inteligente', title: 'Pacotes ajudam a manter recorrência', text: 'Contrate sessões recorrentes para banho e tosa com mais previsibilidade.', cta: '<a class="btn btn-sm btn-secondary" href="/app/pacotes">Ver pacotes</a>' });
    }
    if ((data.pets || []).some((pet) => !pet.restrictions && !pet.preferences)) {
      posts.push({ id: 'pets-complete-profile', createdAt: new Date().toISOString(), icon: '🐶', label: 'Cadastro do pet', title: 'Complete os cuidados do pet', text: 'Inclua preferências, restrições e observações para a equipe atender melhor.', cta: '<a class="btn btn-sm btn-secondary" href="/app/pets">Atualizar pets</a>' });
    }
    posts.push(...aiTimelinePosts());
    const unique = new Map();
    posts.forEach((post) => unique.set(post.id || `${post.title}-${post.createdAt}`, post));
    return [...unique.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function renderTimelineItems() {
    const posts = timelinePosts().slice(0, timelineVisibleCount);
    let lastDate = '';
    return posts.map((post) => {
      const key = timelineDateKey(post.createdAt);
      const separator = key !== lastDate ? `<div class="client-timeline-date-separator"><span>${timelineDateLabel(post.createdAt)}</span></div>` : '';
      lastDate = key;
      return `${separator}<article class="client-timeline-post"><div class="client-timeline-icon">${post.icon}</div><div><p class="eyebrow">${post.label}</p><h3>${post.title}</h3><p>${post.text}</p><div class="client-card-actions">${post.cta || ''}</div></div></article>`;
    }).join('');
  }


  function renderMeuPetHero() {
    const engagement = data.engagement || {};
    const rewards = data.rewards || engagement.rewards || {};
    const pet = engagement.activePet || (data.pets || [])[0] || null;
    const next = data.nextAppointment || null;
    const pkg = (data.packages || []).find((item) => item.status === 'active') || (data.packages || [])[0] || null;
    const status = engagement.customerStatus || { label: 'Cliente PetFunny', message: 'Acompanhe os cuidados pelo app.', tone: 'info' };
    const petPhoto = pet?.photoUrl ? `<img src="${escapeHtml(pet.photoUrl)}" alt="${escapeHtml(pet.name || 'Pet')}">` : `<span>${pet?.name ? escapeHtml(pet.name.slice(0, 1).toUpperCase()) : '🐶'}</span>`;
    const nextText = next ? `${dateTime(next.startsAt)} · ${escapeHtml(next.services || next.statusName || 'Atendimento PetFunny')}` : 'Nenhum cuidado agendado ainda';
    const pkgProgress = pkg ? `${Number(pkg.usedSessions || 0)} de ${Number(pkg.totalSessions || 0)} sessões usadas` : 'Nenhum pacote ativo';
    const points = Number(rewards.pointsBalance || 0);
    const goal = rewards.nextGoal || { remaining: 10, label: 'mimo PetFunny', progressPercent: 0 };
    return `
      <section class="client-meupet-hero">
        <div class="client-meupet-photo">${petPhoto}</div>
        <div class="client-meupet-copy">
          <p class="eyebrow">Clube PetFunny</p>
          <h2>${pet ? `${escapeHtml(pet.name)} está no Meu PetFunny` : 'Cadastre seu pet para começar'}</h2>
          <p class="client-hero-subtitle">${pet ? 'Acompanhe cada carinho, cada banho, cada mimo e cada cuidado em um só lugar.' : 'Depois de cadastrar, você acompanha agenda, pontos, mimos e histórico.'}</p>
        </div>
      </section>`;
  }

  function renderHomeEngagementGrid() {
    const engagement = data.engagement || {};
    const rewards = data.rewards || engagement.rewards || {};
    const next = data.nextAppointment || null;
    const pkg = (data.packages || []).find((item) => item.status === 'active') || (data.packages || [])[0] || null;
    const status = engagement.customerStatus || { label: 'Cliente PetFunny', message: 'Acompanhe os cuidados pelo app.', tone: 'info' };
    const nextText = next ? `${dateTime(next.startsAt)} · ${escapeHtml(next.services || next.statusName || 'Atendimento PetFunny')}` : 'Nenhum cuidado agendado ainda';
    const pkgProgress = pkg ? `${Number(pkg.usedSessions || 0)} de ${Number(pkg.totalSessions || 0)} sessões usadas` : 'Nenhum pacote ativo';
    const points = Number(rewards.pointsBalance || 0);
    const goal = rewards.nextGoal || { remaining: 10, label: 'mimo PetFunny', progressPercent: 0 };
    return `<section class="client-engagement-grid client-home-status-grid">
      <article class="client-engagement-card"><span>📅</span><small>Próximo cuidado</small><strong>${escapeHtml(next ? next.statusName || 'Agendado' : 'Aguardando')}</strong><p>${nextText}</p></article>
      <article class="client-engagement-card"><span>📦</span><small>Pacote ativo</small><strong>${escapeHtml(pkg?.name || 'Conheça os pacotes')}</strong><p>${escapeHtml(pkgProgress)}</p></article>
      <article class="client-engagement-card client-bones-card"><span>🦴</span><small>Ossinhos PetFunny</small><strong>${points}</strong><p>Faltam ${Number(goal.remaining || 0)} para ${escapeHtml(goal.label || 'novo mimo')}.</p><div class="client-reward-bar"><i style="width:${Number(goal.progressPercent || 0)}%"></i></div></article>
      <article class="client-engagement-card"><span>🏅</span><small>Status do tutor</small><strong>${escapeHtml(status.label || 'Cliente PetFunny')}</strong><p>${escapeHtml(status.message || 'Continue cuidando do seu pet pelo app.')}</p></article>
    </section>`;
  }

  function renderRewardsEventsMini() {
    const events = (data.rewards?.events || data.engagement?.rewards?.events || []).slice(0, 4);
    if (!events.length) return '<p class="client-muted">Você começa a ganhar ossinhos ao agendar, concluir atendimentos, comprar pacotes e compartilhar momentos.</p>';
    return `<div class="client-reward-events">${events.map((event) => `<div><strong>+${Number(event.points || 0)} 🦴</strong><span>${escapeHtml(event.description || event.type || 'Evento PetFunny')}</span></div>`).join('')}</div>`;
  }

  function renderCareInsightCard() {
    const pet = data.engagement?.activePet || (data.pets || [])[0] || null;
    const insight = data.careInsight || data.engagement?.careInsight || null;
    if (!pet && !insight) return '';
    const title = insight?.title || 'Dica de cuidado PetFunny';
    const message = insight?.message || `${pet?.name || 'Seu pet'} pode ter uma rotina mais completa com banho, tosa, Saúde 360 e acompanhamento preventivo.`;
    const priority = insight?.priority || 'normal';
    const ctaLabel = insight?.ctaLabel || 'Agendar cuidado';
    const url = insight?.url || (insight?.ctaAction === 'teleconsultation' ? '/app/teleconsultas' : '/app/agenda');
    const facts = Array.isArray(insight?.facts) ? insight.facts.slice(0, 3) : [];
    return `<section class="client-mobile-section client-care-insight-card ${escapeHtml(priority)}">
      <div class="client-section-title compact"><h2>IA de Cuidados</h2><p>Recomendação personalizada por raça, porte, pelagem e Saúde 360.</p></div>
      <article class="client-list-card client-care-insight-body">
        <div class="client-list-icon">🧠</div>
        <div class="client-list-body">
          <div class="client-list-title-row"><h3>${escapeHtml(title)}</h3><span class="client-badge light">${escapeHtml(priority === 'high' ? 'Prioridade alta' : priority === 'attention' ? 'Atenção' : 'Cuidado')}</span></div>
          <p>${escapeHtml(message)}</p>
          ${facts.length ? `<div class="client-care-tags">${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join('')}</div>` : ''}
          <div class="client-card-actions"><a class="btn btn-sm" href="${escapeHtml(url)}">${escapeHtml(ctaLabel)}</a><a class="btn btn-sm btn-secondary" href="/app/saude-360">Ver Saúde 360</a></div>
        </div>
      </article>
    </section>`;
  }


  function appointmentTimelineSteps(appointment = {}) {
    const status = String(appointment.status || '').toLowerCase();
    const order = ['agendado', 'confirmado', 'recebido', 'em_atendimento', 'secagem', 'tosa', 'finalizando', 'finalizado', 'entregue'];
    const labelMap = {
      agendado: ['📅', 'Agendamento confirmado', 'Seu horário foi registrado no PetFunny.'],
      confirmado: ['✅', 'PetFunny confirmou', 'A equipe já está esperando vocês.'],
      recebido: ['🐾', 'Pet chegou', 'Check-in realizado com carinho.'],
      em_atendimento: ['🛁', 'Banho iniciado', 'Cuidado em andamento.'],
      secagem: ['🌬️', 'Secagem em andamento', 'Conforto e segurança antes da finalização.'],
      tosa: ['✂️', 'Tosa iniciada', 'Etapa de acabamento e higiene.'],
      finalizando: ['🌸', 'Finalizando perfume', 'Últimos detalhes antes da retirada.'],
      finalizado: ['✨', 'Pronto para buscar', 'Seu pet está pronto e cheiroso.'],
      entregue: ['💚', 'Entregue ao tutor', 'Atendimento concluído.']
    };
    let currentIndex = status === 'cancelado' ? 1 : order.indexOf(status);
    if (currentIndex < 0) {
      if (['em_servico','em serviço'].includes(status)) currentIndex = 3;
      else if (['concluido','concluído','completed'].includes(status)) currentIndex = 7;
      else currentIndex = appointment.startsAt && new Date(appointment.startsAt) < new Date() ? 2 : 1;
    }
    return order.map((key, index) => ({ key, icon: labelMap[key][0], title: labelMap[key][1], text: labelMap[key][2], done: index <= currentIndex, active: index === currentIndex }));
  }

  function renderDetailedAppointmentTimeline(appointment = {}) {
    const steps = appointmentTimelineSteps(appointment);
    return `<div class="client-service-timeline detailed">${steps.map((step) => `<div class="client-service-step ${step.done ? 'is-done' : ''} ${step.active ? 'is-active' : ''}"><span>${step.icon}</span><div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.text)}</small></div></div>`).join('')}</div>`;
  }

  function renderMomentsPreview() {
    const media = (data.mediaPreview || []).slice(0, 4);
    if (!media.length) {
      return `<section class="client-mobile-section"><div class="client-section-title"><h2>Momentos do atendimento</h2><p>Fotos e vídeos do pet aparecem aqui depois dos cuidados.</p></div>${empty('📸', 'Momentos chegando', 'Depois do próximo banho, os melhores momentos do seu pet aparecem aqui.')}</section>`;
    }
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Momentos do atendimento</h2><a class="btn btn-sm btn-secondary" href="/app/momentos">Ver todos</a></div><div class="client-moments-grid mini">${media.map(renderMomentMediaCard).join('')}</div></section>`;
  }

  function renderMomentMediaCard(item = {}) {
    const isVideo = String(item.mediaType || item.media_type || '').toLowerCase() === 'video';
    const url = item.url || '';
    const caption = item.caption || (isVideo ? 'Vídeo do atendimento' : 'Momento PetFunny');
    const focusId = new URLSearchParams(window.location.search).get('focus') || '';
    const itemId = item.id || item.mediaId || '';
    const focusedClass = focusId && String(focusId) === String(itemId) ? ' is-focus-moment' : '';
    return `<article class="client-moment-card${focusedClass}" id="moment-${escapeHtml(itemId)}"><div class="client-moment-media">${url ? (isVideo ? `<video src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>` : `<img src="${escapeHtml(url)}" alt="${escapeHtml(caption)}">`) : '<span>📸</span>'}</div><div class="client-moment-copy"><strong>${escapeHtml(item.petName || item.pet_name || 'PetFunny')}</strong><p>${escapeHtml(caption)}</p><small>${shortDate(item.createdAt || item.created_at)}</small><div class="client-card-actions"><a class="btn btn-sm btn-secondary" href="${escapeHtml(url || '#')}" ${url ? 'download target="_blank" rel="noopener"' : ''}>Salvar</a><button class="btn btn-sm" type="button" data-share-moment="${escapeHtml(url)}" data-share-caption="${escapeHtml(caption)}">Compartilhar</button>${itemId ? `<button class="btn btn-sm btn-danger-soft" type="button" data-delete-moment="${escapeHtml(itemId)}">Apagar</button>` : ''}</div></div></article>`;
  }

  function renderMomentos() {
    const pets = data.pets || [];
    const selectedPetId = new URLSearchParams(window.location.search).get('petId') || pets[0]?.id || '';
    const media = (data.mediaPreview || []).filter((item) => !selectedPetId || String(item.petId || item.pet_id || '') === String(selectedPetId));
    const latest = [...(data.upcomingAppointments || []), ...(data.history || [])].find((item) => !selectedPetId || String(item.petId || item.pet_id || '') === String(selectedPetId)) || null;
    return `<section class="client-mobile-section client-moments-pet-selector"><div class="client-section-title"><h2>Escolha o pet</h2><p>Veja fotos, vídeos e lembranças separados por pet.</p></div>
      <div class="client-field client-pet-picker-field"><span>Pet dos momentos</span>${renderAppointmentPetPicker(selectedPetId, { inputName: 'momentsPetId', returnSection: 'momentos' })}</div>
    </section>
    <section class="client-mobile-section"><div class="client-section-title"><h2>Momentos do atendimento</h2><p>Fotos, vídeos e lembranças afetivas dos cuidados PetFunny.</p></div>${media.length ? `<div class="client-moments-grid">${media.map(renderMomentMediaCard).join('')}</div>` : empty('📸', 'Nenhum momento publicado ainda', 'Depois do próximo banho, os melhores momentos deste pet aparecem aqui.')}</section>
    <section class="client-mobile-section"><div class="client-section-title"><h2>Timeline do cuidado</h2><p>Acompanhe cada carinho, cada etapa e cada finalização.</p></div>${latest ? `<article class="client-list-card client-moment-timeline-card"><div class="client-list-icon client-pet-mini-avatar">${latest.petPhotoUrl ? `<img src="${escapeHtml(latest.petPhotoUrl)}" alt="${escapeHtml(latest.petName || 'Pet')}">` : '🐶'}</div><div class="client-list-body"><h3>${escapeHtml(latest.petName || 'Pet')}</h3><p>${escapeHtml(latest.services || 'Atendimento PetFunny')} · ${dateTime(latest.startsAt)}</p>${renderDetailedAppointmentTimeline(latest)}</div></article>` : empty('🛁', 'Sem atendimento ativo', 'Quando houver agendamento, a timeline detalhada aparece aqui.')}</section>
    <div class="client-moment-floating-upload">
      <input id="moment-upload-input" type="file" accept="image/*,video/*" capture="environment" data-moment-upload-input data-pet-id="${escapeHtml(selectedPetId || '')}" hidden>
      <button class="client-moment-camera-btn" type="button" data-open-moment-camera ${selectedPetId ? '' : 'disabled'} aria-label="Bater foto ou enviar momento">📸</button>
    </div>`;
  }

  function lazyHomeBlock(html = '', index = 0) {
    return `<div class="client-home-lazy" data-home-lazy data-lazy-index="${index}">${html}</div>`;
  }

  function renderHomeReferralCta() {
    const referral = data.referral || data.engagement?.referral || {};
    const shareLink = referral.shareLink || 'https://agendapetfunny.com.br/app';
    const whatsappUrl = referral.whatsappUrl || `https://wa.me/?text=${encodeURIComponent('Conheça o Clube PetFunny: ' + shareLink)}`;
    return `<section class="client-home-referral-cta">
      <div>
        <span>🎁</span>
        <strong>Indique e ganhe!</strong>
        <p>Convide amigos para conhecer o PetFunny e acompanhe seus benefícios pelo Clube PetFunny.</p>
      </div>
      <a class="btn btn-sm" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener">Compartilhar</a>
    </section>`;
  }

  function renderHome() {
    const quickAccess = `<section class="client-mobile-section client-quick-access-section"><div class="client-section-title"><h2>O que você deseja?</h2><p>Escolha uma ação rápida para cuidar melhor do seu pet.</p></div>${clientCards()}</section>`;
    const bigNumbers = `<div class="client-kpi-grid client-home-big-numbers"><article><strong>${data.stats.pets}</strong><span>pets cadastrados</span></article><article><strong>${data.stats.upcomingAppointments}</strong><span>próximos horários</span></article><article><strong>${data.stats.activePackages}</strong><span>pacotes ativos</span></article></div>`;
    const timeline = `<section class="client-mobile-section client-home-timeline-section"><div class="client-section-title"><h2>Timeline do cuidado</h2><p>Atualizações do app carregam conforme você rola.</p></div><section class="client-timeline" id="client-timeline-list">${renderTimelineItems()}</section><div class="client-timeline-loader" id="client-timeline-loader">Carregando mais atualizações...</div><div class="client-timeline-sentinel" id="client-timeline-sentinel" aria-hidden="true"></div></section>`;
    return [
      renderMeuPetHero(),
      quickAccess,
      bigNumbers,
      renderHomeEngagementGrid(),
      renderHomeReferralCta(),
      renderPushActivationCard(),
      renderCareInsightCard(),
      renderMomentsPreview(),
      timeline
    ].filter(Boolean).join('');
  }

  function renderAgenda() {
    const roletaContext = getRoletaScheduleContext();
    const promotionContext = getPromotionScheduleContext();
    const promo = promotionContext?.promo || null;
    const petOpts = (data.pets || []).map((pet) => ({ value: pet.id, label: `${pet.name}${pet.size ? ` · ${pet.size}` : ''}` }));
    const collaboratorOpts = options.collaborators.map((c) => ({ value: c.id, label: c.name }));
    const firstPet = roletaContext?.petId || data.pets?.[0]?.id || '';
    const serviceList = serviceOptionsForPet(firstPet);
    const roletaNote = roletaContext ? `🎁 Mimo ganho na Roleta PetFunny: ${roletaContext.giftTitle}${roletaContext.giftDescription ? ` — ${roletaContext.giftDescription}` : ''}` : '';
    const initialDate = nextPromotionAllowedDate(promo, initialScheduleDate());
    const promoBanner = promo ? `<article class="client-promo-selected-banner" data-selected-promo-id="${escapeHtml(promo.id)}"><span>🏷️ Promoção selecionada</span><strong>${escapeHtml(promo.title)}</strong><small>${Number(promo.discountPercent || 0)}% OFF · válida em ${escapeHtml(promotionAllowedDaysText(promo))}</small></article>` : '';
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Novo agendamento</h2></div>
      ${promoBanner}
      <form class="client-form-card" id="appointment-form" data-promo-id="${escapeHtml(promo?.id || '')}">
        <div class="client-field client-pet-picker-field"><span>Escolha seu pet</span>${renderAppointmentPetPicker(firstPet)}</div>
        ${selectField('Colaborador preferido', 'collaboratorId', collaboratorOpts, '', 'Sem preferência')}
        ${field('Data do atendimento', 'appointmentDate', initialDate, `type="date" min="${today()}"`)}
        <label class="client-field"><span>Horário disponível</span><select name="appointmentTime" id="appointment-time"><option value="">Carregando horários...</option></select><small class="client-field-hint" id="appointment-time-hint">Os horários seguem as Configurações do admin.</small></label>
        <div class="client-field"><span>Serviços</span><div class="client-check-list" id="services-list">${renderServiceChecks(serviceList)}</div></div>
        ${renderTransportEstimateBox()}
        <input type="hidden" name="transportRequested" value="false">
        <input type="hidden" name="transportFeeCents" value="0">
        <input type="hidden" name="transportSummary" value="">
        ${textArea('Observações para a equipe', 'notes', roletaNote)}
        ${paymentMethodChoicesHtml({ fieldName: 'paymentType', selected: 'pix' })}
        <button class="btn" type="submit">Criar agendamento</button>
      </form>
    </section>`;
  }

  function appointmentDateParts(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return { day: '--', month: '---', weekday: 'Data', time: '--:--' };
    }
    const day = date.toLocaleDateString('pt-BR', { day: '2-digit' });
    const month = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { day, month, weekday, time };
  }

  function renderTutorAppointmentCard(item = {}, mode = 'upcoming') {
    const parts = appointmentDateParts(item.startsAt);
    const status = item.statusName || item.status || (mode === 'history' ? 'Finalizado' : 'Agendado');
    const statusClass = String(item.status || status || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
    return `<article class="client-tutor-appointment-card ${escapeHtml(statusClass)}">
      <div class="client-tutor-appointment-date">
        <small>${escapeHtml(parts.weekday)}</small>
        <strong>${escapeHtml(parts.day)}</strong>
        <span>${escapeHtml(parts.month)}</span>
      </div>
      <div class="client-tutor-appointment-info">
        <div class="client-list-title-row">
          <h3>${escapeHtml(item.petName || 'PetFunny')}</h3>
          <span class="client-badge" style="--badge-color:${escapeHtml(item.statusColor || '#01ADB7')}">${escapeHtml(status)}</span>
        </div>
        <p class="client-main-date">${escapeHtml(parts.time)} · ${escapeHtml(item.services || 'Serviços PetFunny')}</p>
        <div class="client-chip-row">
          ${item.customerPackageId ? `<span class="client-badge package">📦 ${escapeHtml(item.packageSessionLabel || `${item.packageSessionNumber || '?'} de ${item.packageTotalSessions || '?'}`)}</span>` : ''}
          ${item.totalCents ? `<span class="client-badge light">${money(item.totalCents)}</span>` : ''}
          ${item.collaboratorName ? `<span class="client-badge light">${escapeHtml(item.collaboratorName)}</span>` : ''}
        </div>
        <div class="client-card-actions">
          ${item.commandUrl ? `<a class="btn btn-secondary btn-sm" target="_blank" href="${escapeHtml(item.commandUrl)}">Comanda</a>` : ''}
          ${item.receiptUrl ? `<a class="btn btn-secondary btn-sm" target="_blank" href="${escapeHtml(item.receiptUrl)}">Recibo</a>` : ''}
          <a class="btn btn-sm" href="https://wa.me/5516981535338?text=${encodeURIComponent('Olá, PetFunny! Quero falar sobre meu agendamento de ' + dateTime(item.startsAt))}" target="_blank" rel="noopener">WhatsApp</a>
        </div>
      </div>
    </article>`;
  }

  function renderMeusAgendamentos() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') === 'historico' ? 'historico' : 'proximos';
    const appointments = tab === 'historico' ? (data.history || []) : (data.upcomingAppointments || []);
    const emptyState = tab === 'historico'
      ? empty('📄', 'Sem histórico ainda', 'Depois do primeiro atendimento, os registros aparecem aqui.')
      : empty('📅', 'Nenhum próximo agendamento', 'Toque em Novo Agendamento para escolher pet, serviço, data e horário.');
    return `<section class="client-mobile-section client-appointments-screen">
      <div class="client-section-title"><h2>Meus Agendamentos</h2><p>Veja os próximos cuidados e o histórico do seu pet em cards simples.</p></div>
      <div class="client-appointment-tabs" role="tablist" aria-label="Filtro de agendamentos">
        <a class="${tab === 'proximos' ? 'is-active' : ''}" href="/app/agendamentos?tab=proximos" role="tab" aria-selected="${tab === 'proximos'}">Próximos</a>
        <a class="${tab === 'historico' ? 'is-active' : ''}" href="/app/agendamentos?tab=historico" role="tab" aria-selected="${tab === 'historico'}">Histórico</a>
      </div>
      <div class="client-tutor-appointment-list">${appointments.length ? appointments.map((item) => renderTutorAppointmentCard(item, tab === 'historico' ? 'history' : 'upcoming')).join('') : emptyState}</div>
    </section>
    <section class="client-agendamentos-new-cta"><a class="btn" href="/app/agenda">Novo Agendamento</a></section>`;
  }

  function renderServiceChecks(services = []) {
    if (!services.length) return '<p class="client-muted">Nenhum serviço encontrado para o porte do pet.</p>';
    const bathSelected = hasBathSelected(document);
    const groups = services.reduce((acc, service) => {
      const key = service.categoryName || service.category || 'Serviços PetFunny';
      if (!acc[key]) acc[key] = [];
      acc[key].push(service);
      return acc;
    }, {});
    return Object.entries(groups).map(([category, items]) => `<section class="client-service-group ${String(category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('tosa') ? 'is-tosa-group' : ''}">
      <div class="client-service-group-title"><span>${escapeHtml(category)}</span><small>${items.length} serviço(s)</small></div>
      <div class="client-service-group-list">
        ${items.map((service) => {
          const promo = activePromotionForService(service, document.querySelector('[name="petId"]')?.value || data.pets?.[0]?.id || '', document.querySelector('[name="appointmentDate"]')?.value || today());
          const promoLabel = promo ? `<em class="client-promo-inline">🏷️ ${Number(promo.discountPercent || 0)}% OFF automático</em>` : '';
          const serviceDescription = String(service.description || service.shortDescription || service.summary || service.notes || '').trim();
          const descriptionHtml = serviceDescription ? `<span class="client-service-description">${escapeHtml(serviceDescription)}</span>` : `<span class="client-service-description muted">Cuidado PetFunny com padrão premium para o bem-estar do seu pet.</span>`;
          const kind = isBathService(service) ? 'banho' : isTosaService(service) ? 'tosa' : 'outro';
          const lockedTosa = kind === 'tosa' && !bathSelected;
          const lockNote = lockedTosa ? '<em class="client-service-locked-note">Selecione um banho para liberar a tosa.</em>' : '';
          return `<label class="${lockedTosa ? 'is-disabled service-requires-bath' : ''}" data-service-kind="${kind}"><input type="checkbox" name="serviceIds" value="${service.id}" data-service-kind="${kind}" ${lockedTosa ? 'disabled' : ''}><span><strong>${escapeHtml(service.name)}</strong>${descriptionHtml}<small>${money(service.priceCents)} ${promoLabel}</small>${lockNote}</span></label>`;
        }).join('')}
      </div>
    </section>`).join('');
  }

  function syncTosaServiceAvailability() {
    const list = document.getElementById('services-list');
    if (!list) return;
    const bathSelected = hasBathSelected(list);
    list.querySelectorAll('input[name="serviceIds"][data-service-kind="tosa"]').forEach((input) => {
      const label = input.closest('label');
      const note = label?.querySelector('.client-service-locked-note');
      if (bathSelected) {
        input.disabled = false;
        label?.classList.remove('is-disabled', 'service-requires-bath');
        if (note) note.remove();
      } else {
        input.checked = false;
        input.disabled = true;
        label?.classList.add('is-disabled', 'service-requires-bath');
        if (label && !note) label.querySelector('span')?.insertAdjacentHTML('beforeend', '<em class="client-service-locked-note">Selecione um banho para liberar a tosa.</em>');
      }
    });
  }




  function appDigitalWalletSupported() {
    const ua = navigator.userAgent || '';
    const hasPaymentRequest = typeof window.PaymentRequest === 'function';
    const isLikelyGooglePayBrowser = /Android|Chrome|CriOS|Edg/i.test(ua);
    return Boolean(window.isSecureContext && hasPaymentRequest && isLikelyGooglePayBrowser);
  }

  function paymentMethodChoicesHtml({ fieldName = 'paymentType', selected = 'pix', selectMode = false } = {}) {
    const walletSelected = selected === 'wallet';
    const walletHidden = appDigitalWalletSupported() ? '' : ' hidden';
    if (selectMode) {
      return `<label class="client-field"><span>Pagamento</span><select name="${fieldName}">
        <option value="pix" ${selected === 'pix' ? 'selected' : ''}>Pix</option>
        <option value="card" ${selected === 'card' ? 'selected' : ''}>Cartão</option>
        ${appDigitalWalletSupported() ? `<option value="wallet" ${walletSelected ? 'selected' : ''}>Google Pay / carteira digital</option>` : ''}
      </select><small class="client-field-hint">Google Pay aparece somente quando o navegador/dispositivo oferece suporte.</small></label>`;
    }
    return `<div class="client-field"><span>Forma de pagamento</span><div class="client-check-list client-payment-method-list">
      <label><input type="radio" name="${fieldName}" value="pix" ${selected === 'pix' ? 'checked' : ''}><span><strong>Pix</strong><small>QR Code e copia e cola.</small></span></label>
      <label><input type="radio" name="${fieldName}" value="card" ${selected === 'card' ? 'checked' : ''}><span><strong>Cartão de crédito ou débito</strong><small>Pagamento seguro dentro do app.</small></span></label>
      <label class="client-wallet-option" data-wallet-payment-option${walletHidden}><input type="radio" name="${fieldName}" value="wallet" ${walletSelected ? 'checked' : ''}><span><strong>Google Pay / carteira digital</strong><small>Aparece somente quando disponível neste aparelho.</small></span></label>
    </div><small class="client-field-hint" data-wallet-payment-hint${walletHidden}>Carteira digital detectada neste navegador. Se a carteira não estiver disponível para sua conta, use cartão ou Pix.</small></div>`;
  }

  function syncDigitalWalletPaymentOptions(root = document) {
    const supported = appDigitalWalletSupported();
    root.querySelectorAll('[data-wallet-payment-option], [data-wallet-payment-hint]').forEach((el) => {
      if (supported) el.removeAttribute('hidden');
      else {
        el.setAttribute('hidden', 'hidden');
        const input = el.querySelector?.('input[value="wallet"]');
        if (input?.checked) {
          const form = input.closest('form');
          const fallback = form?.querySelector('input[name="paymentType"][value="pix"], input[name="paymentMethod"][value="pix"]');
          if (fallback) fallback.checked = true;
        }
      }
    });
  }


  function setupHomeInfiniteReveal() {
    const blocks = Array.from(document.querySelectorAll('[data-home-lazy]'));
    if (!blocks.length) return;
    blocks.forEach((block, index) => {
      block.classList.toggle('is-visible', index < 3);
    });
    const revealNext = (count = 2) => {
      const hidden = blocks.filter((block) => !block.classList.contains('is-visible')).slice(0, count);
      hidden.forEach((block) => block.classList.add('is-visible'));
    };
    const sentinel = document.getElementById('client-home-lazy-sentinel') || document.createElement('div');
    sentinel.id = 'client-home-lazy-sentinel';
    sentinel.className = 'client-home-lazy-sentinel';
    document.querySelector('.client-mobile-content')?.appendChild(sentinel);
    if (!('IntersectionObserver' in window)) {
      blocks.forEach((block) => block.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) revealNext(2);
      if (blocks.every((block) => block.classList.contains('is-visible'))) observer.disconnect();
    }, { rootMargin: '180px 0px' });
    observer.observe(sentinel);
    window.setTimeout(() => revealNext(1), 350);
  }

  function queueAiPushReminder(insight = null) {
    if (!insight || window.__petfunnyAiPushReminderQueued) return;
    window.__petfunnyAiPushReminderQueued = true;
    clientApi.post('/app/ai-push-reminder', {
      title: insight.title || 'Dica de cuidado PetFunny',
      message: insight.message || 'A IA PetFunny gerou uma nova recomendação para o seu pet.',
      url: insight.url || '/app/teleconsultas',
      petId: insight.petId || data.engagement?.activePet?.id || data.pets?.[0]?.id || ''
    }).catch(() => null);
  }

  function breedDatalistHtml() {
    return `<datalist id="app-pet-breed-list">${(options.petBreeds || []).map((breed) => `<option value="${escapeHtml(breed.name)}" data-size="${escapeHtml(breed.suggestedSizeCode || '')}" data-coat="${escapeHtml(breed.coatType || '')}"></option>`).join('')}</datalist>`;
  }

  function applyAppBreedSuggestion(form) {
    const breedInput = form?.querySelector('[name="breed"]');
    const sizeSelect = form?.querySelector('[name="size"]');
    const coatInput = form?.querySelector('[name="coatType"]');
    const selected = (options.petBreeds || []).find((breed) => String(breed.name || '').toLowerCase() === String(breedInput?.value || '').toLowerCase());
    if (!selected) return;
    if (selected.suggestedSizeCode && sizeSelect) sizeSelect.value = selected.suggestedSizeCode;
    if (selected.coatType && coatInput && !coatInput.value) coatInput.value = selected.coatType;
  }


  function currentPetRoute() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const index = parts.indexOf('pets');
    return {
      petId: index >= 0 ? decodeURIComponent(parts[index + 1] || '') : '',
      area: index >= 0 ? decodeURIComponent(parts[index + 2] || '') : ''
    };
  }

  function selectedPetFromRoute() {
    const route = currentPetRoute();
    return (data.pets || []).find((pet) => String(pet.id) === String(route.petId)) || null;
  }

  function petDetailHref(pet, area = '') {
    const base = `/app/pets/${encodeURIComponent(pet.id)}`;
    return area ? `${base}/${encodeURIComponent(area)}` : base;
  }

  function renderSelectedPetHero(pet) {
    const initials = String(pet.name || 'P').slice(0, 1).toUpperCase();
    const photo = pet.photoUrl ? `<img src="${escapeHtml(pet.photoUrl)}" alt="${escapeHtml(pet.name || 'Pet')}">` : `<span>${escapeHtml(initials)}</span>`;
    return `<section class="client-pet-detail-hero">
      <div class="client-pet-detail-photo">${photo}</div>
      <div class="client-pet-detail-copy">
        <p class="eyebrow">Meu PetFunny</p>
        <h2>${escapeHtml(pet.name || 'Pet')}</h2>
        <p>${escapeHtml([pet.breed, pet.size, pet.coatType].filter(Boolean).join(' · ') || 'Cadastro ativo no Clube PetFunny')}</p>
      </div>
      <button class="client-pet-edit-icon" data-edit-pet="${escapeHtml(pet.id)}" type="button" aria-label="Editar pet">✎</button>
    </section>`;
  }

  function renderSelectedPetMenu(pet) {
    const cards = [
      ['dados', '🐶', 'Dados do Pet', 'Nome, raça, porte, pelagem, peso e observações principais.'],
      ['servicos', '🛁', 'Histórico de Serviços', 'Banhos, tosas, hidratações e registros manuais.'],
      ['vacinas', '💉', 'Histórico de Vacinas', 'Carteira de vacinação, doses e próximos reforços.'],
      ['alergias', '⚠️', 'Alergias e observações', 'Restrições, cuidados especiais e alertas importantes.'],
      ['documentos', '📎', 'Documentos', 'Envie carteirinha, laudos, exames e outros arquivos do pet.']
    ];
    return `<section class="client-mobile-section client-pet-detail-menu"><div class="client-section-title"><h2>Informações do pet</h2><p>Escolha uma área para visualizar, cadastrar e atualizar os dados.</p></div>
      <div class="client-pet-feature-list">${cards.map(([area, icon, title, text]) => `<a class="client-pet-feature-card" href="${petDetailHref(pet, area)}"><span>${icon}</span><div><strong>${title}</strong><small>${text}</small></div><i>›</i></a>`).join('')}</div>
    </section>`;
  }

  function petRecordTypeForArea(area = '') {
    const map = { servicos: 'SERVICE', vacinas: 'VACCINE', alergias: 'ALLERGY', documentos: 'DOCUMENT' };
    return map[area] || 'NOTE';
  }

  function petAreaTitle(area = '') {
    const map = {
      dados: ['Dados do Pet', 'Atualize os dados principais do cadastro.'],
      servicos: ['Histórico de Serviços', 'Registre serviços importantes e acompanhe os atendimentos anteriores.'],
      vacinas: ['Histórico de Vacinas', 'Cadastre vacinas, doses, validade e próximos reforços.'],
      alergias: ['Alergias e observações', 'Registre alergias, restrições, preferências e cuidados especiais.'],
      documentos: ['Documentos', 'Envie carteirinha, exames, laudos e documentos do pet.']
    };
    return map[area] || ['Meu Pet', 'Informações do pet.'];
  }

  function renderPetDadosScreen(pet) {
    return `<section class="client-mobile-section client-pet-subscreen"><div class="client-section-title"><a class="client-back-link" href="${petDetailHref(pet)}">← Voltar</a><h2>Dados do Pet</h2><p>Atualize informações usadas pela equipe no atendimento.</p></div>${petForm(pet)}</section>`;
  }

  function renderServiceAppointmentHistory(pet) {
    const history = (data.history || []).filter((item) => String(item.petId || item.pet_id || '') === String(pet.id)).slice(0, 8);
    if (!history.length) return '';
    return `<section class="client-pet-history-mini"><h3>Atendimentos anteriores</h3><div class="client-list-stack">${history.map((item) => renderTutorAppointmentCard(item, 'history')).join('')}</div></section>`;
  }

  function petRecordFormHtml({ petId, type, area, record = {} } = {}) {
    const isDocument = type === 'DOCUMENT';
    const titleLabel = isDocument ? 'Nome do documento' : type === 'VACCINE' ? 'Nome da vacina' : type === 'ALLERGY' ? 'Título da observação' : 'Título do registro';
    const descLabel = isDocument ? 'Descrição' : type === 'VACCINE' ? 'Dose, lote, clínica e próximo reforço' : type === 'ALLERGY' ? 'Detalhes, reação e cuidados necessários' : 'Descrição';
    const occurred = record.occurredAt ? String(record.occurredAt).slice(0, 10) : today();
    return `<form class="client-form-grid" id="pet-record-form" data-pet-id="${escapeHtml(petId)}" data-record-id="${escapeHtml(record.id || '')}" data-record-type="${escapeHtml(type)}" data-area="${escapeHtml(area)}">
      ${field(titleLabel, 'title', record.title || '')}
      ${textArea(descLabel, 'description', record.description || '')}
      ${field(isDocument ? 'Data do documento' : 'Data do registro', 'occurredAt', occurred, 'type="date"')}
      ${isDocument ? `<label class="client-field"><span>Upload do documento</span><input type="file" data-document-input="fileDataUrl" accept="image/*,.pdf,.doc,.docx"><input type="hidden" name="fileDataUrl" value="${escapeHtml(record.fileDataUrl || '')}"><input type="hidden" name="fileName" value="${escapeHtml(record.fileName || '')}"><small class="client-field-hint">PDF, imagem ou documento leve. O arquivo fica vinculado ao pet.</small><div class="client-document-preview">${record.fileName ? `Arquivo atual: ${escapeHtml(record.fileName)}` : 'Nenhum arquivo selecionado.'}</div></label>` : ''}
      <button class="btn" type="submit">Salvar registro</button>
    </form>`;
  }

  function renderPetRecordCard(record = {}) {
    const isDocument = String(record.type || '').toUpperCase() === 'DOCUMENT';
    const hasFile = isDocument && record.fileDataUrl;
    return `<article class="client-list-card client-pet-record-card" data-record-card="${escapeHtml(record.id || '')}">
      <div class="client-list-icon">${isDocument ? '📎' : String(record.type || '').toUpperCase() === 'VACCINE' ? '💉' : String(record.type || '').toUpperCase() === 'ALLERGY' ? '⚠️' : '🛁'}</div>
      <div class="client-list-body">
        <div class="client-list-title-row"><h3>${escapeHtml(record.title || 'Registro do pet')}</h3><span class="client-badge light">${shortDate(record.occurredAt || record.createdAt)}</span></div>
        ${record.description ? `<p>${escapeHtml(record.description)}</p>` : ''}
        ${hasFile ? `<a class="client-document-link" href="${escapeHtml(record.fileDataUrl)}" target="_blank" rel="noopener">Abrir documento: ${escapeHtml(record.fileName || 'arquivo')}</a>` : ''}
        <div class="client-card-actions"><button class="btn btn-secondary btn-sm" type="button" data-edit-pet-record="${escapeHtml(record.id)}">Editar</button><button class="btn btn-ghost btn-sm" type="button" data-delete-pet-record="${escapeHtml(record.id)}">Excluir</button></div>
      </div>
    </article>`;
  }

  function renderPetRecordsScreen(pet, area) {
    const [title, subtitle] = petAreaTitle(area);
    const type = petRecordTypeForArea(area);
    const appointmentHistory = area === 'servicos' ? renderServiceAppointmentHistory(pet) : '';
    return `<section class="client-mobile-section client-pet-subscreen"><div class="client-section-title"><a class="client-back-link" href="${petDetailHref(pet)}">← Voltar</a><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>
      ${appointmentHistory}
      <button class="btn client-full-btn" type="button" data-new-pet-record="${escapeHtml(type)}" data-record-area="${escapeHtml(area)}" data-pet-id="${escapeHtml(pet.id)}">Novo registro</button>
      <div class="client-list-stack" id="pet-records-list" data-pet-id="${escapeHtml(pet.id)}" data-record-type="${escapeHtml(type)}" data-record-area="${escapeHtml(area)}"><div class="client-loading-inline">Carregando registros...</div></div>
    </section>`;
  }

  function renderSelectedPetPage(pet, area = '') {
    if (!pet) return `<section class="client-mobile-section">${empty('🐶', 'Pet não encontrado', 'Volte para a lista de pets e selecione novamente.')}</section>`;
    if (area === 'dados') return renderPetDadosScreen(pet);
    if (['servicos','vacinas','alergias','documentos'].includes(area)) return `${renderSelectedPetHero(pet)}${renderPetRecordsScreen(pet, area)}`;
    return `${renderSelectedPetHero(pet)}${renderSelectedPetMenu(pet)}`;
  }

  function renderEditablePetCard(pet) {
    const initials = String(pet.name || 'P').slice(0, 1).toUpperCase();
    return `<article class="client-pet-card client-pet-card-editable">
      <div class="client-pet-avatar">${pet.photoUrl ? `<img src="${escapeHtml(pet.photoUrl)}" alt="${escapeHtml(pet.name)}">` : `<span>${escapeHtml(initials)}</span>`}</div>
      <div class="client-pet-info">
        <h3>${escapeHtml(pet.name || 'Pet')}</h3>
        <p>${escapeHtml([pet.breed, pet.size].filter(Boolean).join(' · ') || 'Cadastro ativo')}</p>
        ${pet.restrictions ? `<div class="client-alert-mini">Atenção: ${escapeHtml(pet.restrictions)}</div>` : ''}
      </div>
      <div class="client-pet-inline-actions">
        <a class="btn btn-sm" href="/app/pets/${encodeURIComponent(pet.id)}">Selecionar</a>
        <button class="btn btn-secondary btn-sm" data-edit-pet="${escapeHtml(pet.id)}" type="button">Editar</button>
        <button class="btn btn-ghost btn-sm" data-delete-pet="${escapeHtml(pet.id)}" type="button">Remover</button>
      </div>
    </article>`;
  }

  function petForm(pet = {}) {
    const sizeOpts = (options.petSizes || []).map((s) => ({ value: s.code, label: s.name }));
    return `<form class="client-form-grid" id="pet-form" data-pet-id="${escapeHtml(pet.id || '')}">
      ${photoUploadField('Foto do pet', 'photoDataUrl', pet.photoUrl || '', '🐶')}
      ${field('Nome do pet', 'name', pet.name || '')}
      <label class="client-field"><span>Raça</span><input name="breed" value="${escapeHtml(pet.breed || '')}" list="app-pet-breed-list" placeholder="Selecione ou digite a raça"></label>${breedDatalistHtml()}
      ${selectField('Porte', 'size', sizeOpts, pet.size || sizeOpts[0]?.value || 'pequeno', 'Escolha o porte')}
      ${field('Tipo de pelagem', 'coatType', pet.coatType || '')}
      ${field('Nascimento', 'birthDate', pet.birthDate ? String(pet.birthDate).slice(0, 10) : '', 'type="date"')}
      ${field('Peso aproximado', 'weightKg', pet.weightKg || '', 'inputmode="decimal"')}
      ${textArea('Preferências', 'preferences', pet.preferences || '')}
      ${textArea('Restrições/cuidados', 'restrictions', pet.restrictions || '')}
      ${textArea('Observações', 'notes', pet.notes || '')}
      <button class="btn" type="submit">Salvar pet</button>
    </form>`;
  }

  function renderPets() {
    const route = currentPetRoute();
    if (route.petId) return renderSelectedPetPage(selectedPetFromRoute(), route.area);
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Pets cadastrados</h2><p>Selecione um pet para abrir o perfil completo ou cadastre um novo.</p><button class="btn btn-sm" id="new-pet" type="button">Novo pet</button></div><div class="client-pet-list">${data.pets.map(renderEditablePetCard).join('') || empty('🐶', 'Nenhum pet cadastrado', 'Cadastre seu primeiro pet pelo app.')}</div></section>`;
  }

  function renderHistorico() {
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Histórico de atendimentos</h2><p>Comandas e recibos dos últimos registros.</p></div>${data.history.map((item) => renderAppointmentCard(item)).join('') || empty('📄', 'Sem histórico ainda', 'Depois do primeiro atendimento, os registros aparecem aqui.')}</section>`;
  }

  function packageCardHtml(pkg, selected = false) {
    const full = Number(pkg.originalPriceCents || 0) || Math.round(Number(pkg.priceCents || 0) / Math.max(0.01, 1 - (Number(pkg.discountPercent || 0) / 100)));
    const economy = Math.max(0, full - Number(pkg.priceCents || 0));
    const sizeLabel = pkg.petSize && pkg.petSize !== 'todos' ? pkg.petSize : 'todos os portes';
    return `<button class="client-package-option ${selected ? 'is-selected' : ''}" type="button" data-package-card="${escapeHtml(pkg.id)}">
      <span class="client-package-badge">${escapeHtml(sizeLabel)}</span>
      <strong>${escapeHtml(pkg.name || 'Pacote PetFunny')}</strong>
      <p>${escapeHtml(pkg.description || pkg.servicesText || 'Rotina de banho e tosa com acompanhamento pelo App do Tutor.')}</p>
      <div class="client-package-meta"><span>${Number(pkg.sessionsCount || 0)} sessões</span><span>${Number(pkg.appointmentsPerMonth || 0) || 4}/mês</span></div>
      <div class="client-package-price"><small>Valor do pacote</small><b>${money(pkg.priceCents)}</b></div>
      <div class="client-package-economy">${economy > 0 ? `Economia estimada de ${money(economy)}` : `Desconto de ${Number(pkg.discountPercent || 0)}% aplicado`}</div>
    </button>`;
  }

  function packagesForSelectedPet(petId) {
    const pet = (data.pets || []).find((p) => String(p.id) === String(petId));
    const size = pet?.size || '';
    return (options.packages || []).filter((pkg) => !pkg.petSize || pkg.petSize === 'todos' || !size || pkg.petSize === size);
  }

  function renderPackageCardsForPet(petId, selectedPackageId = '') {
    if (!petId) return `<div class="client-alert-soft">Escolha primeiro o pet para ver somente pacotes compatíveis com o porte dele.</div>`;
    const packages = packagesForSelectedPet(petId);
    if (!packages.length) return `<div class="client-alert-soft">Nenhum pacote ativo para o porte deste pet. Fale com a PetFunny pelo WhatsApp.</div>`;
    return `<div class="client-package-grid">${packages.map((pkg) => packageCardHtml(pkg, String(pkg.id) === String(selectedPackageId))).join('')}</div>`;
  }

  function renderPacotes() {
    const firstPet = data.pets?.[0]?.id || '';
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Contratar pacote</h2><p>Escolha o pet e selecione um pacote compatível com o porte dele.</p></div>
      <form class="client-form-card" id="package-form">
        <div class="client-field client-pet-picker-field"><span>Pet</span>${renderAppointmentPetPicker(firstPet, { inputName: 'petId', returnSection: 'pacotes' })}</div>
        <input type="hidden" name="packageId" value="">
        <div id="package-card-options">${renderPackageCardsForPet(firstPet)}</div>
        <div id="package-preview" class="client-alert-soft">Selecione um pacote em card para ver sessões, economia e valor.</div>
        ${field('Data inicial', 'startsOn', today(), `type="date" min="${today()}"`)}
        ${field('Primeiro horário', 'firstTime', '09:00', 'type="time"')}
        <label class="client-switch"><input type="checkbox" name="recurring"><span>Ativar recorrência automática ao acabar as sessões</span></label>
        ${paymentMethodChoicesHtml({ fieldName: 'paymentType', selected: 'pix' })}
        <button class="btn" type="submit">Contratar pacote</button>
      </form>
    </section>
    <section class="client-mobile-section"><div class="client-section-title"><h2>Pacotes contratados</h2><p>Sessões, recorrência e documentos consolidados.</p></div>${data.packages.map(renderPackageCard).join('') || empty('🎁', 'Nenhum pacote ativo', 'Contrate um pacote pelo app.')}</section>`;
  }

  function renderIndique() {
    const referral = data.referral || data.engagement?.referral || {};
    const rewards = data.rewards || data.engagement?.rewards || {};
    const events = (referral.items || []).slice(0, 6);
    return `<section class="client-mobile-section client-referral-hero">
      <div class="client-section-title"><h2>Indique e Ganhe</h2><p>Compartilhe a PetFunny e ganhe ossinhos quando seus amigos conhecerem nossos cuidados.</p></div>
      <article class="client-list-card client-referral-card">
        <div class="client-list-icon">🎁</div>
        <div class="client-list-body">
          <div class="client-list-title-row"><h3>Seu convite PetFunny</h3><span class="client-badge light">${escapeHtml(referral.referralCode || 'PETFUNNY')}</span></div>
          <p>Indique um amigo e ganhe ossinhos. Quando a indicação converter, você pode ganhar ainda mais recompensas.</p>
          <div class="client-card-actions"><button class="btn btn-sm" id="copy-referral-link" type="button" data-link="${escapeHtml(referral.shareLink || 'https://agendapetfunny.com.br/app/login')}">Copiar link</button><a class="btn btn-sm btn-secondary" href="${escapeHtml(referral.whatsappUrl || 'https://wa.me/?text=Conheça%20a%20PetFunny')}">Compartilhar WhatsApp</a></div>
        </div>
      </article>
      <form class="client-form-card" id="referral-form">
        ${field('Nome do amigo', 'name', '')}
        ${field('WhatsApp do amigo', 'phone', '', 'inputmode="tel" placeholder="(16) 99999-9999"')}
        <button class="btn" type="submit">Registrar indicação</button>
      </form>
    </section>
    <section class="client-mobile-section"><div class="client-section-title"><h2>Suas indicações</h2><p>${Number(rewards.pointsBalance || 0)} ossinhos acumulados no app.</p></div>${events.length ? events.map((item) => `<article class="client-list-card"><div class="client-list-icon">🐾</div><div class="client-list-body"><div class="client-list-title-row"><h3>${escapeHtml(item.name || 'Indicação')}</h3><span class="client-badge light">${escapeHtml(item.status || 'created')}</span></div><p>${escapeHtml(item.phone || '')} · +${Number(item.rewardPoints || 0)} ossinhos previstos</p></div></article>`).join('') : empty('🎁', 'Nenhuma indicação ainda', 'Cadastre um amigo ou compartilhe seu link pelo WhatsApp.')}</section>`;
  }

  function renderMimos() {
    return renderRoleta();
  }

  function renderPagamento() {
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Pagamento online</h2><p>Finalize com Pix, crédito ou débito em ambiente seguro. O agendamento ou pacote só será concluído depois da confirmação do pagamento.</p></div><article class="client-form-card" id="pix-page-card"><div class="client-pix-status">Carregando dados do pagamento...</div></article></section>`;
  }

  function renderRoleta() {
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Roleta de Mimos</h2><p>Escolha um pet e gire para registrar o mimo no sistema.</p></div>
      <article class="client-roulette-card">
        <div class="client-roulette-wheel"><span>🎁</span></div>
        <form id="spin-form" class="client-form-grid compact">
          ${selectField('Pet participante', 'petId', (data.pets || []).map((pet) => ({ value: pet.id, label: pet.name })), '', 'Opcional')}
          <button class="btn" type="submit">Girar roleta</button>
        </form>
        <div id="spin-result" class="client-alert-soft">${options.gifts?.length ? `${options.gifts.length} mimo(s) ativo(s) disponíveis.` : 'Nenhum mimo ativo neste momento.'}</div>
      </article>
    </section>`;
  }


  function renderPromocoes() {
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Promoções ativas</h2><p>Escolha um serviço em um dia contemplado e o desconto entra sozinho no Pix do agendamento.</p></div>${renderPromotionsList()}</section>`;
  }



  function riskBadgeHealth(level = 'low') {
    const map = { low: ['Baixo', 'success'], medium: ['Atenção', 'warning'], high: ['Urgente', 'danger'] };
    const item = map[level] || map.low;
    return `<span class="client-badge ${item[1]}">${item[0]}</span>`;
  }

  const dailyHealthThemes = [
    { day: 1, key: 'apetite', icon: '🍽️', title: 'Apetite', prompt: 'Dia 1: vamos avaliar se o pet manteve interesse por comida e se houve recusa alimentar.', questions: [
      { label: 'Como foi o apetite nas últimas 24h?', name: 'appetite', options: [['normal','Apetite normal'], ['menos','Comeu menos'], ['nao','Não quis comer'], ['muito','Comeu mais que o normal']] },
      { label: 'Teve vômito ou enjoo?', name: 'vomiting', options: [['nao','Não'], ['sim','Sim'], ['repetido','Vômitos repetidos'], ['sangue','Com sangue']] }
    ], actionHint: '3 dias seguidos sem apetite geram alerta e recomendação de teleconsulta.' },
    { day: 2, key: 'agua', icon: '💧', title: 'Consumo de água', prompt: 'Dia 2: vamos observar hidratação, sede e ingestão de água.', questions: [
      { label: 'Bebeu água normalmente?', name: 'water', options: [['normal','Normal'], ['menos','Menos que o normal'], ['muito','Muito mais que o normal'], ['nao','Não bebeu']] },
      { label: 'Como está a urina?', name: 'urination', options: [['normal','Normal'], ['pouca','Pouca'], ['muita','Muita'], ['dificuldade','Dificuldade para urinar'], ['sangue','Sangue']] }
    ], actionHint: 'Mudanças em água e urina podem indicar necessidade de orientação.' },
    { day: 3, key: 'energia', icon: '⚡', title: 'Energia/disposição', prompt: 'Dia 3: vamos medir disposição, brincadeiras, interesse e alerta.', questions: [
      { label: 'Como está a energia?', name: 'energy', options: [['normal','Normal'], ['baixo','Mais quieto'], ['muito_baixo','Muito baixo/prostrado'], ['agitado','Agitado/inquieto']] },
      { label: 'Comportamento percebido', name: 'behavior', text: true, placeholder: 'Ex.: brincou, ficou escondido, está apático...' }
    ], actionHint: 'Redução de atividade repetida alimenta o motor de alertas.' },
    { day: 4, key: 'fezes', icon: '💩', title: 'Fezes', prompt: 'Dia 4: vamos avaliar fezes, diarreia, sangue ou ausência de evacuação.', questions: [
      { label: 'Como estão as fezes?', name: 'stool', options: [['normal','Normal'], ['mole','Mole'], ['liquida','Líquida'], ['sangue','Com sangue'], ['nao_fez','Não fez']] },
      { label: 'Teve diarreia?', name: 'diarrhea', options: [['nao','Não'], ['sim','Sim'], ['persistente','Persistente'], ['sangue','Com sangue']] }
    ], actionHint: 'Diarreia persistente ou sangue pede avaliação veterinária.' },
    { day: 5, key: 'urina', icon: '🚽', title: 'Urina', prompt: 'Dia 5: vamos observar frequência, cor, esforço e sinais de dor ao urinar.', questions: [
      { label: 'Como está a urina?', name: 'urination', options: [['normal','Normal'], ['pouca','Pouca'], ['muita','Muita'], ['dificuldade','Dificuldade para urinar'], ['sangue','Sangue']] },
      { label: 'Percebeu dor ou esforço?', name: 'pain', options: [['nao','Não'], ['leve','Leve'], ['moderada','Moderada'], ['intensa','Intensa']] }
    ], actionHint: 'Dificuldade para urinar é sinal de atenção importante.' },
    { day: 6, key: 'sono', icon: '🌙', title: 'Sono', prompt: 'Dia 6: vamos entender descanso, inquietação e sonolência excessiva.', questions: [
      { label: 'Como foi o sono?', name: 'sleep', options: [['normal','Normal'], ['menos','Dormiu menos'], ['muito','Dormiu muito'], ['inquieto','Sono inquieto']] },
      { label: 'Notou desconforto?', name: 'pain', options: [['nao','Não'], ['leve','Leve'], ['moderada','Moderada'], ['intensa','Intensa']] }
    ], actionHint: 'Sono alterado pode indicar dor, ansiedade ou desconforto.' },
    { day: 7, key: 'pele', icon: '🧴', title: 'Pele e coceiras', prompt: 'Dia 7: vamos avaliar coceira, vermelhidão, feridas, odor e pelagem.', questions: [
      { label: 'Como está pele/pelagem?', name: 'skinCoat', options: [['normal','Normal'], ['coceira','Coceira'], ['vermelhidao','Vermelhidão'], ['ferida','Feridas'], ['queda_pelo','Queda de pelo']] },
      { label: 'Odor, oleosidade ou nós?', name: 'otherSigns', text: true, placeholder: 'Ex.: odor forte, pelo embolado, pele oleosa...' }
    ], actionHint: 'Pode sugerir banho, tosa, hidratação ou teleconsulta dermatológica.' },
    { day: 8, key: 'mobilidade', icon: '🐾', title: 'Mobilidade', prompt: 'Dia 8: vamos observar marcha, pulos, dor, mancar e dificuldade de levantar.', questions: [
      { label: 'Como está a mobilidade?', name: 'mobility', options: [['normal','Normal'], ['mancando','Mancando'], ['dificuldade','Dificuldade para levantar/subir'], ['dor','Parece sentir dor']] },
      { label: 'Dor aparente?', name: 'pain', options: [['nao','Não'], ['leve','Leve'], ['moderada','Moderada'], ['intensa','Intensa']] }
    ], actionHint: 'Dor ou dificuldade de locomoção merece acompanhamento.' },
    { day: 9, key: 'comportamento', icon: '🧠', title: 'Comportamento', prompt: 'Dia 9: vamos observar mudanças de humor, interação e rotina.', questions: [
      { label: 'Como está o comportamento?', name: 'behavior', options: [['normal','Normal'], ['quieto','Mais quieto'], ['agitado','Agitado'], ['escondido','Se escondendo'], ['agressivo','Mais agressivo']] },
      { label: 'Mudou algo na rotina?', name: 'otherSigns', text: true, placeholder: 'Mudança de casa, passeio, alimentação, visita...' }
    ], actionHint: 'Mudanças comportamentais ajudam a antecipar problemas.' },
    { day: 10, key: 'ansiedade', icon: '💚', title: 'Ansiedade', prompt: 'Dia 10: vamos entender sinais de estresse, lambedura, medo ou inquietação.', questions: [
      { label: 'Sinais de ansiedade?', name: 'anxiety', options: [['nao','Não'], ['leve','Leve'], ['moderada','Moderada'], ['intensa','Intensa']] },
      { label: 'O que percebeu?', name: 'behavior', text: true, placeholder: 'Ex.: lambe muito, late, chora, destrói objetos...' }
    ], actionHint: 'Ansiedade recorrente pode pedir orientação veterinária/comportamental.' },
    { day: 11, key: 'peso', icon: '⚖️', title: 'Peso corporal', prompt: 'Dia 11: vamos acompanhar percepção de peso, apetite e condição corporal.', questions: [
      { label: 'Percebeu mudança de peso?', name: 'weightTrend', options: [['normal','Sem mudança'], ['ganhou','Ganhou peso'], ['perdeu','Perdeu peso'], ['nao_sei','Não sei']] },
      { label: 'Peso atual, se souber', name: 'otherSigns', text: true, placeholder: 'Ex.: 8,5 kg ou ainda não pesei' }
    ], actionHint: 'Registrar peso melhora o Health Score e o prontuário.' },
    { day: 12, key: 'bucal', icon: '🦷', title: 'Saúde bucal', prompt: 'Dia 12: vamos avaliar hálito, gengiva, dor ao mastigar e tártaro.', questions: [
      { label: 'Como está o hálito/boca?', name: 'oralHealth', options: [['normal','Normal'], ['mau_halito','Mau hálito'], ['tartaro','Tártaro visível'], ['dor','Dor ao mastigar'], ['sangramento','Sangramento']] },
      { label: 'Observações bucais', name: 'otherSigns', text: true, placeholder: 'Ex.: gengiva vermelha, baba, não mastiga...' }
    ], actionHint: 'Saúde bucal impacta bem-estar e pode exigir avaliação.' },
    { day: 13, key: 'ouvidos', icon: '👂', title: 'Ouvidos', prompt: 'Dia 13: vamos observar odor, coceira, secreção e vermelhidão nos ouvidos.', questions: [
      { label: 'Como estão ouvidos/olhos?', name: 'eyesEars', options: [['normal','Normal'], ['secrecao','Secreção'], ['vermelho','Vermelhidão'], ['odor','Odor forte'], ['coçando','Coçando muito']] },
      { label: 'Sacode a cabeça ou sente dor?', name: 'pain', options: [['nao','Não'], ['leve','Leve'], ['moderada','Moderada'], ['intensa','Intensa']] }
    ], actionHint: 'Ouvidos com odor/secreção podem pedir teleconsulta.' },
    { day: 14, key: 'higiene', icon: '🛁', title: 'Rotina de higiene', prompt: 'Dia 14: vamos avaliar banho, tosa, odor, nós e conforto do pet.', questions: [
      { label: 'Como está a higiene?', name: 'hygiene', options: [['ok','Em dia'], ['odor','Com odor'], ['nos','Com nós/embolo'], ['pele','Pele sensível'], ['precisa','Precisa de cuidado']] },
      { label: 'Qual cuidado parece necessário?', name: 'otherSigns', text: true, placeholder: 'Ex.: banho, tosa higiênica, hidratação, desembolo...' }
    ], actionHint: 'A IA pode sugerir banho, tosa ou cuidado PetFunny.' }
  ];

  function getDailyHealthTheme(date = new Date(), petId = '') {
    const base = Math.floor(date.getTime() / 86400000);
    return dailyHealthThemes[base % dailyHealthThemes.length];
  }

  function dailyHealthCard(pet = data.pets?.[0] || {}) {
    const theme = getDailyHealthTheme(new Date(), pet.id || '');
    const petName = pet.name || 'seu pet';
    return `<article class="client-daily-triage-card">
      <div class="client-daily-triage-icon">${theme.icon}</div>
      <div class="client-daily-triage-body">
        <span class="eyebrow">Triagem diária Saúde 360</span>
        <h3>${escapeHtml(theme.title)}</h3>
        <p>${escapeHtml(theme.prompt)} Acompanhar ${escapeHtml(petName)} todos os dias ajuda a interpretar mudanças cedo e alimentar o prontuário.</p>
        <small>${escapeHtml(theme.actionHint)}</small>
        <div class="client-card-actions"><button class="btn btn-sm" type="button" data-open-daily-triage="${escapeHtml(pet.id || '')}">Responder triagem de hoje</button><a class="btn btn-secondary btn-sm" href="/app/saude-360">Ver Saúde 360</a></div>
      </div>
    </article>`;
  }

  function dailyTriageForm(petId = '') {
    const selectedPetId = petId || window.__health360SelectedPet || document.querySelector('[name="healthPetId"]')?.value || data.pets?.[0]?.id || '';
    const pet = (data.pets || []).find((item) => String(item.id) === String(selectedPetId)) || data.pets?.[0] || {};
    const theme = getDailyHealthTheme(new Date(), selectedPetId);
    const questionHtml = theme.questions.map((q) => {
      if (q.text) return field(q.label, q.name, '', `placeholder="${escapeHtml(q.placeholder || '')}"`);
      return selectField(q.label, q.name, q.options.map(([value,label]) => ({ value, label })), '', 'Selecione');
    }).join('');
    return `<form id="health-daily-triage-form" class="client-form-card health360-triage-rich" data-pet-id="${escapeHtml(selectedPetId)}">
      <input type="hidden" name="petId" value="${escapeHtml(selectedPetId)}">
      <input type="hidden" name="dailyTheme" value="${escapeHtml(theme.key)}">
      <input type="hidden" name="symptoms" value="Triagem diária Saúde 360: ${escapeHtml(theme.title)}">
      <input type="hidden" name="duration" value="últimas 24 horas">
      <article class="client-alert-soft"><strong>${theme.icon} ${escapeHtml(theme.title)}</strong><br>${escapeHtml(theme.prompt)} Esta resposta será interpretada pela IA e salva no prontuário de ${escapeHtml(pet.name || 'seu pet')}.</article>
      ${questionHtml}
      ${field('Observações livres', 'otherSigns', '', 'placeholder="Conte algo diferente que tenha percebido hoje"')}
      <div class="client-card-actions"><button class="btn" type="submit">Gerar devolutiva diária</button><a class="btn btn-secondary" href="/app/agenda">Agendar banho/tosa</a></div>
    </form>`;
  }

  function renderHealth360Score(score = {}) {
    const value = Math.max(0, Math.min(100, Number(score.score || 0)));
    const label = score.label || (value >= 90 ? 'Excelente' : value >= 70 ? 'Bom' : value >= 50 ? 'Atenção' : value > 0 ? 'Risco' : 'Sem dados');
    const level = value >= 90 ? 'excellent' : value >= 70 ? 'good' : value >= 50 ? 'attention' : value > 0 ? 'risk' : 'empty';
    const factors = (score.factors || []).filter(Boolean);
    const updatedAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const ringStyle = `--health-score:${value};`;
    return `<article class="client-health-score-card score-${level}">
      <div class="client-health-score-top">
        <div>
          <span class="eyebrow">PetFunny Health Score™</span>
          <h3>Bem-estar preventivo</h3>
        </div>
        <span class="client-health-score-mark">🩺</span>
      </div>
      <div class="client-health-score-body">
        <div class="client-health-score-ring" style="${ringStyle}"><strong>${value || '--'}</strong><span>${escapeHtml(label)}</span></div>
        <div class="client-health-score-insights">
          <p>${escapeHtml(label)} agora</p>
          <small>${factors.length ? escapeHtml(factors.slice(0, 3).join(' · ')) : 'Complete dados, triagens e histórico para melhorar a leitura.'}</small>
          <ul>
            <li>✓ Rotina PetFunny acompanhada</li>
            <li>✓ Prontuário ativo</li>
            <li>✓ Alertas preventivos</li>
          </ul>
        </div>
      </div>
      <footer>Atualizado hoje às ${updatedAt}</footer>
    </article>`;
  }



  function renderHealth360Dashboard(dashboard = {}, alerts = [], daily = {}) {
    const cards = [
      ['Health Score', `${dashboard.healthScore ?? '--'}`, dashboard.healthLabel || 'Bem-estar'],
      ['Última triagem', dashboard.lastTriageLabel || 'Nenhuma', daily.status === 'completed' ? 'Triagem concluída hoje' : 'Triagem disponível'],
      ['Dias monitorados', `${dashboard.monitoredDays || 0}`, 'registros no prontuário'],
      ['Alertas ativos', `${dashboard.activeAlerts || 0}`, alerts.length ? 'exigem atenção' : 'sem alertas críticos']
    ];
    return `<section class="health360-dashboard-block">
      <div class="client-section-title compact"><h2>Dashboard Saúde 360</h2><p>Leitura diária de bem-estar, rotina e alertas preventivos.</p></div>
      <div class="health360-kpi-grid">${cards.map(([label, value, hint]) => `<article class="health360-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(hint)}</small></article>`).join('')}</div>
      ${alerts.length ? `<div class="client-alert-soft health360-alert-list"><strong>🔴 Atenção</strong>${alerts.map((a) => `<p><b>${escapeHtml(a.title)}</b><br>${escapeHtml(a.message)}</p>`).join('')}</div>` : ''}
    </section>`;
  }


  function renderHealth360Thermometer(item = {}) {
    const score = Math.max(0, Math.min(100, Number(item.score || 0)));
    const label = item.label || (score >= 85 ? 'Excelente' : score >= 70 ? 'Bom' : score >= 50 ? 'Atenção' : 'Risco');
    const level = item.level || (score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'attention' : 'risk');
    const trend = Number(item.trend || 0);
    return `<article class="health360-thermo-card thermo-${escapeHtml(level)}">
      <div class="health360-thermo-head"><span>${escapeHtml(item.icon || '🩺')}</span><div><strong>${escapeHtml(item.title || 'Dimensão')}</strong><small>${trend ? `${trend > 0 ? '+' : ''}${trend} desde a última leitura` : 'Leitura atual'}</small></div><b>${score}/100</b></div>
      <div class="health360-thermo-track"><i style="width:${score}%"></i></div>
      <footer>${escapeHtml(label)}</footer>
    </article>`;
  }

  function renderHealth360ThemeScores(themeScores = []) {
    if (!themeScores.length) return `<section class="health360-thermometer-block"><div class="client-section-title compact"><h2>Health Thermometer™</h2><p>Responda triagens diárias para formar scores por tema.</p></div>${empty('🌡️','Sem termômetros ainda','A próxima triagem diária criará o primeiro score por tema.')}</section>`;
    return `<section class="health360-thermometer-block"><div class="client-section-title compact"><h2>Health Thermometer™</h2><p>Scores por tema gerados pelas triagens diárias.</p></div><div class="health360-thermo-grid">${themeScores.map(renderHealth360Thermometer).join('')}</div></section>`;
  }

  function renderHealth360PredictiveRisks(risks = []) {
    if (!risks.length) return `<section class="health360-risk-block"><div class="client-section-title compact"><h2>Predictive Health Engine™</h2><p>Nenhum risco preventivo relevante detectado até agora.</p></div></section>`;
    return `<section class="health360-risk-block"><div class="client-section-title compact"><h2>Predictive Health Engine™</h2><p>Leitura preventiva baseada no histórico das triagens.</p></div><div class="health360-risk-grid">${risks.map((risk) => `<article class="health360-risk-card"><div><strong>${escapeHtml(risk.title || 'Risco preventivo')}</strong><small>${escapeHtml(risk.reason || '')}</small></div><b>${escapeHtml(String(risk.percent || 0))}%</b><div class="health360-thermo-track"><i style="width:${Number(risk.percent || 0)}%"></i></div>${risk.cta ? `<a class="btn btn-sm btn-secondary" href="${escapeHtml(risk.cta.href || '/app/teleconsultas')}">${escapeHtml(risk.cta.label || 'Agir agora')}</a>` : ''}</article>`).join('')}</div></section>`;
  }

  function renderHealth360InsightModal(response = {}) {
    const insight = response.insight || response.triage?.insight || {};
    const triage = response.triage || {};
    const positives = (insight.positives || []).map((item) => `<li>✔ ${escapeHtml(item)}</li>`).join('');
    const attention = (insight.attention || []).map((item) => `<li>⚠ ${escapeHtml(item)}</li>`).join('');
    const cta = insight.cta || { label: triage.recommendedAction || 'Abrir Tele Consultas', href: '/app/teleconsultas' };
    return `<article class="client-list-card health360-insight-card"><div class="client-list-icon">🩺</div><div class="client-list-body">
      <span class="eyebrow">PetFunny Health Insight™</span>
      <h3>${escapeHtml(triage.summary || 'Triagem concluída')}</h3>
      ${riskBadgeHealth(triage.riskLevel)}
      <p><strong>${escapeHtml(insight.petName || 'Pet')} apresentou:</strong></p>
      <ul>${positives}${attention}</ul>
      ${insight.thermometer ? renderHealth360Thermometer(insight.thermometer) : ''}
      <p><strong>Recomendação:</strong><br>${escapeHtml(insight.recommendation || triage.guidance || '')}</p>
      <p><strong>Health Score:</strong> ${escapeHtml(insight.scoreText || '')}</p>
      <div class="client-card-actions"><a class="btn btn-sm" href="${escapeHtml(cta.href || '/app/teleconsultas')}">${escapeHtml(cta.label || 'Abrir Tele Consultas')}</a><a class="btn btn-secondary btn-sm" href="/app/agenda">Agendar banho/tosa</a></div>
    </div></article>`;
  }

  function health360Initials(name = 'Vet') {
    return String(name || 'Vet').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'VT';
  }

  function health360VetAvatar(vet = {}, extraClass = '') {
    const url = vet.photoUrl || vet.veterinarianPhotoUrl || '';
    const name = vet.name || vet.veterinarianName || 'Veterinário';
    return `<div class="health360-vet-avatar ${extraClass}">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}">` : `<span>${escapeHtml(health360Initials(name))}</span>`}</div>`;
  }

  function health360VetCards(vets = [], selectedId = '') {
    if (!vets.length) return empty('🩺', 'Nenhum veterinário disponível', 'Cadastre veterinários e horários no Admin Saúde 360.');
    return vets.map((vet) => `<article class="health360-vet-card ${String(vet.id) === String(selectedId) ? 'selected' : ''}" data-vet-card="${escapeHtml(vet.id)}">
      ${health360VetAvatar(vet)}
      <div class="health360-vet-info">
        <h3>${escapeHtml(vet.name || 'Veterinário parceiro')}</h3>
        <p>${escapeHtml(vet.specialty || 'Clínica geral')}</p>
        <small>CRMV ${escapeHtml(vet.crmv || '—')}${vet.crmvUf ? `/${escapeHtml(vet.crmvUf)}` : ''} · ${money(vet.consultationPriceCents || 0)}</small>
      </div>
      <div class="health360-vet-actions">
        <button class="btn btn-sm" type="button" data-select-vet="${escapeHtml(vet.id)}">Selecionar</button>
        <button class="btn btn-sm btn-secondary" type="button" data-view-vet="${escapeHtml(vet.id)}">Ver dados</button>
      </div>
    </article>`).join('');
  }

  function health360SlotCards(slots = [], selectedId = '') {
    if (!slots.length) return empty('📅', 'Nenhum horário disponível', 'Escolha outro veterinário ou cadastre novos horários no Admin Saúde 360.');
    return slots.map((slot) => `<button class="health360-slot-card ${String(slot.id) === String(selectedId) ? 'selected' : ''}" type="button" data-select-slot="${escapeHtml(slot.id)}">
      <strong>${dateTime(slot.startsAt)}</strong>
      <span>${escapeHtml(slot.veterinarianName || '')}</span>
      <small>${money(slot.priceCents || 0)}</small>
    </button>`).join('');
  }

  function selectedHealth360Vet() {
    const id = document.querySelector('#teleconsultation-form [name="veterinarianId"]')?.value || '';
    return (window.__health360Vets || []).find((vet) => String(vet.id) === String(id));
  }

  function syncHealth360TeleSlots() {
    const form = document.getElementById('teleconsultation-form');
    if (!form) return;
    const vetId = form.veterinarianId?.value || '';
    const slotId = form.slotId?.value || '';
    const slots = (window.__health360Slots || []).filter((slot) => !vetId || String(slot.veterinarianId) === String(vetId));
    const slotGrid = document.getElementById('health360-slot-grid');
    if (slotGrid) slotGrid.innerHTML = health360SlotCards(slots, slotId);
    const vetGrid = document.getElementById('health360-vet-grid');
    if (vetGrid) vetGrid.innerHTML = health360VetCards(window.__health360Vets || [], vetId);
  }

  function showHealth360VetDetails(vetId) {
    const vet = (window.__health360Vets || []).find((item) => String(item.id) === String(vetId));
    if (!vet) return;
    const html = `<section class="health360-vet-detail">
      ${health360VetAvatar(vet, 'large')}
      <div><h3>${escapeHtml(vet.name || 'Veterinário')}</h3><p>${escapeHtml(vet.specialty || 'Clínica geral')}</p><small>CRMV ${escapeHtml(vet.crmv || '—')}${vet.crmvUf ? `/${escapeHtml(vet.crmvUf)}` : ''}</small></div>
      <article class="client-alert-soft"><strong>Valor da teleconsulta:</strong> ${money(vet.consultationPriceCents || 0)} · Duração média: ${escapeHtml(String(vet.defaultDurationMinutes || 30))} min</article>
      <p>${escapeHtml(vet.bio || 'Profissional parceiro disponível para orientação veterinária responsável.')}</p>
    </section>`;
    const panel = document.getElementById('health360-vet-detail-panel');
    if (panel) { panel.innerHTML = html; panel.hidden = false; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    openModal('Dados do veterinário', html, '<button class="btn" data-close-modal>OK</button>');
  }

  function renderHealth360() {
    const selected = new URLSearchParams(window.location.search).get('petId') || data.pets?.[0]?.id || '';
    return `<section class="client-mobile-section client-health360-hero">
      <div class="client-section-title"><h2>Saúde 360</h2><p>Monitore bem-estar, sinais de atenção, prontuário e teleconsulta veterinária.</p></div>
      <article class="client-alert-soft"><strong>Aviso importante:</strong> a triagem IA não dá diagnóstico, não prescreve remédios e não substitui atendimento veterinário. Em emergência, procure atendimento presencial imediatamente.</article>
      <div class="client-field client-pet-picker-field"><span>Escolha o pet</span>${renderAppointmentPetPicker(selected, { inputName: 'healthPetId', returnSection: 'saude' })}</div>
      <div id="health360-dynamic" class="client-health360-dynamic"><article class="client-empty"><span>🩺</span><h3>Carregando Saúde 360...</h3><p>Buscando score, triagens, prontuário e teleconsultas.</p></article></div>
    </section>`;
  }

  async function loadHealth360Panel(petId = '') {
    const root = document.getElementById('health360-dynamic');
    if (!root) return;
    const selectedPetId = petId || document.querySelector('[name="healthPetId"]')?.value || data.pets?.[0]?.id || '';
    if (!selectedPetId) {
      root.innerHTML = empty('🐶', 'Cadastre um pet primeiro', 'O Saúde 360 precisa de um pet cadastrado para iniciar.');
      return;
    }
    root.innerHTML = '<article class="client-empty"><span>🩺</span><h3>Atualizando Saúde 360...</h3><p>Organizando dados preventivos do pet.</p></article>';
    try {
      const payload = await clientApi.get(`/app/health360/summary?petId=${encodeURIComponent(selectedPetId)}`);
      const vets = payload.veterinarians || [];
      const triages = payload.triages || [];
      const records = payload.records || [];
      const teles = payload.teleconsultations || [];
      root.innerHTML = `
        ${renderHealth360Score(payload.score || {})}
        ${renderHealth360Dashboard(payload.dashboard || {}, payload.alerts || [], payload.dailyTriage || {})}
        ${renderHealth360ThemeScores(payload.themeScores || [])}
        ${renderHealth360PredictiveRisks(payload.predictiveRisks || [])}
        ${dailyHealthCard((payload.pets || data.pets || []).find((p) => String(p.id) === String(selectedPetId)) || data.pets?.[0] || {})}
        <div class="client-health-actions">
          <button class="btn" type="button" id="open-health-triage">Meu pet está estranho</button>
        </div>
        <section class="client-mobile-section"><div class="client-section-title"><h2>Últimas triagens</h2><p>Classificação segura e histórico preventivo.</p></div>
          <div class="client-list-stack">${triages.length ? triages.map((t) => `<article class="client-list-card"><div class="client-list-icon">🧠</div><div class="client-list-body"><div class="client-list-title-row"><h3>${escapeHtml(t.summary || 'Triagem registrada')}</h3>${riskBadgeHealth(t.riskLevel)}</div>${t.thermometer ? renderHealth360Thermometer(t.thermometer) : ''}<p>${escapeHtml(t.guidance || '')}</p><small>${shortDate(t.createdAt)} · ${escapeHtml(t.recommendedAction || '')}</small></div></article>`).join('') : empty('🧠', 'Nenhuma triagem ainda', 'Use o botão “Meu pet está estranho” para registrar sinais.')}</div>
        </section>
        <section class="client-mobile-section"><div class="client-section-title"><h2>Prontuário básico</h2><p>Triagens, teleconsultas e registros preventivos do pet.</p></div>
          <div class="client-list-stack">${records.length ? records.map((r) => `<article class="client-list-card"><div class="client-list-icon">📋</div><div class="client-list-body"><div class="client-list-title-row"><h3>${escapeHtml(r.title || r.type || 'Registro')}</h3><span class="client-badge light">${escapeHtml(r.type || 'NOTE')}</span></div><p>${escapeHtml(r.description || '')}</p><small>${shortDate(r.occurredAt || r.createdAt)}</small></div></article>`).join('') : empty('📋', 'Prontuário vazio', 'Triagens e teleconsultas aparecerão aqui automaticamente.')}</div>
        </section>`;
      window.__health360Vets = vets;
      window.__health360Slots = payload.slots || [];
      window.__health360SelectedPet = selectedPetId;
    } catch (error) {
      root.innerHTML = `<article class="client-empty"><span>⚠️</span><h3>Erro ao carregar Saúde 360</h3><p>${escapeHtml(error.message)}</p></article>`;
    }
  }

  function healthTriageForm() {
    const petId = window.__health360SelectedPet || document.querySelector('[name="healthPetId"]')?.value || '';
    return `<form id="health-triage-form" class="client-form-card health360-triage-rich" data-pet-id="${escapeHtml(petId)}">
      <input type="hidden" name="petId" value="${escapeHtml(petId)}">
      <article class="client-alert-soft"><strong>Saúde 360 IA</strong><br>Quanto mais detalhes você informar, melhor será a orientação preventiva. A IA não diagnostica e não prescreve medicamentos.</article>
      ${field('O que aconteceu?', 'symptoms', '', 'placeholder="Ex.: vomitou, está quieto, não quis comer, está se coçando" required')}
      ${field('Há quanto tempo?', 'duration', '', 'placeholder="Ex.: desde ontem, 2 horas, há 3 dias"')}
      ${selectField('Nível de energia', 'energy', [{value:'normal',label:'Normal'}, {value:'baixo',label:'Baixo / mais quieto'}, {value:'muito_baixo',label:'Muito baixo / prostrado'}, {value:'agitado',label:'Agitado / inquieto'}], '', 'Selecione')}
      ${selectField('Sono nas últimas 24h', 'sleep', [{value:'normal',label:'Normal'}, {value:'menos',label:'Dormiu menos'}, {value:'muito',label:'Dormiu muito'}, {value:'inquieto',label:'Sono inquieto'}], '', 'Selecione')}
      ${selectField('Está comendo?', 'appetite', [{value:'normal',label:'Normal'}, {value:'menos',label:'Menos que o normal'}, {value:'nao',label:'Não quis comer'}, {value:'muito',label:'Comeu mais que o normal'}], '', 'Selecione')}
      ${selectField('Está bebendo água?', 'water', [{value:'normal',label:'Normal'}, {value:'menos',label:'Menos'}, {value:'muito',label:'Muito mais que o normal'}, {value:'nao',label:'Não bebeu'}], '', 'Selecione')}
      ${field('Comportamento', 'behavior', '', 'placeholder="Ex.: apático, agitado, assustado, escondido, agressivo"')}
      ${selectField('Vômito?', 'vomiting', [{value:'nao',label:'Não'}, {value:'sim',label:'Sim'}, {value:'repetido',label:'Sim, repetidas vezes'}, {value:'sangue',label:'Com sangue'}], '', 'Selecione')}
      ${selectField('Diarreia?', 'diarrhea', [{value:'nao',label:'Não'}, {value:'sim',label:'Sim'}, {value:'sangue',label:'Com sangue'}, {value:'persistente',label:'Persistente'}], '', 'Selecione')}
      ${selectField('Respiração', 'breathing', [{value:'normal',label:'Normal'}, {value:'ofegante',label:'Ofegante'}, {value:'dificuldade',label:'Dificuldade para respirar'}, {value:'tosse',label:'Tosse / engasgos'}], '', 'Selecione')}
      ${selectField('Dor aparente?', 'pain', [{value:'nao',label:'Não'}, {value:'leve',label:'Leve'}, {value:'moderada',label:'Moderada'}, {value:'intensa',label:'Intensa'}], '', 'Selecione')}
      ${selectField('Pele, pelos ou coceira', 'skinCoat', [{value:'normal',label:'Normal'}, {value:'coceira',label:'Coceira'}, {value:'vermelhidao',label:'Vermelhidão'}, {value:'ferida',label:'Feridas'}, {value:'queda_pelo',label:'Queda de pelo'}], '', 'Selecione')}
      ${selectField('Olhos ou ouvidos', 'eyesEars', [{value:'normal',label:'Normal'}, {value:'secrecao',label:'Secreção'}, {value:'vermelho',label:'Vermelhidão'}, {value:'odor',label:'Odor forte'}, {value:'coçando',label:'Coçando muito'}], '', 'Selecione')}
      ${selectField('Urina', 'urination', [{value:'normal',label:'Normal'}, {value:'pouca',label:'Pouca'}, {value:'muita',label:'Muita'}, {value:'dificuldade',label:'Dificuldade para urinar'}, {value:'sangue',label:'Sangue'}], '', 'Selecione')}
      ${selectField('Fezes', 'stool', [{value:'normal',label:'Normal'}, {value:'mole',label:'Mole'}, {value:'liquida',label:'Líquida'}, {value:'sangue',label:'Com sangue'}, {value:'nao_fez',label:'Não fez'}], '', 'Selecione')}
      ${selectField('Vacinas / preventivos', 'preventiveStatus', [{value:'em_dia',label:'Em dia'}, {value:'atrasado',label:'Atrasado'}, {value:'nao_sei',label:'Não sei'}, {value:'nao_informado',label:'Não informado'}], '', 'Selecione')}
      ${selectField('Sinais críticos?', 'poison', [{value:'nao',label:'Não'}, {value:'sim',label:'Suspeita de veneno/produto tóxico'}], '', 'Selecione')}
      ${selectField('Convulsão, desmaio ou trauma?', 'criticalEvent', [{value:'nao',label:'Não'}, {value:'convulsao',label:'Convulsão'}, {value:'desmaio',label:'Desmaio'}, {value:'trauma',label:'Trauma / queda / atropelamento'}], '', 'Selecione')}
      ${field('Medicamentos ou histórico importante', 'medications', '', 'placeholder="Ex.: usa remédio contínuo, alergia, doença conhecida"')}
      ${field('Outros sinais', 'otherSigns', '', 'placeholder="Sangramento, febre, mudança de peso, mucosa pálida..."')}
      <div class="client-card-actions"><button class="btn" type="submit">Gerar análise Saúde 360 IA</button></div>
    </form>`;
  }

  function teleconsultationForm() {
    const petId = window.__health360SelectedPet || document.querySelector('[name="healthPetId"]')?.value || '';
    const vets = window.__health360Vets || [];
    const firstVetId = vets[0]?.id || '';
    const slots = window.__health360Slots || [];
    const initialSlots = slots.filter((slot) => !firstVetId || String(slot.veterinarianId) === String(firstVetId));
    return `<form id="teleconsultation-form" class="client-form-card health360-tele-form" data-pet-id="${escapeHtml(petId)}">
      <input type="hidden" name="petId" value="${escapeHtml(petId)}">
      <input type="hidden" name="veterinarianId" value="${escapeHtml(firstVetId)}" required>
      <input type="hidden" name="slotId" value="" required>
      <div class="client-section-title compact"><h2>Escolha o veterinário</h2><p>Selecione um profissional parceiro. Toque em “Ver dados” para conhecer CRMV, especialidade e currículo.</p></div>
      <div id="health360-vet-grid" class="health360-vet-grid">${health360VetCards(vets, firstVetId)}</div><div id="health360-vet-detail-panel" class="health360-vet-detail-panel" hidden></div>
      <div class="client-section-title compact"><h2>Dias e horários disponíveis</h2><p>Os horários abaixo são cadastrados no Admin Saúde 360 e futuramente poderão vir do App do Veterinário.</p></div>
      <div id="health360-slot-grid" class="health360-slot-grid">${health360SlotCards(initialSlots, '')}</div>
      ${selectField('Motivo', 'reason', [{value:'duvida_rapida',label:'Dúvida rápida'}, {value:'sintomas_leves',label:'Sintomas leves'}, {value:'retorno',label:'Retorno'}, {value:'orientacao_preventiva',label:'Orientação preventiva'}, {value:'pos_banho_tosa',label:'Pós-banho/tosa'}], '', 'Selecione o motivo')}
      ${field('Descreva brevemente', 'symptoms', '', 'placeholder="Conte o que você quer conversar com o veterinário"')}
      ${paymentMethodChoicesHtml({ fieldName: 'paymentMethod', selected: 'pix', selectMode: false })}
      <article class="client-alert-soft"><strong>Emergência?</strong> Teleconsulta não substitui atendimento presencial em caso grave.</article>
      <button class="btn" type="submit">Solicitar teleconsulta</button>
    </form>`;
  }



  function teleconsultasInitialPetId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('petId') || data.pets?.[0]?.id || '';
  }

  function renderTeleconsultas() {
    const selectedPet = teleconsultasInitialPetId();
    return `<section class="client-mobile-section client-teleconsultas-screen">
      <div class="client-section-title"><h2>Tele Consultas</h2><p>Primeiro escolha o pet. Depois selecione o veterinário, horário, preencha os dados e finalize o pagamento.</p></div>
      <form class="client-form-card client-tele-pet-form" id="teleconsultas-pet-form">
        <div class="client-field client-pet-picker-field"><span>Escolha o pet para a consulta</span>${renderAppointmentPetPicker(selectedPet)}</div>
        <button class="btn" id="teleconsultas-start" type="button">Agendar consulta</button>
      </form>
      <section class="client-mobile-section client-teleconsultas-list-section">
        <div class="client-section-title"><h2>Minhas teleconsultas</h2><p>Veja data, horário, status e link do atendimento veterinário online.</p></div>
        <div id="teleconsultas-appointments-list">${empty('📅', 'Carregando teleconsultas...', 'Buscando seus agendamentos veterinários.')}</div>
      </section>
      <div id="teleconsultas-flow" class="client-teleconsultas-flow"><article class="client-empty"><span>📹</span><h3>Consulta veterinária online</h3><p>Toque em Agendar consulta para ver veterinários e horários disponíveis.</p></article></div>
    </section>`;
  }

  function slotDateParts(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return { day:'--', month:'---', weekday:'Horário', time:'--:--' };
    return {
      day: date.toLocaleDateString('pt-BR', { day:'2-digit' }),
      month: date.toLocaleDateString('pt-BR', { month:'short' }).replace('.','').toUpperCase(),
      weekday: date.toLocaleDateString('pt-BR', { weekday:'short' }).replace('.',''),
      time: date.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    };
  }

  function teleconsultationStatusText(item = {}) {
    const payment = String(item.paymentStatus || '').toLowerCase();
    const status = String(item.status || '').toLowerCase();
    if (payment === 'paid' && status === 'scheduled') return 'Confirmada';
    if (payment === 'paid') return 'Pagamento aprovado';
    if (status === 'completed') return 'Finalizada';
    if (status === 'cancelled') return 'Cancelada';
    if (status === 'no_show') return 'Não compareceu';
    return 'Aguardando pagamento';
  }

  function renderTeleconsultationAppointmentCard(item = {}) {
    const part = slotDateParts(item.startsAt || item.createdAt);
    const statusText = teleconsultationStatusText(item);
    const canEnter = item.meetingUrl && String(item.paymentStatus || '').toLowerCase() === 'paid';
    const detailsUrl = `/app/teleconsultas?teleId=${encodeURIComponent(item.id || '')}`;
    return `<article class="client-appointment-card client-teleconsultation-card" id="teleconsulta-${escapeHtml(item.id || '')}">
      <div class="client-appointment-date"><small>${escapeHtml(part.weekday)}</small><strong>${escapeHtml(part.day)}</strong><span>${escapeHtml(part.month)}</span></div>
      <div class="client-appointment-info">
        <div class="client-list-title-row"><h3>${escapeHtml(item.petName || 'Pet')}</h3><span class="client-badge light">${escapeHtml(statusText)}</span></div>
        <p>${escapeHtml(item.veterinarianName || 'Veterinário parceiro')} · ${escapeHtml(part.time)}</p>
        <small>${escapeHtml(item.reason || 'Teleconsulta veterinária')} · ${money(item.priceCents || 0)}</small>
        <div class="client-card-actions">
          <a class="btn btn-sm btn-secondary" href="${escapeHtml(detailsUrl)}">Ver agendamento</a>
          ${canEnter ? `<a class="btn btn-sm" href="${escapeHtml(item.meetingUrl)}" target="_blank" rel="noopener">Entrar na consulta</a>` : `<span class="client-badge muted">Link liberado após pagamento</span>`}
        </div>
      </div>
    </article>`;
  }

  function renderTeleconsultasAppointments(items = []) {
    const root = document.getElementById('teleconsultas-appointments-list');
    if (!root) return;
    const list = Array.isArray(items) ? items : [];
    root.innerHTML = list.length
      ? `<div class="client-appointments-stack">${list.map(renderTeleconsultationAppointmentCard).join('')}</div>`
      : empty('📅', 'Nenhuma teleconsulta agendada', 'Quando você agendar uma teleconsulta, ela aparecerá aqui com data, horário e link.');
    const focusId = new URLSearchParams(window.location.search).get('teleId') || '';
    if (focusId) {
      window.setTimeout(() => document.getElementById(`teleconsulta-${CSS.escape(focusId)}`)?.scrollIntoView({ behavior:'smooth', block:'center' }), 120);
    }
  }

  async function loadTeleconsultasAppointments() {
    const root = document.getElementById('teleconsultas-appointments-list');
    if (!root) return;
    root.innerHTML = '<article class="client-empty compact"><span>📅</span><h3>Carregando teleconsultas...</h3><p>Buscando seus próximos agendamentos veterinários.</p></article>';
    try {
      const response = await clientApi.get('/app/teleconsultations');
      renderTeleconsultasAppointments(response.items || []);
    } catch (error) {
      root.innerHTML = `<article class="client-empty compact"><span>⚠️</span><h3>Não foi possível carregar</h3><p>${escapeHtml(error.message)}</p></article>`;
    }
  }

  async function loadTeleconsultasData(petId = '') {
    const root = document.getElementById('teleconsultas-flow');
    if (!root) return;
    const selectedPetId = petId || document.querySelector('#teleconsultas-pet-form [name="petId"]')?.value || data.pets?.[0]?.id || '';
    if (!selectedPetId) {
      root.innerHTML = empty('🐶', 'Cadastre um pet primeiro', 'A teleconsulta precisa estar vinculada a um pet.');
      return;
    }
    root.innerHTML = '<article class="client-empty"><span>📹</span><h3>Buscando veterinários...</h3><p>Carregando profissionais e horários disponíveis.</p></article>';
    try {
      const payload = await clientApi.get(`/app/teleconsultations/options?petId=${encodeURIComponent(selectedPetId)}`);
      window.__teleconsultasData = payload || {};
      window.__teleconsultasSelectedPet = selectedPetId;
      renderTeleconsultasAppointments(payload?.teleconsultations || []);
      renderTeleconsultasVetList();
    } catch (error) {
      root.innerHTML = `<article class="client-empty"><span>⚠️</span><h3>Não foi possível carregar</h3><p>${escapeHtml(error.message)}</p></article>`;
    }
  }

  function renderTeleconsultasVetList() {
    const root = document.getElementById('teleconsultas-flow');
    if (!root) return;
    const payload = window.__teleconsultasData || {};
    const vets = payload.veterinarians || [];
    const pet = payload.selectedPet || (data.pets || []).find((p) => String(p.id) === String(window.__teleconsultasSelectedPet));
    root.innerHTML = `<section class="client-mobile-section teleconsultas-vet-list">
      <div class="client-section-title"><h2>Escolha o veterinário</h2><p>${escapeHtml(pet?.name || 'Pet')} será atendido por vídeo com um profissional parceiro.</p></div>
      <div class="health360-vet-grid teleconsultas-vet-grid">${vets.length ? vets.map((vet) => `<article class="health360-vet-card teleconsultas-vet-card" data-tele-vet-card="${escapeHtml(vet.id)}">
        ${health360VetAvatar(vet)}
        <div class="health360-vet-info"><h3>${escapeHtml(vet.name || 'Veterinário parceiro')}</h3><p>${escapeHtml(vet.specialty || 'Clínica geral')}</p><small>CRMV ${escapeHtml(vet.crmv || '—')}${vet.crmvUf ? `/${escapeHtml(vet.crmvUf)}` : ''} · ${money(vet.consultationPriceCents || 0)}</small></div>
        <div class="health360-vet-actions"><button class="btn" type="button" data-tele-select-vet="${escapeHtml(vet.id)}">Selecionar</button></div>
      </article>`).join('') : empty('🩺','Nenhum veterinário disponível','Cadastre veterinários e horários no Admin Saúde 360.')}</div>
    </section>`;
    root.scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function renderTeleconsultasVetDetail(vetId = '') {
    const root = document.getElementById('teleconsultas-flow');
    if (!root) return;
    const payload = window.__teleconsultasData || {};
    const vet = (payload.veterinarians || []).find((item) => String(item.id) === String(vetId));
    if (!vet) { renderTeleconsultasVetList(); return; }
    const slots = (payload.slots || []).filter((slot) => String(slot.veterinarianId) === String(vet.id));
    const petId = window.__teleconsultasSelectedPet || payload.selectedPet?.id || '';
    root.innerHTML = `<div class="teleconsultas-detail-actions"><button class="client-back-link" type="button" data-tele-back-vets>← Voltar para veterinários</button></div>
      <article class="teleconsultas-flow-card teleconsultas-vet-hero">
        ${health360VetAvatar(vet, 'large')}
        <div><p class="eyebrow">Veterinário parceiro</p><h2>${escapeHtml(vet.name || 'Veterinário')}</h2><p>${escapeHtml(vet.specialty || 'Clínica geral')}</p><small>CRMV ${escapeHtml(vet.crmv || '—')}${vet.crmvUf ? `/${escapeHtml(vet.crmvUf)}` : ''}</small></div>
      </article>
      <article class="teleconsultas-flow-card client-alert-soft teleconsultas-price-alert"><strong>Valor:</strong> ${money(vet.consultationPriceCents || 0)} · Duração média: ${escapeHtml(String(vet.defaultDurationMinutes || 30))} min<br>${escapeHtml(vet.bio || 'Profissional parceiro disponível para orientação veterinária responsável.')}</article>
      <section class="teleconsultas-flow-card teleconsultas-slot-section">
        <div class="client-section-title compact"><h2>Escolha data e horário</h2><p>Toque em um horário disponível para continuar.</p></div>
        <div class="teleconsultas-slot-grid">${slots.length ? slots.map((slot) => { const part = slotDateParts(slot.startsAt); return `<button class="teleconsultas-slot-card" type="button" data-tele-select-slot="${escapeHtml(slot.id)}"><small>${escapeHtml(part.weekday)}</small><strong>${escapeHtml(part.day)}</strong><span>${escapeHtml(part.month)}</span><b>${escapeHtml(part.time)}</b><em>${money(slot.priceCents || vet.consultationPriceCents || 0)}</em></button>`; }).join('') : empty('📅','Sem horários disponíveis','Escolha outro veterinário ou aguarde novos horários.')}</div>
      </section>
      <form id="teleconsultation-form" class="teleconsultas-flow-card client-form-card teleconsultas-booking-form" data-pet-id="${escapeHtml(petId)}">
        <input type="hidden" name="petId" value="${escapeHtml(petId)}">
        <input type="hidden" name="veterinarianId" value="${escapeHtml(vet.id)}" required>
        <input type="hidden" name="slotId" value="" required>
        ${selectField('Motivo da consulta', 'reason', [{value:'duvida_rapida',label:'Dúvida rápida'}, {value:'sintomas_leves',label:'Sintomas leves'}, {value:'retorno',label:'Retorno'}, {value:'orientacao_preventiva',label:'Orientação preventiva'}, {value:'pos_banho_tosa',label:'Pós-banho/tosa'}], '', 'Selecione o motivo')}
        ${field('Descreva brevemente', 'symptoms', '', 'placeholder="Conte o que quer conversar com o veterinário"')}
        ${paymentMethodChoicesHtml({ fieldName: 'paymentMethod', selected: 'pix', selectMode: false })}
        <article class="client-alert-soft"><strong>Emergência?</strong> Teleconsulta não substitui atendimento presencial em caso grave.</article>
        <button class="btn" type="submit">Ir para pagamento</button>
      </form>`;
    root.scrollIntoView({ behavior:'smooth', block:'start' });
  }


  function notificationStatusLabel(status = '') {
    const value = String(status || '').toLowerCase();
    if (value === 'sent') return 'Enviada';
    if (value === 'failed') return 'Falhou';
    if (value === 'queued') return 'Na fila';
    return value ? value : 'Notificação';
  }

  function renderNotificationItem(item = {}) {
    const url = item.url || '/app/home';
    const isInternal = String(url).startsWith('/app');
    return `<article class="client-notification-card">
      <div class="client-notification-card-icon">🔔</div>
      <div class="client-notification-card-body">
        <div class="client-list-title-row"><h3>${escapeHtml(item.title || 'PetFunny')}</h3><span class="client-badge light">${escapeHtml(notificationStatusLabel(item.status))}</span></div>
        <p>${escapeHtml(item.body || 'Novo aviso do PetFunny.')}</p>
        <small>${dateTime(item.createdAt || item.sentAt)}</small>
        ${url ? `<div class="client-card-actions"><a class="btn btn-sm btn-secondary" href="${escapeHtml(url)}" ${isInternal ? '' : 'target="_blank" rel="noopener"'}>Abrir</a></div>` : ''}
      </div>
    </article>`;
  }

  function renderNotificationGroups(items = []) {
    if (!items.length) return empty('🔔', 'Nenhuma notificação ainda', 'Lembretes, avisos e novidades aparecerão aqui.');
    const groups = items.reduce((acc, item) => {
      const label = timelineDateLabel(item.createdAt || item.sentAt);
      if (!acc[label]) acc[label] = [];
      acc[label].push(item);
      return acc;
    }, {});
    return Object.entries(groups).map(([label, group]) => `
      <section class="client-notification-date-group">
        <h3>${escapeHtml(label)}</h3>
        <div class="client-list-stack">${group.map(renderNotificationItem).join('')}</div>
      </section>`).join('');
  }

  function renderNotificacoes() {
    return `<section class="client-mobile-section client-notifications-screen">
      <div class="client-section-title"><h2>Central de notificações</h2><p>Lembretes, avisos do app e novidades do Clube PetFunny separados por data.</p></div>
      <div id="client-notifications-list">${empty('🔔', 'Carregando notificações...', 'Buscando os avisos mais recentes do PetFunny.')}</div>
      <div id="client-notifications-sentinel" class="client-notifications-sentinel"><span>Carregando mais...</span></div>
    </section>`;
  }

  async function hydrateNotificationBadge() {
    const badge = document.getElementById('client-notification-badge');
    if (!badge) return;
    try {
      const summary = await clientApi.get('/app/notifications/summary');
      const total = Number(summary.unread ?? summary.total ?? 0);
      badge.textContent = total > 99 ? '99+' : String(total);
      badge.hidden = total <= 0;
      window.__clientNotificationSummary = summary;
    } catch {
      badge.hidden = true;
    }
  }

  async function loadClientNotificationsPage(reset = false) {
    const list = document.getElementById('client-notifications-list');
    const sentinel = document.getElementById('client-notifications-sentinel');
    if (!list || notificationState.loading) return;
    if (reset) notificationState = { ...notificationState, items: [], offset: 0, total: 0, hasMore: true, loading: false };
    if (!notificationState.hasMore) {
      if (sentinel) sentinel.innerHTML = '<span>Fim das notificações</span>';
      return;
    }
    notificationState.loading = true;
    if (sentinel) sentinel.innerHTML = '<span>Carregando mais...</span>';
    try {
      const payload = await clientApi.get(`/app/notifications?limit=${notificationState.limit}&offset=${notificationState.offset}`);
      const items = Array.isArray(payload.items) ? payload.items : [];
      notificationState.items = reset ? items : [...notificationState.items, ...items];
      notificationState.offset = Number(payload.nextOffset ?? (notificationState.offset + items.length));
      notificationState.total = Number(payload.total || notificationState.items.length);
      notificationState.hasMore = Boolean(payload.hasMore);
      list.innerHTML = renderNotificationGroups(notificationState.items);
      if (sentinel) sentinel.innerHTML = notificationState.hasMore ? '<span>Role para carregar mais</span>' : '<span>Fim das notificações</span>';
      hydrateNotificationBadge().catch(() => null);
    } catch (error) {
      list.innerHTML = `<article class="client-empty"><span>⚠️</span><h3>Não foi possível carregar</h3><p>${escapeHtml(error.message || 'Tente novamente em instantes.')}</p></article>`;
      if (sentinel) sentinel.innerHTML = '<span>Toque para tentar novamente</span>';
    } finally {
      notificationState.loading = false;
    }
  }

  function setupNotificationsInfinite() {
    const sentinel = document.getElementById('client-notifications-sentinel');
    if (!sentinel) return;
    if (notificationState.observer) notificationState.observer.disconnect();
    notificationState.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadClientNotificationsPage(false);
    }, { root: document.querySelector('.client-scroll-content') || null, rootMargin: '280px 0px' });
    notificationState.observer.observe(sentinel);
    sentinel.addEventListener('click', () => loadClientNotificationsPage(false));
  }

  function renderPerfil() {
    const tutor = data.tutor || {};
    return `<section class="client-mobile-section"><div class="client-section-title"><h2>Dados do tutor</h2><p>Edite seus dados. O WhatsApp fica protegido.</p></div>
      <form class="client-form-card" id="profile-form">
        ${photoUploadField('Foto do tutor', 'photoDataUrl', tutor.photoUrl || '', '👤')}
        ${field('Nome', 'name', tutor.name || '')}
        ${field('WhatsApp', 'whatsapp', tutor.whatsapp || data.account?.whatsapp || '', 'data-mask="whatsapp" disabled')}
        ${field('E-mail', 'email', tutor.email || '', 'type="email"')}
        <div class="client-form-subtitle">Endereço</div>
        ${field('CEP', 'addressZipcode', tutor.addressZipcode || '', 'data-mask="cep" placeholder="14000-000"')}
        ${field('Rua / Avenida', 'address', tutor.address || '')}
        ${field('Número', 'addressNumber', tutor.addressNumber || '')}
        ${field('Bairro', 'addressNeighborhood', tutor.addressNeighborhood || '')}
        ${field('Cidade', 'city', tutor.city || '')}
        ${field('Estado', 'state', tutor.state || '', 'data-mask="uf" maxlength="2"')}
        <button class="btn" type="submit">Salvar perfil</button>
      </form>
    </section>
    <section class="client-mobile-section"><div class="client-section-title"><h2>Senha do app</h2><p>Atualize sua senha de acesso quando precisar.</p></div>
      <form class="client-form-card" id="password-form">
        ${field('Nova senha', 'password', '', 'type="password" minlength="8"')}
        ${field('Confirmar senha', 'confirmPassword', '', 'type="password" minlength="8"')}
        <button class="btn btn-secondary" type="submit">Atualizar senha</button>
      </form>
    </section>
    <section class="client-mobile-section"><div class="client-section-title"><h2>Acesso</h2><p>Use esta opção para sair deste aparelho.</p></div><button class="btn btn-secondary" id="client-logout-profile" type="button">Sair do app</button></section>
    <section class="client-mobile-section">${renderPushActivationCard()}</section>`;
  }

  const renderers = { home: renderHome, agenda: renderAgenda, agendamentos: renderMeusAgendamentos, saude: renderHealth360, teleconsultas: renderTeleconsultas, notificacoes: renderNotificacoes, pets: renderPets, historico: renderHistorico, momentos: renderMomentos, pacotes: renderPacotes, mimos: renderMimos, roleta: renderRoleta, indique: renderIndique, promocoes: renderPromocoes, bemestar: renderBemEstar, perfil: renderPerfil, pagamento: renderPagamento };

  function clearClientMomentFloatingUpload() {
    document.querySelectorAll('body > .client-moment-floating-upload').forEach((element) => element.remove());
  }

  function pinClientMomentFloatingUpload(activeSection = '') {
    clearClientMomentFloatingUpload();
    if (activeSection !== 'momentos') return;
    const floatingUpload = document.querySelector('.client-mobile-content .client-moment-floating-upload');
    if (!floatingUpload) return;
    document.body.appendChild(floatingUpload);
    window.requestAnimationFrame(() => floatingUpload.classList.add('is-fixed-to-viewport'));
  }

  const APP_OPTIONS_CACHE_KEY = 'petfunny_app_options_cache_v1658';

  function readCachedAppOptions() {
    try {
      const raw = sessionStorage.getItem(APP_OPTIONS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.savedAt || !parsed.value) return null;
      if (Date.now() - Number(parsed.savedAt) > 10 * 60 * 1000) return null;
      return parsed.value;
    } catch {
      return null;
    }
  }

  function writeCachedAppOptions(value) {
    try {
      if (!value || typeof value !== 'object') return;
      sessionStorage.setItem(APP_OPTIONS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), value }));
    } catch {}
  }

  function withTimeout(promise, timeoutMs, fallbackValue) {
    let timer;
    return Promise.race([
      Promise.resolve(promise).finally(() => window.clearTimeout(timer)),
      new Promise((resolve) => {
        timer = window.setTimeout(() => resolve(fallbackValue), timeoutMs);
      })
    ]);
  }

  async function loadAppOptionsFast() {
    const cached = readCachedAppOptions();
    const request = clientApi.get('/app/options')
      .then((fresh) => {
        writeCachedAppOptions(fresh);
        return fresh;
      })
      .catch(() => cached || options);
    if (cached) {
      request.catch(() => null);
      return cached;
    }
    return withTimeout(request, 2800, options);
  }

  async function reload(sectionOverride = null) {
    registerClientServiceWorker().catch(() => null);
    const [me, summary, fastOptions] = await Promise.all([
      clientApi.get('/app/me').catch(() => null),
      clientApi.get('/app/summary'),
      loadAppOptionsFast()
    ]);
    if (me) setClientUser(me);
    data = summary;
    options = fastOptions || options;
    const activeSection = sectionOverride || currentClientSection();
    const [title, subtitle] = heroFor[activeSection] || heroFor.home;
    clearClientMomentFloatingUpload();
    buildClientApp({ title, subtitle, active: activeSection, content: (renderers[activeSection] || renderHome)() });
    pinClientMomentFloatingUpload(activeSection);
    hydrateNotificationBadge().catch(() => null);
    const focusId = new URLSearchParams(window.location.search).get('focus') || '';
    if (focusId) window.requestAnimationFrame(() => document.getElementById(`moment-${focusId}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }));
    if (activeSection === 'home') {
      setupHomeInfiniteReveal();
      queueAiPushReminder(data.careInsight || data.engagement?.careInsight || null);
    }
    if (activeSection === 'notificacoes') {
      await loadClientNotificationsPage(true);
      setupNotificationsInfinite();
    }
    bindEvents();
    bindPetDetailEvents();
    await loadPetRecordsList();
  }

  function formPayload(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function refreshPushCard() {
    const status = document.getElementById('client-push-status');
    const enableButton = document.getElementById('enable-push');
    const disableButton = document.getElementById('disable-push');
    if (!status) return;
    try {
      const state = await getPushState();
      if (!state.supported) {
        status.textContent = 'Este navegador ainda não permite push web. Use Chrome/Edge no Android ou instale na tela inicial no iPhone.';
        enableButton?.setAttribute('disabled', 'disabled');
        return;
      }
      if (!state.configured) {
        status.textContent = state.message || 'Servidor ainda não configurado para push. Configure as chaves VAPID.';
        enableButton?.setAttribute('disabled', 'disabled');
        return;
      }
      if (state.subscribed) {
        status.textContent = 'Notificações ativas neste aparelho. Você receberá lembretes e novidades do PetFunny.';
        enableButton.textContent = 'Reativar notificações';
        disableButton?.removeAttribute('disabled');
      } else {
        status.textContent = state.permission === 'denied' ? 'As notificações foram bloqueadas no navegador. Libere nas configurações do aparelho.' : 'Ative para receber lembretes, pacotes, mimos e avisos do PetFunny.';
      }
    } catch (error) {
      status.textContent = error.message || 'Não foi possível verificar notificações.';
    }
  }

  function bindPushEvents() {
    refreshPushCard();
    document.getElementById('enable-push')?.addEventListener('click', async () => {
      try {
        const response = await enablePushNotifications();
        toast(response.message || 'Notificações ativadas.');
        await refreshPushCard();
      } catch (error) {
        openModal('Notificações não ativadas', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });
    document.getElementById('disable-push')?.addEventListener('click', async () => {
      try {
        await disablePushNotifications();
        toast('Notificações desativadas neste aparelho.');
        await refreshPushCard();
      } catch (error) {
        openModal('Erro ao desativar notificações', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });
  }

  function pixQrImageSrc(base64 = '') {
    const text = String(base64 || '').trim();
    if (!text) return '';
    return text.startsWith('data:image/') ? text : `data:image/png;base64,${text}`;
  }

  function paymentPageHtml(intent = {}) {
    const paymentType = String(intent.paymentType || 'pix').toLowerCase();
    if (paymentType === 'card' || paymentType === 'wallet') {
      const isWallet = paymentType === 'wallet';
      return `<div class="client-pix-page-panel client-card-payment-panel">
        <div class="client-pix-header"><span>${isWallet ? 'Carteira digital' : 'Cartão'}</span><strong>${money(intent.amountCents || 0)}</strong></div>
        <p>${isWallet ? 'Use a carteira digital quando ela estiver disponível no seu navegador. Se essa opção não estiver disponível para sua conta/dispositivo, finalize pelo cartão ou Pix.' : 'Finalize com cartão de crédito ou débito dentro do App do Tutor. A PetFunny não armazena dados do cartão; o processamento é feito em ambiente seguro.'}</p>
        ${intent.mercadoPagoPublicKey ? '<div id="mp-payment-brick" class="client-mp-brick"></div>' : '<div class="client-pix-warning">Configure a chave pública de pagamento no servidor para habilitar cartão.</div>'}
        <div class="client-pix-help">Ambiente seguro. Pix continua funcionando normalmente como alternativa.</div>
        <div class="client-pix-status" id="pix-payment-status">Aguardando preenchimento do cartão...</div>
      </div>`;
    }
    const expires = intent.expiresAt ? new Date(intent.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '5 minutos';
    const qrSrc = pixQrImageSrc(intent.qrCodeBase64 || '');
    const isValidPixCode = String(intent.qrCode || '').trim().startsWith('000201');
    return `<div class="client-pix-page-panel">
      <div class="client-pix-header"><span>Pix</span><strong>${money(intent.amountCents || 0)}</strong></div>
      ${intent.mercadoPagoTestMode ? '<div class="client-pix-warning"><strong>Atenção:</strong> credencial de teste detectada. Para pagar com banco real, use credenciais de produção.</div>' : ''}
      <p>Use somente o QR Code oficial ou o Pix copia e cola abaixo. O QR Code expira às <strong>${escapeHtml(expires)}</strong>.</p>
      ${qrSrc ? `<img class="client-pix-qr" src="${escapeHtml(qrSrc)}" alt="QR Code Pix">` : '<div class="client-pix-qr placeholder">QR Code indisponível</div>'}
      ${!isValidPixCode ? '<div class="client-pix-warning">O código Pix retornado não parece válido. Gere outro Pix ou revise as credenciais de produção.</div>' : ''}
      <label class="client-field"><span>Pix copia e cola</span><textarea id="pix-copy-code" readonly rows="5">${escapeHtml(intent.qrCode || '')}</textarea></label>
      <div class="client-card-actions client-pix-actions"><button class="btn btn-secondary" id="copy-pix-code-inline" type="button">Copiar código Pix</button></div>
      <div class="client-pix-help">Se o banco informar pagamento indisponível, gere um novo Pix. Não use QR antigo, print ou link de cobrança expirado.</div>
      <div class="client-pix-status" id="pix-payment-status">Aguardando confirmação do pagamento...</div>
    </div>`;
  }

  async function waitPixConfirmation(intentId, paymentKind = 'appointment') {
    const status = document.getElementById('pix-payment-status');
    let attempts = 0;
    return new Promise((resolve, reject) => {
      const timer = window.setInterval(async () => {
        attempts += 1;
        try {
          const response = await clientApi.get(paymentKind === 'package' ? `/app/packages/payment/${intentId}` : paymentKind === 'teleconsultation' ? `/app/teleconsultations/payment/${intentId}` : `/app/appointments/payment/${intentId}`);
          if (response.appointment || response.customerPackageId || response.teleconsultationId || response.paymentIntent?.status === 'paid') {
            window.clearInterval(timer);
            if (status) status.textContent = response.message || 'Pagamento confirmado com sucesso.';
            resolve(response);
            return;
          }
          if (status) status.textContent = `Aguardando pagamento... tentativa ${attempts}`;
        } catch (error) {
          if (error.message && /expir/i.test(error.message)) {
            window.clearInterval(timer);
            reject(error);
            return;
          }
          if (status) status.textContent = error.message || 'Ainda não foi possível confirmar o pagamento.';
        }
        if (attempts >= 45) {
          window.clearInterval(timer);
          reject(new Error('Ainda não recebemos a confirmação do Pix. Se você já pagou, aguarde alguns segundos e atualize a agenda.'));
        }
      }, 7000);
    });
  }


  function loadMercadoPagoSdk() {
    if (window.MercadoPago) return Promise.resolve();
    if (window.__petfunnyMpSdkPromise) return window.__petfunnyMpSdkPromise;
    window.__petfunnyMpSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://sdk.mercadopago.com/js/v2';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o módulo de pagamento. Verifique sua conexão e tente novamente.'));
      document.head.appendChild(script);
    });
    return window.__petfunnyMpSdkPromise;
  }

  async function mountMercadoPagoPaymentBrick(intent = {}, paymentKind = 'appointment') {
    const status = document.getElementById('pix-payment-status');
    const container = document.getElementById('mp-payment-brick');
    if (!container) return;
    if (!intent.mercadoPagoPublicKey) {
      if (status) status.textContent = 'Pagamento por cartão indisponível: chave pública ausente.';
      return;
    }
    try {
      if (status) status.textContent = 'Carregando formulário seguro de pagamento...';
      await loadMercadoPagoSdk();
      window.petfunnyPaymentBrickController?.unmount?.();
      const mp = new window.MercadoPago(intent.mercadoPagoPublicKey, { locale: 'pt-BR' });
      const bricksBuilder = mp.bricks();
      const amount = Number(((Number(intent.amountCents || 0) || 0) / 100).toFixed(2));
      // REV139: usar Card Payment Brick, não Payment Brick genérico.
      // O Payment Brick genérico valida `bankTransfer`; quando configurado como `none`,
      // Alguns provedores podem disparar erro para métodos não suportados; deixamos apenas cartão.
      // Como o Pix já possui fluxo próprio no app, cartão deve usar o Brick exclusivo de cartão.
      window.petfunnyPaymentBrickController = await bricksBuilder.create('cardPayment', 'mp-payment-brick', {
        initialization: {
          amount,
          payer: { email: intent.payerEmail || '' }
        },
        customization: {
          visual: { style: { theme: 'default' } },
          paymentMethods: {
            maxInstallments: 6
          }
        },
        callbacks: {
          onReady: () => {
            if (status) status.textContent = 'Preencha os dados do cartão para concluir.';
          },
          onSubmit: (formData) => new Promise(async (resolve, reject) => {
            try {
              if (status) status.textContent = 'Processando cartão...';
              const endpoint = paymentKind === 'package'
                ? `/app/packages/payment/${intent.id}/card`
                : paymentKind === 'teleconsultation'
                  ? `/app/teleconsultations/payment/${intent.id}/card`
                  : `/app/appointments/payment/${intent.id}/card`;
              const response = await clientApi.post(endpoint, formData || {});
              if (response.appointment || response.customerPackageId || response.teleconsultationId || response.paymentIntent?.status === 'paid') {
                clearRoletaScheduleContext();
                sessionStorage.removeItem('petfunny_pending_pix_intent');
                localStorage.removeItem('petfunny_last_pending_pix_intent');
                const target = paymentKind === 'package' ? '/app/pacotes' : paymentKind === 'teleconsultation' ? '/app/teleconsultas' : '/app/agenda';
                const label = paymentKind === 'package' ? 'Ver meus pacotes' : paymentKind === 'teleconsultation' ? 'Ver Tele Consultas' : 'Ver minha agenda';
                document.getElementById('pix-page-card').innerHTML = `<div class="client-pix-status">${escapeHtml(response.message || 'Pagamento aprovado com sucesso.')}</div><a class="btn" href="${target}">${label}</a>`;
                toast(response.message || 'Pagamento aprovado.');
                resolve();
                return;
              }
              if (status) status.textContent = response.message || 'Pagamento enviado e aguardando confirmação.';
              resolve();
            } catch (error) {
              if (status) status.textContent = error.message || 'Não foi possível processar o cartão.';
              openModal('Pagamento não aprovado', `<p>${escapeHtml(error.message || 'Revise os dados do cartão e tente novamente.')}</p>`, '<button class="btn" data-close-modal>OK</button>');
              reject(error);
            }
          }),
          onError: (error) => {
            if (status) status.textContent = error?.message || 'Erro no formulário seguro de pagamento.';
          }
        }
      });
    } catch (error) {
      if (status) status.textContent = error.message || 'Não foi possível iniciar o pagamento por cartão.';
    }
  }

  function goToPaymentPage(intent, kind = 'appointment') {
    if (!intent?.id) {
      openModal('Pix não gerado', '<p>Não recebemos o identificador do pagamento. Tente novamente.</p>', '<button class="btn" data-close-modal>OK</button>');
      return;
    }
    sessionStorage.setItem('petfunny_pending_pix_intent', JSON.stringify(intent));
    localStorage.setItem('petfunny_last_pending_pix_intent', JSON.stringify(intent));
    window.location.href = `/app/pagamento-pix?intent=${encodeURIComponent(intent.id)}&kind=${encodeURIComponent(kind)}`;
  }

  async function bindPixPaymentPage() {
    const card = document.getElementById('pix-page-card');
    if (!card) return;
    const params = new URLSearchParams(window.location.search);
    const intentId = params.get('intent');
    const rawPaymentKind = params.get('kind');
    const paymentKind = ['package', 'teleconsultation'].includes(rawPaymentKind) ? rawPaymentKind : 'appointment';
    if (!intentId) {
      card.innerHTML = '<div class="client-pix-status">Pagamento não encontrado. Volte para a agenda e gere um novo Pix.</div><a class="btn" href="/app/agenda">Voltar para agenda</a>';
      return;
    }
    let intent = null;
    try { intent = JSON.parse(sessionStorage.getItem('petfunny_pending_pix_intent') || localStorage.getItem('petfunny_last_pending_pix_intent') || 'null'); } catch {}
    try {
      const response = await clientApi.get(paymentKind === 'package' ? `/app/packages/payment/${intentId}` : paymentKind === 'teleconsultation' ? `/app/teleconsultations/payment/${intentId}` : `/app/appointments/payment/${intentId}`);
      intent = response.paymentIntent || intent;
      if (response.appointment || intent?.status === 'paid') {
        clearRoletaScheduleContext();
        card.innerHTML = `<div class="client-pix-status">${escapeHtml(response.message || 'Pagamento confirmado com sucesso.')}</div><a class="btn" href="${paymentKind === 'teleconsultation' ? '/app/teleconsultas' : '/app/agenda'}">${paymentKind === 'teleconsultation' ? 'Ver Tele Consultas' : 'Ver minha agenda'}</a><a class="btn btn-secondary" href="/app/pacotes">Ver pacotes</a>`;
        return;
      }
    } catch {}
    if (!intent) {
      card.innerHTML = '<div class="client-pix-status">Não foi possível carregar o Pix. Volte para a agenda e tente novamente.</div><a class="btn" href="/app/agenda">Voltar para agenda</a>';
      return;
    }
    card.innerHTML = paymentPageHtml(intent) + '<div class="client-card-actions"><a class="btn btn-ghost" href="/app/agenda">Cancelar e voltar</a></div>';
    if (['card', 'wallet'].includes(String(intent.paymentType || 'pix').toLowerCase())) {
      await mountMercadoPagoPaymentBrick(intent, paymentKind);
      return;
    }
    const copyPix = async () => {
      const code = document.getElementById('pix-copy-code')?.value || '';
      try { await navigator.clipboard.writeText(code); toast('Código Pix copiado.'); } catch { toast('Copie o código Pix manualmente.'); }
    };
    document.getElementById('copy-pix-code-inline')?.addEventListener('click', copyPix);
    try {
      const paid = await waitPixConfirmation(intentId, paymentKind);
      clearRoletaScheduleContext();
      sessionStorage.removeItem('petfunny_pending_pix_intent');
      card.innerHTML = `<div class="client-pix-status">${escapeHtml(paid.message || 'Pagamento confirmado com sucesso.')}</div><a class="btn" href="/app/agenda">Ver minha agenda</a><a class="btn btn-secondary" href="/app/pacotes">Ver pacotes</a>`;
    } catch (error) {
      card.innerHTML += `<div class="client-pix-status">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadAppAvailableSlots(dateValue, selectedTime = '') {
    const select = document.getElementById('appointment-time');
    const hint = document.getElementById('appointment-time-hint');
    if (!select || !dateValue) return;
    const promo = getPromotionScheduleContext()?.promo;
    if (promo && !isDateAllowedByPromotion(dateValue, promo)) {
      select.innerHTML = '<option value="">Promoção indisponível neste dia</option>';
      select.disabled = true;
      if (hint) hint.textContent = `Esta promoção vale somente em ${promotionAllowedDaysText(promo)}.`;
      return;
    }
    select.innerHTML = '<option value="">Carregando horários...</option>';
    if (hint) hint.textContent = 'Consultando vagas disponíveis nas Configurações do PetFunny...';
    try {
      const response = await clientApi.get(`/app/availability?date=${encodeURIComponent(dateValue)}`);
      const slots = response.slots || [];
      if (!slots.length) {
        select.innerHTML = '<option value="">Sem horários disponíveis</option>';
        select.disabled = true;
        if (hint) hint.textContent = 'Esta data não tem horários disponíveis. Escolha outra data.';
        return;
      }
      select.disabled = false;
      const preferred = selectedTime || initialScheduleTime(dateValue);
      select.innerHTML = slots.map((slot) => `<option value="${escapeHtml(slot.time)}" ${String(slot.time) === String(preferred).slice(0, 5) ? 'selected' : ''}>${escapeHtml(slot.label || slot.time)}</option>`).join('');
      if (hint) hint.textContent = 'Somente horários com vagas configuradas aparecem aqui.';
      if (![...select.options].some((option) => option.selected)) select.selectedIndex = 0;
    } catch (error) {
      select.innerHTML = '<option value="">Erro ao carregar horários</option>';
      select.disabled = true;
      if (hint) hint.textContent = error.message || 'Não foi possível carregar os horários.';
    }
  }

  function bindAppointmentAvailability() {
    const form = document.getElementById('appointment-form');
    if (!form) return;
    const dateInput = form.querySelector('[name="appointmentDate"]');
    const timeSelect = form.querySelector('[name="appointmentTime"]');
    if (!dateInput || !timeSelect) return;
    loadAppAvailableSlots(dateInput.value, timeSelect.value);
    dateInput.addEventListener('change', () => loadAppAvailableSlots(dateInput.value, ''));
  }

  function bindTimelineInfinite() {
    timelineObserver?.disconnect?.();
    const sentinel = document.getElementById('client-timeline-sentinel');
    const list = document.getElementById('client-timeline-list');
    const loader = document.getElementById('client-timeline-loader');
    if (!sentinel || !list) return;
    const total = timelinePosts().length;
    if (timelineVisibleCount >= total && loader) loader.hidden = true;
    timelineObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (timelineVisibleCount >= total) { if (loader) loader.hidden = true; return; }
      timelineVisibleCount += timelineStep;
      list.innerHTML = renderTimelineItems();
      if (timelineVisibleCount >= timelinePosts().length && loader) loader.hidden = true;
    }, { rootMargin: '260px' });
    timelineObserver.observe(sentinel);
  }


  function parsePetRecordPayload(record = {}) {
    const out = { ...record };
    if (String(out.type || '').toUpperCase() === 'DOCUMENT') {
      try {
        const parsed = JSON.parse(out.description || '{}');
        out.description = parsed.description || '';
        out.fileName = parsed.fileName || '';
        out.fileDataUrl = parsed.fileDataUrl || '';
      } catch (_) {}
    }
    return out;
  }

  async function loadPetRecordsList() {
    const box = document.getElementById('pet-records-list');
    if (!box) return;
    const petId = box.dataset.petId || '';
    const type = box.dataset.recordType || '';
    if (!petId || !type) return;
    try {
      const response = await clientApi.get(`/app/pets/${encodeURIComponent(petId)}/records?type=${encodeURIComponent(type)}`);
      const records = (response.records || []).map(parsePetRecordPayload);
      window.__petfunnyPetRecords = records;
      box.innerHTML = records.length ? records.map(renderPetRecordCard).join('') : empty(type === 'DOCUMENT' ? '📎' : '📝', 'Nenhum registro ainda', 'Use o botão Novo registro para cadastrar o primeiro item desta área.');
    } catch (error) {
      box.innerHTML = `<div class="client-alert-soft">Não foi possível carregar registros: ${escapeHtml(error.message)}</div>`;
    }
  }

  function bindPetDetailEvents() {
    if (document.body.dataset.petDetailEventsBound === '1') return;
    document.body.dataset.petDetailEventsBound = '1';
    document.body.addEventListener('click', async (event) => {
      const newRecordButton = event.target?.closest?.('[data-new-pet-record]');
      if (newRecordButton) {
        const type = newRecordButton.dataset.newPetRecord || 'NOTE';
        const area = newRecordButton.dataset.recordArea || '';
        const petId = newRecordButton.dataset.petId || '';
        const [title] = petAreaTitle(area);
        openModal(`Novo registro · ${title}`, petRecordFormHtml({ petId, type, area }), '<button class="btn btn-secondary" data-close-modal>Cancelar</button>');
        return;
      }
      const editRecordButton = event.target?.closest?.('[data-edit-pet-record]');
      if (editRecordButton) {
        const record = (window.__petfunnyPetRecords || []).find((item) => String(item.id) === String(editRecordButton.dataset.editPetRecord));
        const route = currentPetRoute();
        if (!record) return;
        openModal('Editar registro', petRecordFormHtml({ petId: route.petId, type: record.type, area: route.area, record }), '<button class="btn btn-secondary" data-close-modal>Cancelar</button>');
        return;
      }
      const deleteRecordButton = event.target?.closest?.('[data-delete-pet-record]');
      if (deleteRecordButton) {
        const route = currentPetRoute();
        if (!confirm('Excluir este registro do pet?')) return;
        try {
          await clientApi.delete(`/app/pets/${encodeURIComponent(route.petId)}/records/${encodeURIComponent(deleteRecordButton.dataset.deletePetRecord)}`);
          toast('Registro excluído.');
          await loadPetRecordsList();
        } catch (error) {
          openModal('Erro ao excluir registro', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
        }
      }
    });

    document.body.addEventListener('change', (event) => {
      const fileInput = event.target?.matches?.('[data-document-input]') ? event.target : null;
      if (!fileInput?.files?.[0]) return;
      const file = fileInput.files[0];
      if (file.size > 1500 * 1024) { toast('Use um arquivo com até 1,5 MB para manter o app leve.', 'error'); fileInput.value = ''; return; }
      const form = fileInput.closest('form');
      const reader = new FileReader();
      reader.onload = () => {
        const hidden = form?.querySelector('input[name="fileDataUrl"]');
        const fileName = form?.querySelector('input[name="fileName"]');
        const preview = form?.querySelector('.client-document-preview');
        if (hidden) hidden.value = String(reader.result || '');
        if (fileName) fileName.value = file.name;
        if (preview) preview.textContent = `Arquivo selecionado: ${file.name}`;
      };
      reader.readAsDataURL(file);
    });

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'pet-record-form') return;
      event.preventDefault();
      const form = event.target;
      const petId = form.dataset.petId || '';
      const recordId = form.dataset.recordId || '';
      const payload = formPayload(form);
      payload.type = form.dataset.recordType || 'NOTE';
      if (payload.type === 'DOCUMENT') {
        payload.description = JSON.stringify({ description: payload.description || '', fileName: payload.fileName || '', fileDataUrl: payload.fileDataUrl || '' });
      }
      try {
        const url = `/app/pets/${encodeURIComponent(petId)}/records${recordId ? `/${encodeURIComponent(recordId)}` : ''}`;
        const response = recordId ? await clientApi.put(url, payload) : await clientApi.post(url, payload);
        closeModal();
        toast(response.message || 'Registro salvo.');
        await loadPetRecordsList();
      } catch (error) {
        openModal('Não foi possível salvar registro', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });
  }

  function bindEvents() {
    bindPushEvents();
    bindTimelineInfinite();
    bindPixPaymentPage();
    document.getElementById('client-logout-profile')?.addEventListener('click', () => { clientLogout(); });
    if (currentClientSection() === 'bemestar') { loadWellbeingPanel(new URLSearchParams(window.location.search).get('petId') || ''); }
    if (currentClientSection() === 'saude') { loadHealth360Panel(new URLSearchParams(window.location.search).get('petId') || ''); }
    if (currentClientSection() === 'teleconsultas') { loadTeleconsultasAppointments(); }
    document.querySelector('[name="wellbeingPetId"]')?.addEventListener('change', (event) => loadWellbeingPanel(event.target.value));
    document.querySelector('[name="healthPetId"]')?.addEventListener('change', (event) => loadHealth360Panel(event.target.value));
    document.querySelector('[name="momentsPetId"]')?.addEventListener('change', async (event) => {
      const url = new URL(window.location.href);
      if (event.target.value) url.searchParams.set('petId', event.target.value);
      else url.searchParams.delete('petId');
      window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : ''));
      await reload('momentos');
    });
    syncDigitalWalletPaymentOptions();
    bindAppointmentAvailability();
    document.getElementById('appointment-form')?.addEventListener('change', (event) => {
      if (event.target.name === 'petId') {
        document.getElementById('services-list').innerHTML = renderServiceChecks(serviceOptionsForPet(event.target.value));
        syncTosaServiceAvailability();
        refreshTransportEstimate().catch(() => null);
      }
      if (event.target.name === 'serviceIds') {
        syncTosaServiceAvailability();
        refreshTransportEstimate({ forceModal: isTransportSelected(event.currentTarget) }).catch(() => null);
      }
      if (event.target.name === 'appointmentDate') {
        const form = event.currentTarget;
        const petValue = form.querySelector('[name="petId"]')?.value || '';
        const promo = getPromotionScheduleContext()?.promo;
        if (promo && !isDateAllowedByPromotion(event.target.value, promo)) {
          document.getElementById('appointment-time').innerHTML = '<option value="">Promoção indisponível neste dia</option>';
          document.getElementById('appointment-time').disabled = true;
          document.getElementById('appointment-time-hint').textContent = `Esta promoção vale somente em ${promotionAllowedDaysText(promo)}.`;
        }
        document.getElementById('services-list').innerHTML = renderServiceChecks(serviceOptionsForPet(petValue));
        syncTosaServiceAvailability();
        refreshTransportEstimate().catch(() => null);
      }
    });
    syncTosaServiceAvailability();

    document.body.addEventListener('click', (event) => {
      const petButton = event.target?.closest?.('[data-select-appointment-pet]');
      if (petButton) {
        const picker = petButton.closest('.client-appointment-pet-picker');
        const form = picker?.closest('form') || document.getElementById('appointment-form');
        const inputName = picker?.dataset.petPickerName || 'petId';
        const input = picker?.querySelector('input[type="hidden"]') || form?.querySelector(`[name="${inputName}"]`) || form?.querySelector('[name="petId"]');
        const petId = petButton.dataset.selectAppointmentPet || '';
        if (input) {
          input.value = petId;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        picker?.querySelectorAll('[data-select-appointment-pet]').forEach((btn) => btn.classList.toggle('is-selected', btn === petButton));
        const servicesList = document.getElementById('services-list');
        if (servicesList && form?.id === 'appointment-form') {
          servicesList.innerHTML = renderServiceChecks(serviceOptionsForPet(petId));
          syncTosaServiceAvailability();
          refreshTransportEstimate().catch(() => null);
        }
        const teleFlow = document.getElementById('teleconsultas-flow');
        if (teleFlow && form?.id === 'teleconsultas-pet-form') {
          teleFlow.innerHTML = '<article class="client-empty"><span>📹</span><h3>Consulta veterinária online</h3><p>Toque em Agendar consulta para ver veterinários e horários disponíveis.</p></article>';
        }
        return;
      }
      const editTransportButton = event.target?.closest?.('[data-edit-transport-address]');
      if (editTransportButton) {
        openTransportAddressModal().catch(() => null);
        return;
      }
      const addPetButton = event.target?.closest?.('[data-add-pet-agenda]');
      if (addPetButton) {
        window.__petfunnyPetFormReturn = addPetButton.dataset.addPetReturn || currentClientSection() || 'agenda';
        openModal('Adicionar pet', petForm());
      }
    });

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'transport-address-form') return;
      event.preventDefault();
      try {
        const payload = formPayload(event.target);
        const response = await clientApi.put('/app/profile', payload);
        data.tutor = response.tutor || { ...(data.tutor || {}), ...payload };
        closeModal();
        toast(response.message || 'Endereço salvo.');
        await refreshTransportEstimate();
      } catch (error) {
        openModal('Não foi possível salvar endereço', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'wellbeing-form') return;
      event.preventDefault();
      const form = event.target;
      const petId = form.dataset.petId || document.querySelector('[name="wellbeingPetId"]')?.value || '';
      const answers = {};
      [...form.elements].forEach((element) => {
        if (!element.name || element.tagName === 'BUTTON') return;
        if ((element.type === 'radio' || element.type === 'checkbox') && !element.checked) return;
        answers[element.name] = element.value;
      });
      const analysis = openAnalysisModal(18);
      try {
        const response = await clientApi.post(`/app/pets/${petId}/wellbeing/assessment`, { answers });
        analysis.finish();
        await loadWellbeingPanel(petId);
        openModal('Diagnóstico PetFunny 360 gerado', renderWellbeingDiagnostic(response.diagnostic), '<button class="btn" data-close-modal>OK</button>');
        toast(response.message || 'Diagnóstico gerado.');
      } catch (error) {
        analysis.close();
        openModal('Não foi possível gerar o diagnóstico', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'caregiver-form') return;
      event.preventDefault();
      const form = event.target;
      const petId = form.dataset.petId || document.querySelector('[name="wellbeingPetId"]')?.value || '';
      try {
        const response = await clientApi.post(`/app/pets/${petId}/caregivers/invite`, formPayload(form));
        toast(response.message || 'Responsável autorizado.');
        await loadWellbeingPanel(petId);
      } catch (error) {
        openModal('Não foi possível autorizar responsável', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });



    document.body.addEventListener('click', async (event) => {
      const deleteMomentButton = event.target?.closest?.('[data-delete-moment]');
      if (deleteMomentButton) {
        const mediaId = deleteMomentButton.dataset.deleteMoment || '';
        if (!mediaId) return;
        if (!confirm('Apagar esta foto ou vídeo dos Momentos Especiais?')) return;
        try {
          await clientApi.delete(`/app/media/${encodeURIComponent(mediaId)}`);
          toast('Momento apagado.');
          await reload('momentos');
        } catch (error) {
          openModal('Não foi possível apagar o momento', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
        }
        return;
      }

      const shareMomentButton = event.target?.closest?.('[data-share-moment]');
      if (shareMomentButton) {
        const url = shareMomentButton.dataset.shareMoment || '';
        const caption = shareMomentButton.dataset.shareCaption || 'Momento PetFunny';
        const shareData = { title: 'Momento PetFunny', text: caption, url };
        try {
          if (navigator.share && url) await navigator.share(shareData);
          else if (url && navigator.clipboard) { await navigator.clipboard.writeText(url); toast('Link do momento copiado.'); }
          else toast('Momento pronto para compartilhar.');
          clientApi.post('/app/rewards/share-event', { eventType: 'share_media' }).catch(() => null);
        } catch (_) {}
        return;
      }
      if (event.target?.closest?.('[data-open-moment-camera]')) {
        const input = document.querySelector('[data-moment-upload-input]');
        if (!input?.dataset.petId) { toast('Escolha um pet antes de enviar o momento.', 'error'); return; }
        input.click();
        return;
      }
      const dailyButton = event.target?.closest?.('[data-open-daily-triage]');
      if (dailyButton) {
        openModal('Triagem diária Saúde 360', dailyTriageForm(dailyButton.dataset.openDailyTriage || ''), '<button class="btn btn-secondary" data-close-modal>Cancelar</button>');
      }
      if (event.target?.id === 'open-health-triage') {
        openModal('Meu pet está estranho', healthTriageForm(), '<button class="btn btn-secondary" data-close-modal>Cancelar</button>');
      }
      if (event.target?.id === 'open-teleconsultation') {
        openModal('Agendar teleconsulta', teleconsultationForm(), '<button class="btn btn-secondary" data-close-modal>Cancelar</button>');
        window.setTimeout(syncHealth360TeleSlots, 0);
      }
      const teleStart = event.target?.closest?.('#teleconsultas-start');
      if (teleStart) {
        const petId = document.querySelector('#teleconsultas-pet-form [name="petId"]')?.value || '';
        await loadTeleconsultasData(petId);
        return;
      }
      const teleVetButton = event.target?.closest?.('[data-tele-select-vet]');
      if (teleVetButton) {
        renderTeleconsultasVetDetail(teleVetButton.dataset.teleSelectVet || '');
        return;
      }
      if (event.target?.closest?.('[data-tele-back-vets]')) {
        renderTeleconsultasVetList();
        return;
      }
      const teleSlotButton = event.target?.closest?.('[data-tele-select-slot]');
      if (teleSlotButton) {
        const form = document.getElementById('teleconsultation-form');
        if (form?.slotId) form.slotId.value = teleSlotButton.dataset.teleSelectSlot || '';
        document.querySelectorAll('[data-tele-select-slot]').forEach((btn) => btn.classList.toggle('selected', btn === teleSlotButton));
        return;
      }
      const selectVetButton = event.target?.closest?.('[data-select-vet]');
      if (selectVetButton) {
        const form = document.getElementById('teleconsultation-form');
        if (form?.veterinarianId) {
          form.veterinarianId.value = selectVetButton.dataset.selectVet || '';
          if (form.slotId) form.slotId.value = '';
          syncHealth360TeleSlots();
        }
      }
      const viewVetButton = event.target?.closest?.('[data-view-vet]');
      if (viewVetButton) showHealth360VetDetails(viewVetButton.dataset.viewVet || '');
      const selectSlotButton = event.target?.closest?.('[data-select-slot]');
      if (selectSlotButton) {
        const form = document.getElementById('teleconsultation-form');
        if (form?.slotId) {
          form.slotId.value = selectSlotButton.dataset.selectSlot || '';
          syncHealth360TeleSlots();
        }
      }
    });

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'health-daily-triage-form') return;
      event.preventDefault();
      try {
        const response = await clientApi.post('/app/health360/triage', formPayload(event.target));
        closeModal();
        await loadHealth360Panel(event.target.petId?.value || '');
        openModal('PetFunny Health Insight™', renderHealth360InsightModal(response), '<button class="btn" data-close-modal>OK</button>');
      } catch (error) {
        openModal('Não foi possível salvar triagem diária', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'health-triage-form') return;
      event.preventDefault();
      try {
        const response = await clientApi.post('/app/health360/triage', formPayload(event.target));
        closeModal();
        await loadHealth360Panel(event.target.petId?.value || '');
        openModal('Triagem Saúde 360 IA', renderHealth360InsightModal(response), '<button class="btn" data-close-modal>OK</button>');
      } catch (error) {
        openModal('Não foi possível gerar triagem', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'teleconsultation-form') return;
      event.preventDefault();
      try {
        if (!event.target.veterinarianId?.value) throw new Error('Selecione um veterinário.');
        if (!event.target.slotId?.value) throw new Error('Selecione um dia e horário disponível.');
        const response = await clientApi.post('/app/teleconsultations', formPayload(event.target));
        closeModal();
        if (response.requiresPayment && response.paymentIntent) {
          goToPaymentPage(response.paymentIntent, 'teleconsultation');
          return;
        }
        toast(response.message || 'Teleconsulta solicitada.');
        if (currentClientSection() === 'teleconsultas') await loadTeleconsultasAppointments();
        else await loadHealth360Panel(event.target.petId?.value || '');
      } catch (error) {
        openModal('Não foi possível solicitar teleconsulta', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });

    document.getElementById('appointment-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = formPayload(form);
      payload.startsAt = localStartsAt(payload.appointmentDate, payload.appointmentTime);
      delete payload.appointmentDate;
      delete payload.appointmentTime;
      payload.serviceIds = [...form.querySelectorAll('input[name="serviceIds"]:checked')].map((input) => input.value);
      const promo = getPromotionScheduleContext()?.promo;
      if (promo && !isDateAllowedByPromotion(String(payload.startsAt).slice(0, 10), promo)) {
        openModal('Promoção indisponível nesta data', `<p>A promoção <strong>${escapeHtml(promo.title)}</strong> vale somente em ${escapeHtml(promotionAllowedDaysText(promo))}. Escolha uma data válida para continuar.</p>`, '<button class="btn" data-close-modal>OK</button>');
        return;
      }
      if (!payload.startsAt || form.querySelector('[name="appointmentTime"]')?.disabled) {
        openModal('Escolha um horário', '<p>Selecione uma data e um horário disponível para continuar.</p>', '<button class="btn" data-close-modal>OK</button>');
        return;
      }
      if (!payload.serviceIds.some((serviceId) => {
        const service = (options.services || []).find((item) => String(item.id) === String(serviceId));
        return isBathService(service || {});
      }) && payload.serviceIds.some((serviceId) => {
        const service = (options.services || []).find((item) => String(item.id) === String(serviceId));
        return isTosaService(service || {});
      })) {
        openModal('Banho obrigatório para tosa', '<p>Para selecionar serviços de tosa, escolha primeiro um banho no agendamento.</p>', '<button class="btn" data-close-modal>OK</button>');
        return;
      }
      if (isTransportSelected(form)) {
        const estimate = await refreshTransportEstimate({ forceModal: true });
        if (!estimate || estimate.requiresAddress) return;
        payload.transportRequested = true;
      }
      try {
        const response = await clientApi.post('/app/appointments', payload);
        if (response.requiresPayment && response.paymentIntent) {
          goToPaymentPage(response.paymentIntent);
          return;
        }
        clearRoletaScheduleContext();
        toast(response.message || 'Agendamento criado.');
        await reload('agenda');
      } catch (error) { openModal('Não foi possível criar o agendamento', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>'); }
    });

    document.getElementById('new-pet')?.addEventListener('click', () => { window.__petfunnyPetFormReturn = 'pets'; openModal('Novo pet', petForm()); });
    document.querySelectorAll('[data-edit-pet]').forEach((button) => button.addEventListener('click', () => {
      const pet = data.pets.find((item) => item.id === button.dataset.editPet);
      openModal('Editar pet', petForm(pet || {}));
    }));
    document.querySelectorAll('[data-delete-pet]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Remover este pet do app?')) return;
      try { await clientApi.delete(`/app/pets/${button.dataset.deletePet}`); toast('Pet removido.'); await reload('pets'); } catch (error) { openModal('Erro ao remover pet', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>'); }
    }));
    document.body.addEventListener('change', (event) => {
      if (event.target?.name === 'breed' && event.target.closest('#pet-form')) applyAppBreedSuggestion(event.target.closest('#pet-form'));
      const momentInput = event.target?.matches?.('[data-moment-upload-input]') ? event.target : null;
      if (momentInput?.files?.[0]) {
        const file = momentInput.files[0];
        const petId = momentInput.dataset.petId || '';
        if (!petId) { toast('Escolha um pet antes de enviar o momento.', 'error'); momentInput.value = ''; return; }
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast('Escolha uma foto ou vídeo válido.', 'error'); momentInput.value = ''; return; }
        if (file.size > 7 * 1024 * 1024) { toast('Use um arquivo com até 7 MB.', 'error'); momentInput.value = ''; return; }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await clientApi.post(`/app/pets/${encodeURIComponent(petId)}/media`, {
              dataUrl: String(reader.result || ''),
              caption: 'Momento enviado pelo tutor',
              mediaType: file.type.startsWith('video/') ? 'video' : 'photo'
            });
            toast('Momento enviado com sucesso.');
            await reload('momentos');
          } catch (error) {
            openModal('Não foi possível enviar o momento', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>');
          } finally {
            momentInput.value = '';
          }
        };
        reader.readAsDataURL(file);
        return;
      }
      const fileInput = event.target?.matches?.('[data-photo-input]') ? event.target : null;
      if (fileInput?.files?.[0]) {
        const file = fileInput.files[0];
        if (!file.type.startsWith('image/')) { toast('Escolha um arquivo de imagem válido.', 'error'); return; }
        if (file.size > 750 * 1024) { toast('Use uma foto com até 700 KB para manter o app leve.', 'error'); fileInput.value = ''; return; }
        const fieldName = fileInput.dataset.photoInput;
        const reader = new FileReader();
        reader.onload = () => {
          const value = String(reader.result || '');
          const form = fileInput.closest('form');
          const hidden = form?.querySelector(`input[type="hidden"][name="${fieldName}"]`);
          const preview = form?.querySelector(`[data-photo-preview="${fieldName}"]`);
          if (hidden) hidden.value = value;
          if (preview) preview.innerHTML = `<img src="${escapeHtml(value)}" alt="Prévia da foto">`;
        };
        reader.readAsDataURL(file);
      }
    });
    document.body.addEventListener('blur', (event) => {
      if (event.target?.name === 'breed' && event.target.closest('#pet-form')) applyAppBreedSuggestion(event.target.closest('#pet-form'));
    }, true);

    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'pet-form') return;
      event.preventDefault();
      const id = event.target.dataset.petId;
      try {
        const payload = formPayload(event.target);
        const response = id ? await clientApi.put(`/app/pets/${id}`, payload) : await clientApi.post('/app/pets', payload);
        const returnSection = window.__petfunnyPetFormReturn || currentClientSection();
        window.__petfunnyPetFormReturn = '';
        closeModal();
        toast(response.message || 'Pet salvo.');
        await reload(renderers[returnSection] ? returnSection : 'pets');
      } catch (error) { openModal('Não foi possível salvar o pet', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>'); }
    });

    function updateSelectedPackagePreview(packageId = '') {
      const pkg = options.packages.find((item) => String(item.id) === String(packageId));
      const preview = document.getElementById('package-preview');
      if (!preview) return;
      if (!pkg) {
        preview.innerHTML = 'Selecione um pacote em card para ver serviços, sessões, economia e valor.';
        return;
      }
      const full = Number(pkg.originalPriceCents || 0) || Math.round(Number(pkg.priceCents || 0) / Math.max(0.01, 1 - (Number(pkg.discountPercent || 0) / 100)));
      const economy = Math.max(0, full - Number(pkg.priceCents || 0));
      preview.innerHTML = `<strong>${escapeHtml(pkg.name)}</strong><br>${escapeHtml(pkg.description || pkg.servicesText || 'Serviços inclusos no pacote')}<br>${pkg.sessionsCount} sessões · ${money(pkg.priceCents)} · ${pkg.appointmentsPerMonth || 4}/mês${economy > 0 ? `<br>Economia estimada: ${money(economy)}` : ''}`;
    }

    document.getElementById('package-form')?.addEventListener('change', (event) => {
      if (event.target.name === 'petId') {
        const form = event.currentTarget;
        const selected = form.querySelector('[name="packageId"]');
        if (selected) selected.value = '';
        const box = document.getElementById('package-card-options');
        if (box) box.innerHTML = renderPackageCardsForPet(event.target.value);
        updateSelectedPackagePreview('');
      }
    });

    document.getElementById('package-form')?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-package-card]');
      if (!card) return;
      const form = event.currentTarget;
      const packageId = card.dataset.packageCard;
      form.querySelectorAll('[data-package-card]').forEach((item) => item.classList.remove('is-selected'));
      card.classList.add('is-selected');
      const input = form.querySelector('[name="packageId"]');
      if (input) input.value = packageId;
      updateSelectedPackagePreview(packageId);
    });
    document.getElementById('package-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = formPayload(event.currentTarget);
      payload.recurring = event.currentTarget.querySelector('[name="recurring"]').checked;
      if (!payload.packageId) { toast('Escolha um pacote em card antes de continuar.', 'error'); return; }
      try {
        const response = await clientApi.post('/app/packages', payload);
        if (response.requiresPayment && response.paymentIntent) {
          goToPaymentPage(response.paymentIntent, 'package');
          return;
        }
        toast(response.message || 'Pacote contratado.');
        await reload('pacotes');
      } catch (error) { openModal('Não foi possível contratar o pacote', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>'); }
    });

    document.getElementById('copy-referral-link')?.addEventListener('click', async (event) => {
      const link = event.currentTarget.dataset.link || '';
      try {
        await navigator.clipboard.writeText(link);
        toast('Link de indicação copiado.');
      } catch (_) {
        openModal('Seu link de indicação', `<p>${escapeHtml(link)}</p>`, '<button class="btn" data-close-modal>OK</button>');
      }
    });

    document.getElementById('referral-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const response = await clientApi.post('/app/referrals', formPayload(event.currentTarget));
        toast('Indicação registrada. Você ganhou ossinhos!');
        if (response.whatsappUrl) window.open(response.whatsappUrl, '_blank', 'noopener');
        await reload('indique');
      } catch (error) { openModal('Não foi possível registrar indicação', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>'); }
    });

    document.getElementById('spin-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const resultBox = document.getElementById('spin-result');
      resultBox.innerHTML = 'Girando a roleta...';
      try {
        const response = await clientApi.post('/app/roleta/spin', formPayload(event.currentTarget));
        const params = new URLSearchParams({
          mimo: response.gift.title || 'Mimo PetFunny',
          desc: response.gift.description || '',
          petId: response.petId || '',
          spinId: response.spinId || ''
        });
        const scheduleUrl = `/app/agenda?${params.toString()}`;
        resultBox.innerHTML = `<div class="client-roleta-result-win"><strong>${escapeHtml(response.gift.title)}</strong><br>${escapeHtml(response.gift.description || 'Mimo registrado no PetFunny.')}<br><small>Vamos abrir o novo agendamento com seu mimo destacado.</small><a class="btn btn-sm" href="${scheduleUrl}">Agendar usando este mimo</a></div>`;
        document.querySelector('.client-roulette-wheel')?.classList.add('is-spinning');
        toast(response.message || 'Mimo sorteado.');
        window.setTimeout(() => { window.location.href = scheduleUrl; }, 1800);
      } catch (error) { resultBox.innerHTML = escapeHtml(error.message); }
    });

    document.getElementById('profile-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { const response = await clientApi.put('/app/profile', formPayload(event.currentTarget)); data.tutor = response.tutor; setClientUser({ account: data.account, tutor: response.tutor }); toast(response.message || 'Perfil atualizado.'); await reload('perfil'); } catch (error) { openModal('Erro ao salvar perfil', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>'); }
    });
    document.getElementById('password-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try { const response = await clientApi.put('/app/password', formPayload(event.currentTarget)); event.currentTarget.reset(); toast(response.message || 'Senha atualizada.'); } catch (error) { openModal('Erro ao atualizar senha', `<p>${escapeHtml(error.message)}</p>`, '<button class="btn" data-close-modal>OK</button>'); }
    });
  }

  try {
    await consumeMomentsAccessFromUrl();
    await reload(section);
  } catch (error) {
    document.body.innerHTML = `<main class="page-center"><section class="card"><h1>Não foi possível carregar o app.</h1><p>${escapeHtml(error.message)}</p><a class="btn" href="/app/login">Voltar ao login</a></section></main>`;
    finishPageLoading();
  }
