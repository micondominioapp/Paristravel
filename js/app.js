import { PLACES, CATEGORIES, SLOTS, hours } from './data.js';
import { searchPlaces, districtLabel, arrondissement } from './osm.js';
import { photoKey, resolvePhotos, mapTile } from './photos.js';
import { basePrice, visitCost, freeOnDate, freeRuleText, freeForText, museumPassAdvice, euro, MUSEUM_PASS } from './prices.js';
import { placeMatches, nameMatches } from './match.js';
import { encodeTrip, decodeTrip, shareUrl, codeFromHash } from './share.js';
import {
  PARIS, PRIORITY_LABEL, planTrip, rankNow, parisNow, addDays, fmt, toMin, crowdAt, crowdLevel,
  hoursOn, haversineKm, mapsLink, sunset, dow, splitDateTime, travel, MAX_HOTEL_KM,
} from './planner.js';

const STORE_KEY = 'paristravel.v1';
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Estado ----------------
function defaultState() {
  const now = parisNow();
  return {
    trip: {
      arrival: `${addDays(now.date, 1)}T10:00`,
      departure: `${addDays(now.date, 5)}T18:00`,
      arrivalBuffer: 90,
      departureBuffer: 180,
      dayStart: '09:00',
      dayEnd: '22:00',
      mode: 'mixto',
      lunch: true,
      residency: 'non-eea',
      age: 'adult',
      hotel: null,
    },
    selected: {}, // id -> { priority, slot }
    custom: [],
    visited: {},
    reports: {},
    replan: null, // { date, min, pos }
  };
}

let state = load();
let ui = { tab: 'now', cat: 'all', query: '', onlySelected: false, day: null, pos: null, posAt: 0, customPos: null };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s) { const d = defaultState(); return { ...d, ...s, trip: { ...d.trip, ...s.trip } }; }
  } catch { /* estado corrupto o almacenamiento bloqueado */ }
  return defaultState();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ }
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2800);
}

const allPlaces = () => [...PLACES, ...state.custom];
function chosenPlaces() {
  return allPlaces()
    .filter((p) => state.selected[p.id])
    .map((p) => {
      const sel = state.selected[p.id];
      const fixed = sel.fixedDate && sel.fixedTime ? { date: sel.fixedDate, start: toMin(sel.fixedTime) } : null;
      return { ...p, priority: sel.priority ?? 2, slot: sel.slot ?? p.slot, fixed };
    });
}

function tripDates() {
  const a = splitDateTime(state.trip.arrival).date;
  const b = splitDateTime(state.trip.departure).date;
  const out = [];
  if (!a || !b || b < a) return out;
  for (let d = a; d <= b && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------- Ubicación ----------------
function locate({ quiet = false } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { if (!quiet) toast('Tu navegador no permite ubicación'); return resolve(null); }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        ui.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, name: 'Mi ubicación' };
        ui.posAt = Date.now();
        resolve(ui.pos);
      },
      (err) => {
        if (!quiet) toast(err.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener tu ubicación');
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}
const inParis = (pos) => pos && haversineKm(pos, PARIS) < 40;
function startPos() {
  if (inParis(ui.pos)) return ui.pos;
  const h = state.trip.hotel;
  return h && haversineKm(h, PARIS) <= MAX_HOTEL_KM ? h : PARIS;
}

// ---------------- Búsqueda de direcciones (OpenStreetMap) ----------------
async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=fr&viewbox=2.0,49.0,2.6,48.7&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
  if (!res.ok) throw new Error('geocode');
  return (await res.json()).map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), name: r.display_name }));
}
function renderResults(el, results, kind) {
  el.innerHTML = results.length
    ? results.map((r, i) => `<div class="result" data-action="pick-${kind}" data-i="${i}">${esc(r.name)}</div>`).join('')
    : '<p class="muted">Sin resultados</p>';
  el._results = results;
}

// ---------------- Agregar lugar escribiendo solo el nombre ----------------
const norm = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Resume un horario semanal: "Lun–Vie 09:00–18:00 · Sáb 10:00–17:00 · Dom cerrado"
function weekSummary(h) {
  const label = (x) => (!x ? 'cerrado' : x[0] === 0 && x[1] >= 1440 ? '24 h' : `${fmt(x[0])}–${fmt(x[1])}`);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups = [];
  for (const d of order) {
    const l = label(h[d]);
    const g = groups[groups.length - 1];
    if (g && g.l === l) g.to = d; else groups.push({ from: d, to: d, l });
  }
  if (groups.length === 1) return `Todos los días ${groups[0].l}`;
  return groups.map((g) => `${DAY_SHORT[g.from]}${g.to !== g.from ? `–${DAY_SHORT[g.to]}` : ''} ${g.l}`).join(' · ');
}

