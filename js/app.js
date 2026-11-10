import { PLACES, CATEGORIES, SLOTS, hours } from './data.js';
import {
  PARIS, PRIORITY_LABEL, planTrip, rankNow, parisNow, addDays, fmt, toMin, crowdAt, crowdLevel,
  hoursOn, haversineKm, mapsLink, sunset, dow, splitDateTime,
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
    .map((p) => ({ ...p, priority: state.selected[p.id].priority ?? 2, slot: state.selected[p.id].slot ?? p.slot }));
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
  return state.trip.hotel || PARIS;
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
  const date = referenceDate();
  const now = parisNow();
  $('#cat-chips').innerHTML = [['all', 'Todos'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, `${v.icon} ${v.label}`])]
    .map(([k, l]) => `<button class="chip ${ui.cat === k ? 'active' : ''}" data-action="cat" data-cat="${k}">${l}</button>`).join('');
  $('#btn-only-selected').classList.toggle('active', ui.onlySelected);
  $('#btn-only-selected').textContent = ui.onlySelected ? 'Ver todos' : `Ver solo elegidos (${Object.keys(state.selected).length})`;

  const q = ui.query.trim().toLowerCase();
  const list = allPlaces().filter((p) =>
    (ui.cat === 'all' || p.category === ui.cat) &&
    (!q || p.name.toLowerCase().includes(q)) &&
    (!ui.onlySelected || state.selected[p.id]));

  $('#places-list').innerHTML = `<p class="muted small">Aforo del ${DAY_NAMES[dow(date)].toLowerCase()} ${date}</p>` + list.map((p) => {
    const sel = state.selected[p.id];
    const cat = CATEGORIES[p.category] || CATEGORIES.monumento;
    return `<article class="card place ${sel ? 'selected' : ''} ${state.visited[p.id] ? 'visited' : ''}">
      <input type="checkbox" class="toggle" data-action="toggle" data-id="${esc(p.id)}" ${sel ? 'checked' : ''} aria-label="Quiero ir">
      <div>
        <h3>${cat.icon} ${esc(p.name)} ${state.visited[p.id] ? '✅' : ''}</h3>
        <div class="meta">
          <span>🕘 ${hoursText(p, date)}</span><span>⏱️ ${p.duration} min</span>
          <span>${closedDaysText(p)}</span>${p.booking ? '<span>🎟️ Reserva recomendada</span>' : ''}
          ${p.capacity ? `<span>👥 ${esc(p.capacity)}</span>` : ''}
        </div>
        ${crowdBars(p, date, date === now.date ? now.min : null)}
        ${p.tip ? `<p class="tip">💡 ${esc(p.tip)}</p>` : ''}
        ${sel ? `<div class="controls">
          <select data-action="priority" data-id="${esc(p.id)}">${[3, 2, 1].map((v) => `<option value="${v}" ${sel.priority === v ? 'selected' : ''}>${PRIORITY_LABEL[v]}</option>`).join('')}</select>
          <select data-action="slot" data-id="${esc(p.id)}">${Object.entries(SLOTS).map(([k, l]) => `<option value="${k}" ${(sel.slot ?? p.slot) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${p.custom ? `<button class="btn small danger" data-action="remove-custom" data-id="${esc(p.id)}">Eliminar</button>` : ''}
        </div>` : ''}
      </div>
    </article>`;
  }).join('');
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
  const visits = plan.days.reduce((n, d) => n + d.items.filter((i) => i.type === 'visit').length, 0);
  const chosen = chosenPlaces().filter((p) => !state.visited[p.id]).length;
  $('#plan-summary').innerHTML = chosen
    ? `${visits} de ${chosen} lugares organizados en ${plan.days.length} día(s).${state.replan ? ` Replanificado desde tu ubicación a las ${fmt(state.replan.min)}.` : ''} Salida desde: ${esc((state.trip.hotel || PARIS).name || 'hotel')}.`
    : 'Aún no elegiste lugares. Ve a <strong>📌 Lugares</strong> y marca lo que quieres conocer.';

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
        <div class="travel">🚶 ${it.travel.min} min ${it.travel.how} desde ${esc(it.from.name || 'el punto anterior')}${it.idle ? ` · esperas ${it.idle} min a que abra` : ''}</div>
        <strong><span class="num">${n}</span>${cat.icon} ${esc(p.name)}</strong>
        <div class="meta"><span>${badge(it.crowd)}</span>${it.wait ? `<span>⏳ ~${it.wait} min de fila</span>` : ''}<span>Hasta las ${fmt(it.end)}</span><span>${PRIORITY_LABEL[p.priority]}</span></div>
        <div class="row gap wrap">
          <a class="btn small ghost" target="_blank" rel="noopener" href="${mapsLink(it.from, p, it.travel.how === 'a pie' ? 'walking' : 'transit')}">🧭 Cómo llegar</a>
          <button class="btn small ghost" data-action="visited" data-id="${esc(p.id)}">✅ Ya fui</button>
        </div></div></li>`;
    }).join('');
    $('#plan-day').innerHTML = `<div class="card">
      <h3>${DAY_NAMES[day.dow]} ${day.date}</h3>
      <p class="muted small">Disponible ${fmt(day.start)}–${fmt(day.end)} · 🌇 Atardecer ${fmt(day.sunset)}</p>
      ${day.note ? `<p class="muted">${day.note}</p>` : ''}
      ${rows ? `<ul class="timeline">${rows}</ul>` : '<p class="muted">Nada programado para este día.</p>'}
    </div>`;

    if (ensureMap()) {
      mapLayer.clearLayers();
      const startP = day.items.find((i) => i.type === 'visit')?.from || tripPosHotel;
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

  $('#plan-unscheduled').innerHTML = plan.unscheduled.length ? `<div class="card"><h3>⚠️ No entraron en el plan</h3>
    <ul>${plan.unscheduled.map((u) => `<li><strong>${esc(u.place.name)}</strong> — <span class="muted">${u.reason}</span></li>`).join('')}</ul></div>` : '';
  ui.lastPlan = plan;
}

function planAsText(plan) {
  const lines = ['🗼 Mi plan en París', ''];
  for (const d of plan.days) {
    lines.push(`${DAY_NAMES[d.dow]} ${d.date}`);
    for (const it of d.items) {
      if (it.type === 'visit') lines.push(`  ${fmt(it.start)}–${fmt(it.end)} ${it.place.name} (aforo ${crowdLevel(it.crowd).label.toLowerCase()})`);
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

  const candidates = chosenPlaces().filter((p) => !state.visited[p.id]);
  if (!candidates.length) {
    $('#now-list').innerHTML = `<div class="card"><p>${Object.keys(state.selected).length ? '🎉 ¡Ya visitaste todo lo que elegiste!' : 'Primero elige qué quieres conocer en <strong>📌 Lugares</strong>.'}</p></div>`;
    return;
  }
  const ranked = rankNow(candidates, { pos, date: now.date, min: now.min, mode: state.trip.mode, reports: state.reports });
  const open = ranked.filter((r) => r.ok);
  const closed = ranked.filter((r) => !r.ok);
  const card = (r, hero) => {
    const p = r.place;
    const cat = CATEGORIES[p.category] || CATEGORIES.monumento;
    const rep = state.reports[p.id];
    const repFresh = rep && Date.now() - rep.at < 90 * 60000;
    return `<article class="card ${hero ? 'hero' : ''}">
      ${hero ? '<div class="label">Te recomiendo ir ahora a</div>' : ''}
      <h3>${cat.icon} ${esc(p.name)} ${badge(r.ev.crowd)}</h3>
      <p class="muted">${r.reasons.join(' · ')}</p>
      ${r.later ? `<p class="tip">⏰ ${r.later}</p>` : ''}
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
  $('#now-list').innerHTML =
    (open.length ? card(open[0], true) + open.slice(1).map((r) => card(r, false)).join('')
      : '<div class="card"><p>Ningún lugar de tu lista está abierto ahora mismo. 😴</p></div>') +
    (closed.length ? `<div class="card"><h3>Ahora no</h3><ul>${closed.map((r) => `<li><strong>${esc(r.place.name)}</strong> — <span class="muted">${r.reason}${r.best ? ` · mejor hoy a las ${fmt(r.best.start)}` : ''}</span></li>`).join('')}</ul></div>` : '');
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
  $('#hotel-status').textContent = h ? `🏨 ${h.name}` : 'Sin alojamiento: usaré el centro de París como punto de partida.';
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
    case 'hotel-search':
    case 'c-search': {
      const isHotel = action === 'hotel-search';
      const q = $(isHotel ? '#hotel-query' : '#c-query').value.trim();
      if (!q) return;
      const out = $(isHotel ? '#hotel-results' : '#c-results');
      out.innerHTML = '<p class="muted">Buscando…</p>';
      try { renderResults(out, await geocode(`${q}, Paris`), isHotel ? 'hotel' : 'custom'); } catch { out.innerHTML = '<p class="muted">No se pudo buscar (¿sin conexión?)</p>'; }
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
      if (pos) { state.trip.hotel = { lat: pos.lat, lng: pos.lng, name: 'Mi alojamiento' }; update(); toast('Alojamiento guardado'); }
      break;
    }
    case 'pick-custom': {
      const r = $('#c-results')._results[Number(el.dataset.i)];
      ui.customPos = r;
      if (!$('#c-name').value) $('#c-name').value = r.name.split(',')[0];
      $('#c-coords').textContent = `📍 ${r.name.split(',').slice(0, 2).join(',')}`;
      $('#c-results').innerHTML = '';
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
        hours: hours(open, close, { closed }),
      });
      state.selected[id] = { priority: 2 };
      ui.customPos = null;
      $('#c-name').value = $('#c-query').value = '';
      $('#c-coords').textContent = 'Sin ubicación';
      $('#custom-form').open = false;
      update(); toast(`${name} agregado a tu lista`);
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

$('#place-search').addEventListener('input', (e) => { ui.query = e.target.value; renderPlaces(); });

// Formulario de lugar propio: tipos y días.
$('#c-cat').innerHTML = Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');
$('#c-closed').innerHTML = DAY_SHORT.map((d, i) => `<label><input type="checkbox" value="${i}">${d}</label>`).join('');

// ---------------- Inicio ----------------
tick();
setInterval(() => { tick(); if (ui.tab === 'now') renderNow(); }, 60000);
render();
locate({ quiet: true }).then(() => { if (ui.tab === 'now') renderNow(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
