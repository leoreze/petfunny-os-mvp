import { finishPageLoading } from '/assets/js/loading.js';

const $ = (selector) => document.querySelector(selector);
const digits = (value = '') => String(value || '').replace(/\D/g, '');
const safe = (value, fallback = '') => String(value || fallback || '').trim();

function setText(selector, value) {
  const el = $(selector);
  if (el && value) el.textContent = value;
}

function setHref(selector, value) {
  const el = $(selector);
  if (el && value) el.href = value;
}

function socialLabel(key = '') {
  const labels = { instagramUrl: 'Instagram', facebookUrl: 'Facebook', tiktokUrl: 'TikTok', googleBusinessUrl: 'Google', mapsUrl: 'Mapa' };
  return labels[key] || 'Rede social';
}

let siteServices = [];
let sitePetSizes = [];

function renderServiceFilter() {
  const select = $('#service-size-filter');
  if (!select) return;
  const options = ['<option value="all">Todos os portes</option>']
    .concat((sitePetSizes || []).map((size) => `<option value="${safe(size.code)}">${safe(size.name)}</option>`));
  select.innerHTML = options.join('');
  select.addEventListener('change', () => renderServices(siteServices, select.value));
}

function renderServices(services = [], sizeFilter = 'all') {
  const grid = $('#service-grid');
  if (!grid) return;
  const source = Array.isArray(services) && services.length ? services : [
    { name: 'Banho premium', description: 'Higienização cuidadosa, perfume equilibrado e finalização caprichada.', petSize: 'all', petSizeName: 'todos os portes' },
    { name: 'Tosa completa', description: 'Acabamento por porte, estilo, pelagem e necessidade do pet.', petSize: 'all', petSizeName: 'todos os portes' },
    { name: 'Tosa higiênica', description: 'Mais conforto, limpeza e bem-estar para a rotina do pet.', petSize: 'all', petSizeName: 'todos os portes' },
    { name: 'Hidratação', description: 'Tratamento para deixar a pelagem mais macia, bonita e fácil de cuidar.', petSize: 'all', petSizeName: 'todos os portes' }
  ];
  const filtered = sizeFilter && sizeFilter !== 'all'
    ? source.filter((item) => !item.petSize || item.petSize === sizeFilter || item.petSize === 'all')
    : source;
  const icons = ['🛁', '✂️', '💎', '🧼', '🐾', '✨', '🫧', '💖'];
  grid.innerHTML = (filtered.length ? filtered : source).slice(0, 12).map((item, index) => `
    <article class="pf-service-card" data-pet-size="${safe(item.petSize || 'all')}">
      <span>${icons[index % icons.length]}</span>
      <h3>${safe(item.name, 'Serviço PetFunny')}</h3>
      <p>${safe(item.description, `${safe(item.categoryName, 'Cuidado especial')} · ${safe(item.petSizeName || item.petSize, 'todos os portes')}`)}</p>
      <small>${safe(item.petSizeName || item.petSize, 'Todos os portes')}</small>
    </article>
  `).join('');
}

function renderHours(hours = []) {
  const wrap = $('#business-hours');
  if (!wrap) return;
  if (!Array.isArray(hours) || hours.length === 0) {
    wrap.innerHTML = '<span>Horários sob consulta pelo WhatsApp.</span>';
    return;
  }
  wrap.innerHTML = hours.map((item) => `
    <div class="pf-hour-row">
      <strong>${safe(item.weekdayName, 'Dia')}</strong>
      <span>${item.isOpen ? `${safe(item.opensAt, '--:--')} às ${safe(item.closesAt, '--:--')}` : 'Fechado'}</span>
    </div>
  `).join('');
}

function renderSocials(business = {}) {
  const wrap = $('#social-links');
  if (!wrap) return;
  const entries = ['instagramUrl', 'facebookUrl', 'tiktokUrl', 'googleBusinessUrl', 'mapsUrl']
    .map((key) => [key, business[key]])
    .filter(([, value]) => value);
  if (entries.length === 0) {
    wrap.innerHTML = '<span class="pf-social-muted">Redes sociais serão exibidas após configurar no admin.</span>';
    return;
  }
  wrap.innerHTML = entries.map(([key, value]) => `<a href="${value}" target="_blank" rel="noopener">${socialLabel(key)}</a>`).join('');
}