let searchSeq = 0;
async function searchAndShow() {
  const q = $('#c-query').value.trim();
  const out = $('#c-results');
  if (q.length < 2) return;
  const seq = ++searchSeq;
  const local = allPlaces().filter((p) => placeMatches(q, p));
  const localHtml = local.map((p) => `<div class="found">
      ${photoBox(p)}
      <h4>${(CATEGORIES[p.category] || CATEGORIES.monumento).icon} ${esc(p.name)}</h4>
      ${addressLine(p)}
      <p class="small">${priceTag(basePrice(p, referenceDate(), profile()))}</p>
      <p class="muted small">Ya está en la app con su horario, precios y aforo.</p>
      ${state.selected[p.id] ? '<span class="tag ok">✓ Elegido</span>' : `<button class="btn small" data-action="select-found" data-id="${esc(p.id)}">✓ Lo quiero</button>`}
    </div>`).join('');
  out.innerHTML = `${localHtml}<p class="muted" id="c-status">🔎 Buscando "${esc(q)}" en el mapa…</p>`;
  hydratePhotos(out);
  const month = Number(splitDateTime(state.trip.arrival).date?.slice(5, 7)) - 1;
  try {
    let found = await searchPlaces(q, month, (msg) => { const st = $('#c-status'); if (st && seq === searchSeq) st.textContent = `🔎 ${msg}`; });
    if (seq !== searchSeq) return; // ya hay una búsqueda más nueva
    const known = new Set(state.custom.map((p) => p.osm));
    found = found.filter((f, i) => found.findIndex((g) => g.osm === f.osm) === i)
      // Si OpenStreetMap devuelve un lugar que la app ya trae (mismo sitio), no lo repitas.
      .filter((f) => !allPlaces().some((p) => haversineKm(p, f) < 0.35 && (placeMatches(f.name, p) || placeMatches(f.localName || '', p) || nameMatches(p.name, f.name))));
    ui.found = found;
    out.innerHTML = localHtml + (found.length ? found.map((f, i) => {
      const cat = CATEGORIES[f.category] || CATEGORIES.monumento;
      const tag = f.hoursSource === 'osm' ? '<span class="tag ok">Horario oficial (OpenStreetMap)</span>'
        : '<span class="tag warn">Horario típico estimado: verifícalo</span>';
      return `<div class="found">
        ${photoBox(f)}
        <h4>${cat.icon} ${esc(f.name)}${f.localName && f.localName !== f.name ? ` <span class="muted small">(${esc(f.localName)})</span>` : ''}</h4>
        ${addressLine(f)}
        <p class="muted small">${f.near ? `A ${f.near.meters} m de ${esc(f.near.name)} · ` : ''}${cat.label} · ~${f.duration} min · <a href="${gmapsLink(f)}" target="_blank" rel="noopener">📷 Ver fotos en Google Maps</a></p>
        <p class="week">🕘 ${weekSummary(f.hours)}<br>${tag}</p>
        <p class="small">${priceTag(basePrice(f, referenceDate(), profile()))}${f.price?.estimate ? ' <span class="tag warn">estimado</span>' : ''}${f.website ? ` · <a href="${esc(f.website)}" target="_blank" rel="noopener">web</a>` : ''}</p>
        ${known.has(f.osm) ? '<span class="tag ok">✓ Ya está en tu lista</span>' : `<button class="btn small" data-action="add-found" data-i="${i}">➕ Agregar</button>`}
      </div>`;
    }).join('') : (local.length ? '' : '<p class="muted">No lo encontré. Prueba con otro nombre, agrega la zona (ej. "starbucks ópera") o agrégalo a mano.</p>'));
    hydratePhotos(out);
  } catch {
    if (seq !== searchSeq) return;
    out.innerHTML = `${localHtml}<p class="muted">No se pudo buscar (¿sin conexión?). Puedes agregarlo a mano.</p>`;
  }
}

// ---------------- Fotos y dirección ----------------
function addressLine(p) {
  const n = p.arrondissement || arrondissement(p.postcode);
  const parts = [p.address, p.postcode, n ? districtLabel(n) : (p.city && p.city !== 'Paris' ? p.city : '')].filter(Boolean);
  return parts.length ? `<p class="addr">📍 ${esc(parts.join(' · '))}</p>` : '';
}
function gmapsLink(p) {
  const q = [p.name, p.address, p.postcode, p.city || 'Paris'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function tilesHtml(p) {
  const t = mapTile(p.lat, p.lng);
  let imgs = '';
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const url = t.url.replace(/\/(\d+)\/(\d+)\.png$/, (_, x, y) => `/${+x + dx}/${+y + dy}.png`);
      imgs += `<img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" style="left:${(dx + 1) * 256}px;top:${(dy + 1) * 256}px">`;
    }
  }
  return `<div class="tiles" style="left:calc(50% - ${256 + t.left * 2.56}px);top:calc(50% - ${256 + t.top * 2.56}px)">${imgs}</div><span class="tile-pin">📍</span>`;
}
// Caja de foto: primero intenta una foto libre; si no hay, muestra el mapa del punto exacto.
function photoBox(p) {
  const key = photoKey(p);
  const coords = `data-lat="${p.lat}" data-lng="${p.lng}"`;
  if (!key) return `<div class="photo" ${coords}>${tilesHtml(p)}<span class="credit">Sin foto libre: mapa del lugar</span></div>`;
  return `<div class="photo" data-key="${esc(key)}" ${coords}></div>`;
}
async function hydratePhotos(root) {
  const els = [...root.querySelectorAll('.photo[data-key]:not([data-done])')];
  if (!els.length) return;
  els.forEach((el) => { el.dataset.done = '1'; });
  let map = {};
  try { map = await resolvePhotos(els.map((e) => e.dataset.key)); } catch { /* sin conexión */ }
  for (const el of els) {
    const p = { lat: Number(el.dataset.lat), lng: Number(el.dataset.lng) };
    const fallback = () => { el.innerHTML = `${tilesHtml(p)}<span class="credit">Sin foto libre: mapa del lugar</span>`; };
    const url = map[el.dataset.key];
    if (!url) { fallback(); continue; }
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.className = 'pic';
    img.onerror = fallback;
    img.src = url;
    el.append(img);
    el.insertAdjacentHTML('beforeend', '<span class="credit">Foto: Wikimedia Commons</span>');
  }
}

// ---------------- Precios ----------------
const profile = () => ({ residency: state.trip.residency || 'non-eea', age: state.trip.age || 'adult' });

function priceTag(b) {
  if (!b || !b.known) return '<span class="price unknown">💶 Precio: consulta la web</span>';
  if (b.closed) return '<span class="price closed">❌ Cerrado</span>';
  if (b.free) return `<span class="price free">🆓 ${b.reason && b.reason !== 'Entrada gratuita' ? esc(b.reason) : 'Gratis'}</span>`;
  if (b.range) return `<span class="price">💶 ${euro(b.range[0])}–${euro(b.range[1])} por persona (estimado)</span>`;
  return `<span class="price">💶 ${b.approx ? '≈ ' : ''}${euro(b.amount)}</span>`;
}

// Bloque de precios de la ficha de un lugar: lo esencial visible y el detalle plegado.
function priceBlock(p) {
  const pr = p.price;
  const prof = profile();
  const b = basePrice(p, referenceDate(), prof);
  let head = priceTag(b);
  if (pr?.eea && pr.adult && pr.eea !== pr.adult && !b.free) {
    head += ` <span class="muted small">${prof.residency === 'eea' ? `(fuera de la UE: ${euro(pr.adult)})` : `(residentes UE: ${euro(pr.eea)})`}</span>`;
  }
  if (pr?.pass) head += ' <span class="tag ok">🎫 Museum Pass</span>';
  if (pr?.approx || pr?.estimate || b.range) head += ' <span class="tag warn">aprox.</span>';
  const inTrip = pr?.freeRules ? tripDates().filter((d) => freeOnDate(p, d)).map((d) => `${DAY_SHORT[dow(d)]} ${d.slice(8)}/${d.slice(5, 7)}`) : [];
  if (inTrip.length) head += `<div class="small free-hint">🎉 <strong>Gratis en tu viaje: ${inTrip.join(', ')}</strong></div>`;
  let more = '';
  if (pr?.freeFor?.length) more += `<div>🆓 Gratis para: ${esc(freeForText(pr.freeFor))}</div>`;
  if (pr?.freeRules?.length) more += `<div>🎉 Gratis para todos: ${pr.freeRules.map((r) => esc(freeRuleText(r))).join(' · ')}</div>`;
  if (pr?.options?.length) more += `<ul class="opts">${pr.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`;
  if (pr?.note) more += `<div>ℹ️ ${esc(pr.note)}</div>`;
  if (pr?.people) more += `<div>💬 <em>Lo que dicen los visitantes:</em> ${esc(pr.people)}</div>`;
  if (pr?.web) more += `<div><a href="${esc(pr.web)}" target="_blank" rel="noopener">🌐 Web oficial: confirma precios y reserva</a></div>`;
  return `<div class="prices">${head}${more ? `<details><summary>Ver precios, gratuidades y consejos</summary><div class="small">${more}</div></details>` : ''}</div>`;
}

// ---------------- Aforo (mini gráfico) ----------------
function crowdBars(place, date, nowMin) {
  const hrs = hoursOn(place, date);
  let html = '<div class="bars" aria-label="Aforo estimado por hora">';
  for (let h = 8; h <= 23; h++) {
    const m = h * 60 + 30;
    const open = hrs && m >= hrs[0] && m < hrs[1];
    const c = crowdAt(place, date, m);
    const lvl = crowdLevel(c);
    const isNow = nowMin != null && Math.floor(nowMin / 60) === h;
    html += `<span class="${open ? lvl.cls : 'closed'}${isNow ? ' now' : ''}" style="height:${Math.round(c * 100)}%" title="${h}:00 · ${open ? `${lvl.label} ${Math.round(c * 100)}%` : 'cerrado'}"></span>`;
  }
  return `${html}</div><div class="bars-x"><span>8h</span><span>12h</span><span>16h</span><span>20h</span><span>23h</span></div>`;
}
function badge(c) {
  const l = crowdLevel(c);
  return `<span class="badge ${l.cls}">${l.label} ${Math.round(c * 100)}%</span>`;
}
function hoursText(place, date) {
  const h = hoursOn(place, date);
  if (!h) return 'Cerrado';
  if (h[0] === 0 && h[1] >= 1440) return 'Abierto 24 h';
  return `${fmt(h[0])}–${fmt(h[1])}`;
}
function closedDaysText(place) {
  const c = (place.hours || []).map((h, i) => (h ? null : DAY_SHORT[i])).filter(Boolean);
  return c.length ? `Cierra: ${c.join(', ')}` : 'Abre todos los días';
}

// ---------------- Pestaña LUGARES ----------------
function referenceDate() {
  const now = parisNow();
  const a = splitDateTime(state.trip.arrival).date;
  const d = splitDateTime(state.trip.departure).date;
  return now.date >= a && now.date <= d ? now.date : a || now.date;
}

function renderPlaces() {
  $('#cat-chips').innerHTML = [['all', 'Todos'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, `${v.icon} ${v.label}`])]
    .map(([k, l]) => `<button class="chip ${ui.cat === k ? 'active' : ''}" data-action="cat" data-cat="${k}">${l}</button>`).join('');
  $('#btn-only-selected').classList.toggle('active', ui.onlySelected);
  renderPlacesList();
}