function applySiteData(data = {}) {
  const business = data.business || {};
  const seo = data.seo || {};
  const name = safe(business.businessName, 'PetFunny - Banho e Tosa');
  const city = safe(business.addressCity, 'Ribeirão Preto');
  const state = safe(business.addressState, 'SP');
  const whatsapp = digits(business.whatsapp || '5516981535338');
  const waText = encodeURIComponent('Oi PetFunny! Quero agendar um horário para meu pet.');

  const finalTitle = seo.title || `${name} · Banho e Tosa em ${city}`;
  const finalDescription = seo.description || 'Banho e tosa premium com app do tutor, agendamento online, pacotes, lembretes e roleta de mimos.';
  const finalImage = seo.imageUrl || '/assets/img/logo-petfunny-full.png';
  const finalUrl = business.websiteUrl || window.location.origin + '/';
  document.title = finalTitle;
  const setMeta = (selector, attr, value) => { const el = document.querySelector(selector); if (el && value) el.setAttribute(attr, value); };
  setMeta('meta[name="description"]', 'content', finalDescription);
  setMeta('meta[name="keywords"]', 'content', seo.keywords || 'PetFunny, banho e tosa, Ribeirão Preto, app do tutor, agendamento pet');
  setMeta('meta[property="og:title"]', 'content', finalTitle);
  setMeta('meta[property="og:description"]', 'content', finalDescription);
  setMeta('meta[property="og:image"]', 'content', finalImage);
  setMeta('meta[property="og:url"]', 'content', finalUrl);
  setMeta('meta[name="twitter:title"]', 'content', finalTitle);
  setMeta('meta[name="twitter:description"]', 'content', finalDescription);
  setMeta('meta[name="twitter:image"]', 'content', finalImage);
  setMeta('link[rel="canonical"]', 'href', finalUrl);
  let jsonLd = document.getElementById('site-jsonld');
  if (!jsonLd) { jsonLd = document.createElement('script'); jsonLd.type = 'application/ld+json'; jsonLd.id = 'site-jsonld'; document.head.appendChild(jsonLd); }
  jsonLd.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'PetStore',
    name,
    description: finalDescription,
    image: finalImage,
    telephone: business.whatsapp || '+55 16 98153-5338',
    address: { '@type': 'PostalAddress', streetAddress: [business.addressStreet, business.addressNumber].filter(Boolean).join(', '), addressLocality: city, addressRegion: state, addressCountry: 'BR' },
    url: finalUrl,
    sameAs: [business.instagramUrl, business.facebookUrl, business.tiktokUrl, business.googleBusinessUrl].filter(Boolean)
  });

  setText('.pf-kicker', `${name} · ${city} / ${state}`);
  setText('#site-headline', business.landingHeadline || 'Seu pet cheiroso, feliz e acompanhado de perto por você.');
  setText('#site-subheadline', business.landingSubheadline || 'Banho, tosa, pacotes e mimos em uma experiência premium: você agenda pelo app, acompanha lembretes na timeline e recebe tudo organizado no celular.');
  setText('#contact-business', name);
  setText('#footer-business', name);
  setText('#contact-phone', business.whatsapp ? `WhatsApp: ${business.whatsapp}` : 'WhatsApp: +55 16 98153-5338');

  const addressParts = [business.addressStreet, business.addressNumber, business.addressNeighborhood, city, state].filter(Boolean);
  setText('#contact-address', addressParts.length ? addressParts.join(' · ') : `${city} / ${state}`);

  const waUrl = `https://wa.me/${whatsapp}?text=${waText}`;
  setHref('#hero-whatsapp', waUrl);
  setHref('#contact-whatsapp', waUrl);

  siteServices = data.services || [];
  sitePetSizes = data.petSizes || [];
  renderServiceFilter();
  renderServices(siteServices, $('#service-size-filter')?.value || 'all');
  renderHours(data.businessHours || []);
  renderSocials(business);
}

function bootMenu() {
  const btn = $('[data-menu-toggle]');
  const menu = $('[data-site-menu]');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => menu.classList.toggle('is-open'));
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => menu.classList.remove('is-open')));
}

async function boot() {
  $('#site-year').textContent = new Date().getFullYear();
  bootMenu();
  try {
    const response = await fetch('/api/public/site', { cache: 'no-store' });
    if (response.ok) applySiteData(await response.json());
  } catch {}
  window.setTimeout(() => finishPageLoading(), 250);
}

boot();