function renderPlacesList() {
  const date = referenceDate();
  const now = parisNow();
  $('#btn-only-selected').textContent = ui.onlySelected ? 'Ver todos' : `Ver solo elegidos (${Object.keys(state.selected).length})`;
  const q = ui.query.trim().toLowerCase();
  const list = allPlaces().filter((p) =>
    (ui.cat === 'all' || p.category === ui.cat) &&
    (!q || placeMatches(q, p)) &&
    (!ui.onlySelected || state.selected[p.id]));

  $('#places-list').innerHTML = `<p class="muted small">Aforo del ${DAY_NAMES[dow(date)].toLowerCase()} ${date}</p>` + list.map((p) => {
    const sel = state.selected[p.id];
    const cat = CATEGORIES[p.category] || CATEGORIES.monumento;
    return `<article class="card place ${sel ? 'selected' : ''} ${state.visited[p.id] ? 'visited' : ''}">
      <input type="checkbox" class="toggle" data-action="toggle" data-id="${esc(p.id)}" ${sel ? 'checked' : ''} aria-label="Quiero ir">
      <div>
        ${photoBox(p)}
        <h3>${cat.icon} ${esc(p.name)} ${state.visited[p.id] ? '✅' : ''}</h3>
        ${addressLine(p)}
        ${priceBlock(p)}
        <div class="meta">
          <span>🕘 ${hoursText(p, date)}</span><span>⏱️ ${p.duration} min</span>
          <span>${closedDaysText(p)}</span>${p.booking ? '<span>🎟️ Reserva recomendada</span>' : ''}
          ${p.capacity ? `<span>👥 ${esc(p.capacity)}</span>` : ''}
        </div>
        ${crowdBars(p, date, date === now.date ? now.min : null)}
        ${p.tip ? `<p class="tip">💡 ${esc(p.tip)}</p>` : ''}
        <p class="small"><a href="${gmapsLink(p)}" target="_blank" rel="noopener">📷 Ver fotos y reseñas en Google Maps</a></p>
        ${p.custom ? `<p class="small muted">🕘 ${weekSummary(p.hours)} ${p.hoursSource === 'estimado' ? '<span class="tag warn">horario estimado</span>' : p.hoursSource === 'osm' ? '<span class="tag ok">OpenStreetMap</span>' : ''}${p.website ? ` · <a href="${esc(p.website)}" target="_blank" rel="noopener">web</a>` : ''}</p>` : ''}
        ${sel ? `<div class="controls">
          <select data-action="priority" data-id="${esc(p.id)}">${[3, 2, 1].map((v) => `<option value="${v}" ${sel.priority === v ? 'selected' : ''}>${PRIORITY_LABEL[v]}</option>`).join('')}</select>
          ${sel.fixedDate ? '' : `<select data-action="slot" data-id="${esc(p.id)}">${Object.entries(SLOTS).map(([k, l]) => `<option value="${k}" ${(sel.slot ?? p.slot) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
          <select data-action="fixed-date" data-id="${esc(p.id)}" aria-label="Día de la reserva">
            <option value="">🕐 Hora: automática</option>
            ${tripDates().map((d) => `<option value="${d}" ${sel.fixedDate === d ? 'selected' : ''}>📌 ${DAY_SHORT[dow(d)]} ${d.slice(8)}/${d.slice(5, 7)}</option>`).join('')}
          </select>
          ${sel.fixedDate ? `<input type="time" class="fixed-time" data-action="fixed-time" data-id="${esc(p.id)}" value="${esc(sel.fixedTime || '')}" aria-label="Hora de la reserva">` : ''}
        </div>
        ${sel.fixedDate && !sel.fixedTime ? '<p class="small" style="color:var(--high)">⏰ Pon la hora de tu reserva para fijarla en el plan.</p>' : ''}
        ${sel.fixedDate && sel.fixedTime ? `<p class="small">📌 Reserva fija: ${DAY_NAMES[dow(sel.fixedDate)].toLowerCase()} ${sel.fixedDate.slice(8)}/${sel.fixedDate.slice(5, 7)} a las ${esc(sel.fixedTime)}. El resto del plan se ordena alrededor.</p>` : ''}
        <div>
          ${p.custom ? `<button class="btn small danger" data-action="remove-custom" data-id="${esc(p.id)}">Eliminar</button>` : ''}
        </div>` : ''}
      </div>
    </article>`;
  }).join('');
  hydratePhotos($('#places-list'));
}

// ---------------- Pestaña PLAN ----------------
let map, mapLayer;
function ensureMap() {
  if (map) return map;
  if (!window.L) { $('#map').hidden = true; return null; }
  map = L.map('map', { zoomControl: true }).setView([PARIS.lat, PARIS.lng], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  mapLayer = L.layerGroup().addTo(map);
  return map;
}
const pin = (txt, cls = '') => L.divIcon({ className: '', html: `<div class="pin ${cls}">${txt}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

function currentPlan() {
  const opts = { visited: state.visited };
  if (state.replan) opts.now = state.replan;
  return planTrip(chosenPlaces(), state.trip, opts);
}

function renderPlan() {
  const plan = currentPlan();
  $('#btn-replan-reset').hidden = !state.replan;
  if (plan.error) {
    $('#plan-summary').textContent = plan.error;
    $('#day-tabs').innerHTML = $('#plan-day').innerHTML = $('#plan-unscheduled').innerHTML = '';
    return;
  }
  const farWarn = (plan.warnings || []).find((w) => w.type === 'hotelFar');
  const visits = plan.days.reduce((n, d) => n + d.items.filter((i) => i.type === 'visit').length, 0);
  const chosen = chosenPlaces().filter((p) => !state.visited[p.id]).length;
  $('#plan-summary').innerHTML = (farWarn ? `<div class="warn-box">⚠️ <strong>Tu alojamiento estaba guardado a ${farWarn.km} km de París</strong> (seguramente usaste "usar mi ubicación" desde otra ciudad). Para no arruinar el plan uso el centro de París. <a href="#" data-tab="trip">Corrígelo en ✈️ Viaje</a> buscando el hotel por nombre.</div>` : '') + (chosen
    ? `${visits} de ${chosen} lugares organizados en ${plan.days.length} día(s).${state.replan ? ` Replanificado desde tu ubicación a las ${fmt(state.replan.min)}.` : ''} Salida desde: ${esc((farWarn ? PARIS : (state.trip.hotel || PARIS)).name || 'hotel')}.<br>💶 <strong>Entradas y comidas del plan: ${costText(costSum(plan.days.flatMap((d) => d.items)))} por persona</strong> <span class="muted small">(${profile().residency === 'eea' ? 'residente UE' : 'no residente UE'}, ${({ adult: '26+', young: '18–25', minor: 'menor de 18' })[profile().age]}; cámbialo en ✈️ Viaje)</span>`
    : 'Aún no elegiste lugares. Ve a <strong>📌 Lugares</strong> y marca lo que quieres conocer.');

  if (!plan.days.some((d) => d.date === ui.day)) {
    const today = parisNow().date;
    ui.day = (plan.days.find((d) => d.date === today) || plan.days[0])?.date ?? null;
  }
  $('#day-tabs').innerHTML = plan.days.map((d) => {
    const n = d.items.filter((i) => i.type === 'visit').length;
    return `<button class="chip ${d.date === ui.day ? 'active' : ''}" data-action="day" data-date="${d.date}">${DAY_SHORT[d.dow]} ${d.date.slice(8)}/${d.date.slice(5, 7)} · ${n}</button>`;
  }).join('');

  const day = plan.days.find((d) => d.date === ui.day);
  const tripPosHotel = state.trip.hotel || PARIS;
  if (!day) { $('#plan-day').innerHTML = ''; } else {
    let n = 0;
    const rows = day.items.map((it) => {
      if (it.type === 'lunch') return `<li class="soft"><span class="time">${fmt(it.start)}</span><div>🍽️ Almuerzo cerca de aquí</div></li>`;
      if (it.type === 'free') return `<li class="soft"><span class="time">${fmt(it.start)}</span><div>☕ Tiempo libre hasta las ${fmt(it.end)}</div></li>`;
      n++;
      const p = it.place;
      const cat = CATEGORIES[p.category] || CATEGORIES.monumento;
      return `<li><span class="time">${fmt(it.start)}</span><div>
        <div class="travel">🚶 ${it.travel.min} min ${it.travel.how} desde ${esc(it.from.name || 'el punto anterior')}${it.fixed ? ` · <strong>sal a las ${fmt(it.arrive - it.travel.min)}</strong> para llegar ${fmt(it.arrive)}` : (it.idle ? ` · esperas ${it.idle} min a que abra` : '')}</div>
        <strong><span class="num">${n}</span>${cat.icon} ${esc(p.name)}</strong>${it.fixed ? ' <span class="tag ok">📌 Reserva</span>' : ''}
        ${addressLine(p)}
        ${(it.warnings || []).map((w) => `<div class="small" style="color:var(--max)">⚠️ ${esc(w)}</div>`).join('')}
        <div class="meta">${it.fixed ? '' : `<span>${badge(it.crowd)}</span>`}${it.wait ? `<span>⏳ ~${it.wait} min de fila</span>` : ''}<span>Hasta las ${fmt(it.end)}</span><span>${PRIORITY_LABEL[p.priority]}</span>${priceTag(it.cost)}</div>
        <div class="row gap wrap">
          <a class="btn small ghost" target="_blank" rel="noopener" href="${mapsLink(it.from, p, it.travel.how === 'a pie' ? 'walking' : 'transit')}">🧭 Cómo llegar</a>
          <button class="btn small ghost" data-action="visited" data-id="${esc(p.id)}">✅ Ya fui</button>
        </div></div></li>`;
    }).join('');
    $('#plan-day').innerHTML = `<div class="card">
      <h3>${DAY_NAMES[day.dow]} ${day.date}</h3>
      <p class="muted small">Disponible ${fmt(day.start)}–${fmt(day.end)} · 🌇 Atardecer ${fmt(day.sunset)} · 💶 Gasto del día: ${costText(costSum(day.items))}</p>
      ${day.note ? `<p class="muted">${day.note}</p>` : ''}
      ${rows ? `<ul class="timeline">${rows}</ul>` : '<p class="muted">Nada programado para este día.</p>'}
    </div>`;

    if (ensureMap()) {
      mapLayer.clearLayers();
      const startP = day.items.find((i) => i.type === 'visit')?.from || (farWarn ? PARIS : tripPosHotel);
      const pts = [[startP.lat, startP.lng]];
      L.marker([startP.lat, startP.lng], { icon: startP.name === 'Mi ubicación' ? pin('•', 'me') : pin('H', 'hotel') })
        .bindPopup(esc(startP.name || 'Inicio')).addTo(mapLayer);
      let k = 0;
      for (const it of day.items) {
        if (it.type !== 'visit') continue;
        k++;
        pts.push([it.place.lat, it.place.lng]);
        L.marker([it.place.lat, it.place.lng], { icon: pin(k) }).bindPopup(`${k}. ${esc(it.place.name)}<br>${fmt(it.start)}–${fmt(it.end)}`).addTo(mapLayer);
      }
      if (pts.length > 1) L.polyline(pts, { color: '#c8553d', weight: 3, dashArray: '6 6' }).addTo(mapLayer);
      setTimeout(() => {
        map.invalidateSize();
        if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] }); else map.setView(pts[0], 13);
      }, 50);
    }
  }

  $('#plan-unscheduled').innerHTML = passCard(plan) + (plan.unscheduled.length ? `<div class="card"><h3>⚠️ No entraron en el plan</h3>
    <ul>${plan.unscheduled.map((u) => `<li><strong>${esc(u.place.name)}</strong> — <span class="muted">${u.reason}</span></li>`).join('')}</ul></div>` : '');
  ui.lastPlan = plan;
}

// Suma de entradas y comidas (estimado) de una lista de visitas.
function costSum(items) {
  let total = 0; let unknown = 0; let estimated = false;
  for (const it of items) {
    if (it.type !== 'visit') continue;
    const c = it.cost;
    if (!c?.known) { unknown++; continue; }
    if (c.free) continue;
    total += c.amount || 0;
    if (c.range || c.approx) estimated = true;
  }
  return { total, unknown, estimated };
}
const costText = ({ total, unknown, estimated }) => `${estimated ? '≈ ' : ''}${euro(Math.round(total))}${unknown ? ` + ${unknown} sin precio` : ''}`;

function passCard(plan) {
  const visits = plan.days.flatMap((d) => d.items.filter((i) => i.type === 'visit').map((i) => ({ ...i, date: d.date })));
  const a = museumPassAdvice(visits, plan.days.map((d) => d.date));
  if (!a) return '';
  const range = `${a.from.slice(8)}/${a.from.slice(5, 7)}${a.to !== a.from ? ` al ${a.to.slice(8)}/${a.to.slice(5, 7)}` : ''}`;
  return `<div class="card ${a.saving > 0 ? 'hero' : ''}"><h3>🎫 ¿Te conviene el Paris Museum Pass?</h3>
    ${a.saving > 0
    ? `<p>✅ <strong>Sí: el pase de ${a.days} días (${euro(a.price)}) te ahorra ≈ ${euro(Math.round(a.saving))}</strong> si lo activas el ${range}. Ahí visitas: ${a.places.map(esc).join(', ')} (${euro(Math.round(a.sum))} por separado).</p>`
    : `<p>❌ No te conviene: con tu plan, lo más que usarías es el pase de ${a.days} días (${euro(a.price)}), y por separado esas entradas suman ${euro(Math.round(a.sum))}. Sale más barato pagar cada entrada.</p>`}
    <p class="muted small">Pases de ${MUSEUM_PASS.map((x) => `${x.days} días ${euro(x.price)}`).join(' · ')} (horas consecutivas desde la primera entrada; precios 2026, confírmalos en parismuseumpass.fr). No incluye Torre Eiffel, Catacumbas ni Ópera Garnier. En el Louvre y Versalles igual debes reservar tu franja horaria.</p></div>`;
}

function planAsText(plan) {
  const lines = ['🗼 Mi plan en París', ''];
  for (const d of plan.days) {
    lines.push(`${DAY_NAMES[d.dow]} ${d.date}`);
    for (const it of d.items) {
      if (it.type === 'visit') lines.push(`  ${fmt(it.start)}–${fmt(it.end)} ${it.place.name} (aforo ${crowdLevel(it.crowd).label.toLowerCase()}${it.cost?.known ? `, ${it.cost.free ? 'gratis' : (it.cost.range ? `${euro(it.cost.range[0])}–${euro(it.cost.range[1])}` : euro(it.cost.amount))}` : ''})`);
      else if (it.type === 'lunch') lines.push(`  ${fmt(it.start)} Almuerzo`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------- Pestaña AHORA ----------------
function renderNow() {
  const now = parisNow();
  const pos = startPos();
  const where = inParis(ui.pos)
    ? `📍 Ubicación detectada (±${Math.round(ui.pos.acc || 0)} m)`
    : ui.pos ? `Estás lejos de París: uso ${esc((state.trip.hotel || PARIS).name || 'tu hotel')} como punto de partida.`
      : `Sin ubicación: uso ${esc((state.trip.hotel || PARIS).name || 'el centro de París')}.`;
  $('#now-status').innerHTML = `${where}<br>${DAY_NAMES[dow(now.date)]} ${fmt(now.min)} en París · 🌇 atardecer ${fmt(sunset(now.date))}`;

  const pendingAll = chosenPlaces().filter((p) => !state.visited[p.id]);
  const candidates = pendingAll.filter((p) => !p.fixed);
  const nextFixed = pendingAll.filter((p) => p.fixed && p.fixed.date === now.date && p.fixed.start >= now.min - 15)
    .sort((a, b) => a.fixed.start - b.fixed.start)[0] || null;
  let banner = '';
  if (nextFixed) {
    const tr = travel(pos, nextFixed, state.trip.mode);
    const leave = nextFixed.fixed.start - tr.min - 5;
    banner = `<div class="card hero"><div class="label">📌 Tu próxima reserva</div>
      <h3>${esc(nextFixed.name)} a las ${fmt(nextFixed.fixed.start)}</h3>
      <p class="muted">${tr.min} min ${tr.how} · ${leave <= now.min ? '<strong>¡Sal ya!</strong>' : `sal a más tardar a las <strong>${fmt(leave)}</strong>`}</p>
      <a class="btn small" target="_blank" rel="noopener" href="${mapsLink(pos, nextFixed, tr.how === 'a pie' ? 'walking' : 'transit')}">🧭 Cómo llegar</a></div>`;
  }
  if (!candidates.length) {
    $('#now-list').innerHTML = banner + `<div class="card"><p>${Object.keys(state.selected).length ? '🎉 ¡Ya visitaste todo lo que elegiste!' : 'Primero elige qué quieres conocer en <strong>📌 Lugares</strong>.'}</p></div>`;
    return;
  }
  const ranked = rankNow(candidates, { pos, date: now.date, min: now.min, mode: state.trip.mode, reports: state.reports, nextFixed });
  const open = ranked.filter((r) => r.ok);
  const closed = ranked.filter((r) => !r.ok);
  const card = (r, hero) => {
    const p = r.place;
    const cat = CATEGORIES[p.category] || CATEGORIES.monumento;
    const rep = state.reports[p.id];
    const repFresh = rep && Date.now() - rep.at < 90 * 60000;
    return `<article class="card ${hero ? 'hero' : ''}">
      ${hero ? `<div class="label">Te recomiendo ir ahora a</div>${photoBox(p)}` : ''}
      <h3>${cat.icon} ${esc(p.name)} ${badge(r.ev.crowd)}</h3>
      ${addressLine(p)}
      <p class="muted">${r.reasons.join(' · ')}</p>
      ${r.later ? `<p class="tip">⏰ ${r.later}</p>` : ''}
      <p class="small">${priceTag(visitCost(p, now.date, r.ev.start, profile()))}</p>
      <p class="muted small">Llegarías ${fmt(r.ev.arrive)} · saldrías ${fmt(r.ev.end)} · cierra ${fmt(hoursOn(p, now.date)[1])}</p>
      ${hero ? crowdBars(p, now.date, now.min) : ''}
      <div class="row gap wrap">
        <a class="btn small" target="_blank" rel="noopener" href="${mapsLink(ui.pos && inParis(ui.pos) ? ui.pos : pos, p, r.travel.how === 'a pie' ? 'walking' : 'transit')}">🧭 Ir</a>
        <button class="btn small ghost" data-action="visited" data-id="${esc(p.id)}">✅ Ya fui</button>
      </div>
      <div class="report">¿Estás ahí? Reporta el aforo:
        ${[['0.2', '🟢 Vacío'], ['0.55', '🟡 Normal'], ['0.9', '🔴 Lleno']].map(([v, l]) => `<button class="chip ${repFresh && String(rep.level) === v ? 'active' : ''}" data-action="report" data-id="${esc(p.id)}" data-level="${v}">${l}</button>`).join('')}
      </div>
    </article>`;
  };
  $('#now-list').innerHTML = banner +
    (open.length ? card(open[0], true) + open.slice(1).map((r) => card(r, false)).join('')
      : '<div class="card"><p>Ningún lugar de tu lista está abierto ahora mismo. 😴</p></div>') +
    (closed.length ? `<div class="card"><h3>Ahora no</h3><ul>${closed.map((r) => `<li><strong>${esc(r.place.name)}</strong> — <span class="muted">${r.reason}${r.best ? ` · mejor hoy a las ${fmt(r.best.start)}` : ''}</span></li>`).join('')}</ul></div>` : '');
  hydratePhotos($('#now-list'));
}

// ---------------- Pestaña VIAJE ----------------
function renderTrip() {
  const f = $('#trip-form');
  for (const [k, v] of Object.entries(state.trip)) {
    const el = f.elements[k];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
  }
  const h = state.trip.hotel;
  const far = h && haversineKm(h, PARIS) > MAX_HOTEL_KM;
  $('#hotel-status').innerHTML = !h ? 'Sin alojamiento: usaré el centro de París como punto de partida.'
    : far ? `<span style="color:var(--max)">⚠️ Tu alojamiento guardado está a ${Math.round(haversineKm(h, PARIS))} km de París (se guardó tu ubicación de otra ciudad). Lo ignoro y uso el centro de París. Búscalo abajo por nombre o dirección.</span>`
      : `🏨 ${esc(h.name)}`;
}

// ---------------- Navegación ----------------
function render() {
  document.querySelectorAll('nav.bottom button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== `tab-${ui.tab}`; });
  ({ now: renderNow, plan: renderPlan, places: renderPlaces, trip: renderTrip })[ui.tab]();
}
function update() { save(); render(); }

function tick() {
  const n = parisNow();
  $('#clock').textContent = `París ${fmt(n.min)}`;
}

// ---------------- Eventos ----------------
document.addEventListener('click', async (e) => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { ui.tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'locate': {
      $('#now-status').textContent = 'Buscando tu ubicación…';
      await locate();
      render();
      break;
    }
    case 'cat': ui.cat = el.dataset.cat; renderPlaces(); break;
    case 'only-selected': ui.onlySelected = !ui.onlySelected; renderPlaces(); break;
    case 'select-top':
      for (const p of PLACES) if (p.popularity >= 0.85 && !state.selected[p.id]) state.selected[p.id] = { priority: 3 };
      update(); toast('Marcados los más famosos como imprescindibles');
      break;
    case 'remove-custom':
      state.custom = state.custom.filter((p) => p.id !== id);
      delete state.selected[id];
      update();
      break;
    case 'day': ui.day = el.dataset.date; renderPlan(); break;
    case 'visited':
      state.visited[id] = true;
      update(); toast('¡Marcado como visitado! El plan se reorganizó.');
      break;
    case 'report':
      state.reports[id] = { level: Number(el.dataset.level), at: Date.now() };
      update(); toast('Gracias, uso tu reporte durante 90 min');
      break;
    case 'replan-here': {
      toast('Obteniendo tu ubicación…');
      const pos = await locate();
      const now = parisNow();
      const usable = inParis(pos) ? pos : null;
      state.replan = { date: now.date, min: now.min, pos: usable };
      if (!usable) toast('No estás en París (o sin ubicación): replanifico desde ahora y desde tu hotel');
      ui.day = now.date;
      update();
      break;
    }
    case 'replan-reset': state.replan = null; update(); break;
    case 'copy-plan': {
      const text = planAsText(ui.lastPlan || currentPlan());
      try { await navigator.clipboard.writeText(text); toast('Plan copiado. ¡Pégalo en WhatsApp o Notas!'); } catch { toast('No se pudo copiar'); }
      break;
    }
    case 'hotel-search': {
      const q = $('#hotel-query').value.trim();
      if (!q) return;
      const out = $('#hotel-results');
      out.innerHTML = '<p class="muted">Buscando…</p>';
      try { renderResults(out, await geocode(`${q}, Paris`), 'hotel'); } catch { out.innerHTML = '<p class="muted">No se pudo buscar (¿sin conexión?)</p>'; }
      break;
    }
    case 'add-found': {
      const f = ui.found?.[Number(el.dataset.i)];
      if (!f) return;
      const id = `custom-${Date.now()}`;
      const { near, ...clean } = f;
      state.custom.push({ ...clean, id, custom: true });
      state.selected[id] = { priority: 2 };
      el.outerHTML = '<span class="tag ok">✓ Agregado a tu lista</span>';
      save(); renderPlacesList();
      toast(`${f.name} agregado. Ya entra en tu plan.`);
      break;
    }
    case 'select-found': {
      if (!state.selected[id]) state.selected[id] = { priority: 2 };
      el.outerHTML = '<span class="tag ok">✓ Elegido</span>';
      save(); renderPlacesList();
      break;
    }
    case 'pick-hotel': {
      const r = $('#hotel-results')._results[Number(el.dataset.i)];
      state.trip.hotel = { lat: r.lat, lng: r.lng, name: r.name.split(',').slice(0, 2).join(',') };
      $('#hotel-results').innerHTML = '';
      update(); toast('Alojamiento guardado');
      break;
    }
    case 'hotel-here': {
      const pos = await locate();
      if (!pos) break;
      if (!inParis(pos)) {
        toast(`Estás a ${Math.round(haversineKm(pos, PARIS))} km de París: busca tu hotel por nombre o dirección`);
        $('#hotel-query').focus();
        break;
      }
      state.trip.hotel = { lat: pos.lat, lng: pos.lng, name: 'Mi alojamiento' }; update(); toast('Alojamiento guardado');
      break;
    }
    case 'c-here': {
      const pos = await locate();
      if (pos) { ui.customPos = pos; $('#c-coords').textContent = `📍 ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`; }
      break;
    }
    case 'c-add': {
      const name = $('#c-name').value.trim();
      if (!name) return toast('Ponle un nombre');
      if (!ui.customPos) return toast('Busca la dirección o usa tu ubicación');
      const closed = [...document.querySelectorAll('#c-closed input:checked')].map((i) => Number(i.value));
      const open = $('#c-open').value || '09:00';
      let close = $('#c-close').value || '20:00';
      if (toMin(close) <= toMin(open)) close = '24:00';
      const id = `custom-${Date.now()}`;
      state.custom.push({
        id, custom: true, name, category: $('#c-cat').value, lat: ui.customPos.lat, lng: ui.customPos.lng,
        duration: Math.max(10, Number($('#c-dur').value) || 60), popularity: 0.5, maxWait: 10, slot: 'any',
        hours: hours(open, close, { closed }), hoursSource: 'manual',
      });
      state.selected[id] = { priority: 2 };
      ui.customPos = null;
      $('#c-name').value = '';
      $('#c-coords').textContent = 'Sin ubicación';
      $('#custom-form').open = false;
      update(); toast(`${name} agregado a tu lista`);
      break;
    }
    case 'share-trip': {
      if (!Object.keys(state.selected).length) return toast('Primero elige lugares para tu viaje');
      const url = shareUrl(await encodeTrip(state));
      const text = 'Este es nuestro itinerario para París 🗼. Ábrelo y se carga en la app:';
      if (navigator.share) {
        try { await navigator.share({ title: 'Viaje a París', text, url }); } catch { /* cancelado */ }
      } else {
        try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Enlace copiado: pégalo en WhatsApp'); } catch { prompt('Copia este enlace:', url); }
      }
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'mi-viaje-paris.json' });
      a.click();
      URL.revokeObjectURL(a.href);
      break;
    }
    case 'reset-visited':
      if (confirm('¿Desmarcar todos los lugares visitados?')) { state.visited = {}; update(); }
      break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  const { action, id } = el.dataset || {};
  if (action === 'toggle') {
    if (el.checked) state.selected[id] = { priority: 2 }; else delete state.selected[id];
    update();
  } else if (action === 'priority') {
    state.selected[id].priority = Number(el.value); update();
  } else if (action === 'fixed-date') {
    if (el.value) state.selected[id].fixedDate = el.value;
    else { delete state.selected[id].fixedDate; delete state.selected[id].fixedTime; }
    update();
    if (el.value && !state.selected[id].fixedTime) document.querySelector(`[data-action=fixed-time][data-id="${CSS.escape(id)}"]`)?.focus();
  } else if (action === 'fixed-time') {
    if (el.value) state.selected[id].fixedTime = el.value; else delete state.selected[id].fixedTime;
    update();
    if (el.value) toast('📌 Hora fijada: el plan se reordenó');
  } else if (action === 'slot') {
    state.selected[id].slot = el.value; update();
  } else if (el.form?.id === 'trip-form' && el.name) {
    state.trip[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    state.replan = null;
    save();
  } else if (el.id === 'import-file' && el.files[0]) {
    el.files[0].text().then((txt) => {
      try { const s = JSON.parse(txt); state = { ...defaultState(), ...s, trip: { ...defaultState().trip, ...s.trip } }; update(); toast('Viaje importado'); } catch { toast('Archivo no válido'); }
    });
  }
});

$('[data-form=c-search]').addEventListener('submit', (e) => { e.preventDefault(); searchAndShow(); });
$('#place-search').addEventListener('input', (e) => { ui.query = e.target.value; renderPlacesList(); });

// Formulario de lugar propio: tipos y días.
$('#c-cat').innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');
$('#c-closed').innerHTML = DAY_SHORT.map((d, i) => `<label><input type="checkbox" value="${i}">${d}</label>`).join('');

// ---------------- Abrir un viaje compartido (#viaje=...) ----------------
async function loadSharedFromLink() {
  const code = codeFromHash();
  if (!code) return;
  history.replaceState(null, '', location.pathname + location.search); // limpia el enlace
  try {
    const data = await decodeTrip(code);
    const hasOwn = Object.keys(state.selected).length > 0;
    const same = JSON.stringify({ t: state.trip, s: state.selected, c: state.custom }) === JSON.stringify({ t: data.trip, s: data.selected, c: data.custom });
    if (same) { toast('Ya tienes este viaje cargado'); return; }
    if (hasOwn && !confirm('Te compartieron un viaje a París. ¿Cargarlo? Reemplaza los lugares y fechas que tienes ahora en este teléfono.')) return;
    const d = defaultState();
    state = { ...d, trip: { ...d.trip, ...data.trip }, selected: data.selected || {}, custom: data.custom || [], visited: data.visited || {} };
    ui.tab = 'plan';
    ui.day = null;
    update();
    toast('✅ Viaje compartido cargado');
  } catch {
    toast('El enlace del viaje no es válido o está incompleto');
  }
}

// ---------------- Inicio ----------------
tick();
setInterval(() => { tick(); if (ui.tab === 'now') renderNow(); }, 60000);
render();
loadSharedFromLink();
window.addEventListener('hashchange', loadSharedFromLink);
locate({ quiet: true }).then(() => { if (ui.tab === 'now') renderNow(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
