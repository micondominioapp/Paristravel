// Motor de planificación: tiempos, distancias, aforo estimado y armado del itinerario.
import { CATEGORY_CURVES, DAY_FACTOR, SEASON_FACTOR } from './data.js';
import { freeOnDate, visitCost } from './prices.js';

export const PARIS = { lat: 48.8566, lng: 2.3522, name: 'Centro de París' };
export const MAX_HOTEL_KM = 60; // un alojamiento más lejos no puede ser el de este viaje (Versalles está a 17 km)
export const PRIORITY_WEIGHT = { 3: 300, 2: 150, 1: 60 };
export const PRIORITY_LABEL = { 3: '⭐ Imprescindible', 2: 'Me gustaría', 1: 'Si da tiempo' };

const pad = (n) => String(n).padStart(2, '0');

export function toMin(s) {
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fmt(min) {
  const m = Math.round(min);
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

// ---------- Fechas (todas en "hora de París" como texto YYYY-MM-DD + minutos) ----------
function ymd(dateStr) {
  return dateStr.split('-').map(Number);
}

export function dow(dateStr) {
  const [y, m, d] = ymd(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr, n) {
  const [y, m, d] = ymd(dateStr);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function splitDateTime(dt) {
  const [date, time = '00:00'] = String(dt).split('T');
  return { date, min: toMin(time) };
}

const parisFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function parisNow(date = new Date()) {
  const p = Object.fromEntries(parisFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

// Diferencia de París con UTC en minutos (60 en invierno, 120 en verano).
const offsetCache = new Map();
export function parisOffset(dateStr) {
  if (offsetCache.has(dateStr)) return offsetCache.get(dateStr);
  const [y, m, d] = ymd(dateStr);
  const v = parisNow(new Date(Date.UTC(y, m - 1, d, 12))).min - 12 * 60;
  offsetCache.set(dateStr, v);
  return v;
}

// Hora de la puesta de sol en París (minutos, hora local). Aproximación NOAA.
const sunsetCache = new Map();
export function sunset(dateStr, lat = PARIS.lat, lng = PARIS.lng) {
  const key = `${dateStr}|${lat}|${lng}`;
  if (sunsetCache.has(key)) return sunsetCache.get(key);
  const v = sunsetCalc(dateStr, lat, lng);
  sunsetCache.set(key, v);
  return v;
}
function sunsetCalc(dateStr, lat, lng) {
  const [y, m, d] = ymd(dateStr);
  const n = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5;
  const g = (2 * Math.PI / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const latR = (lat * Math.PI) / 180;
  const ha = Math.acos(Math.cos((90.833 * Math.PI) / 180) / (Math.cos(latR) * Math.cos(decl)) - Math.tan(latR) * Math.tan(decl));
  return 720 - 4 * (lng - (ha * 180) / Math.PI) - eq + parisOffset(dateStr);
}

// ---------- Distancias ----------
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// mode: 'walk' | 'transit' | 'mixto'
export function travel(a, b, mode = 'mixto') {
  const km = haversineKm(a, b) * 1.3; // las calles no son línea recta
  const walk = Math.round((km / 4.5) * 60);
  const transit = Math.round(8 + (km / 22) * 60); // metro/RER incluyendo esperas
  if (mode === 'walk') return { min: walk, how: 'a pie', km };
  if (mode === 'transit') return { min: walk <= 8 ? walk : transit, how: walk <= 8 ? 'a pie' : 'metro', km };
  return walk <= 20 || walk <= transit ? { min: walk, how: 'a pie', km } : { min: transit, how: 'metro', km };
}

// ---------- Horarios y aforo ----------
export function hoursOn(place, dateStr) {
  return place.hours?.[dow(dateStr)] ?? null;
}

function curveValue(category, minute) {
  const curve = CATEGORY_CURVES[category] || CATEGORY_CURVES.monumento;
  const h = Math.floor(minute / 60);
  const f = (minute % 60) / 60;
  const v = (x) => curve[x] ?? 0.1;
  return v(h) * (1 - f) + v(h + 1) * f;
}

// Aforo estimado (0-1) de un lugar en una fecha y hora.
export function crowdAt(place, dateStr, minute) {
  const d = dow(dateStr);
  const month = ymd(dateStr)[1] - 1;
  let c = curveValue(place.category, minute);
  if (place.category === 'mirador' || place.category === 'paseo') {
    const diff = Math.abs(minute - sunset(dateStr));
    if (diff < 60) c += 0.15 * (1 - diff / 60); // el atardecer atrae gente
  }
  c *= (place.popularity ?? 0.5) * DAY_FACTOR[d] * SEASON_FACTOR[month] * (place.dayBoost?.[d] ?? 1);
  const free = place.price ? freeOnDate(place, dateStr) : null;
  if (free && (free.from == null || minute >= free.from)) c *= 1.3; // los días gratis se llenan
  return Math.max(0.03, Math.min(1, c));
}

export function waitMinutes(place, crowd) {
  return Math.round((place.maxWait ?? 0) * Math.max(0, crowd - 0.3) / 0.7);
}

export function crowdLevel(c) {
  if (c < 0.35) return { label: 'Bajo', cls: 'low' };
  if (c < 0.6) return { label: 'Moderado', cls: 'mid' };
  if (c < 0.8) return { label: 'Alto', cls: 'high' };
  return { label: 'Muy alto', cls: 'max' };
}

export function inSlot(slot, dateStr, minute) {
  switch (slot) {
    case 'morning': return minute < 12 * 60;
    case 'afternoon': return minute >= 12 * 60 && minute < 18 * 60;
    case 'evening': return minute >= Math.min(18 * 60, sunset(dateStr));
    case 'sunset': { const s = sunset(dateStr); return minute >= s - 90 && minute <= s + 30; }
    default: return true;
  }
}

// Busca la hora con menos aforo para entrar hoy a partir de `from`.
export function bestTime(place, dateStr, from, until = 24 * 60) {
  const hrs = hoursOn(place, dateStr);
  if (!hrs) return null;
  let best = null;
  const last = Math.min(hrs[1], until) - place.duration;
  const first = Math.max(from, hrs[0]);
  // Primera opción: ya mismo; luego en horas redondas (:00 / :30).
  for (let s = first; s <= last; s = s === first ? Math.ceil((first + 1) / 30) * 30 : s + 30) {
    const c = crowdAt(place, dateStr, s);
    if (!best || c < best.crowd - 0.001) best = { start: s, crowd: c };
  }
  return best;
}

// ---------- Evaluación de una visita ----------
export function evaluate(place, { pos, date, t, mode, dayEnd = 24 * 60, crowdOverride }) {
  const hrs = hoursOn(place, date);
  if (!hrs) return { ok: false, reason: 'Cerrado hoy' };
  const tr = travel(pos, place, mode);
  const arrive = t + tr.min;
  const [open, close] = hrs;
  if (arrive >= close) return { ok: false, reason: `Cerró a las ${fmt(close)}` };
  const start = Math.max(arrive, open);
  const idle = start - arrive;
  if (idle > 75) return { ok: false, reason: `Abre a las ${fmt(open)}`, opensAt: open };
  const crowd = crowdOverride ?? crowdAt(place, date, start);
  const wait = waitMinutes(place, crowd);
  const end = start + wait + place.duration;
  if (end > close) return { ok: false, reason: `No da tiempo antes del cierre (${fmt(close)})` };
  if (end > dayEnd) return { ok: false, reason: 'No da tiempo hoy' };
  return { ok: true, travel: tr, arrive, start, idle, crowd, wait, end };
}

export function score(place, ev, { date, lunchPending = false, urgency = 0 }) {
  let s = (PRIORITY_WEIGHT[place.priority] ?? 150) - ev.travel.min * 1.2 - ev.idle * 0.6 - ev.wait * 0.8 - ev.crowd * 40;
  const slot = place.slot;
  if (slot && slot !== 'any') {
    if (inSlot(slot, date, ev.start)) s += 40;
    else s -= slot === 'sunset' || slot === 'evening' ? 120 : 20;
  }
  if (lunchPending && ev.start < 13 * 60 && ev.end > 15 * 60) s -= 30;
  return s + urgency;
}

// ---------- Itinerario completo ----------
// places: lugares elegidos (con priority/slot/duration ya aplicados)
// trip: { arrival:'YYYY-MM-DDTHH:MM', departure, hotel:{lat,lng,name}, dayStart, dayEnd, mode, lunch, arrivalBuffer, departureBuffer }
// opts: { visited:{id:true}, now:{date,min,pos} }  -> replanifica desde ahora y desde tu ubicación
// ¿Habrá entrada gratis más tarde hoy o en otro día del viaje (y estará abierto)?
function freeLaterToday(p, date, start) {
  if (!p.price?.freeRules) return false;
  const today = freeOnDate(p, date);
  const hrs = hoursOn(p, date);
  return !!(today && today.from != null && start < today.from && hrs && today.from + waitMinutes(p, crowdAt(p, date, today.from)) + p.duration <= hrs[1]);
}
function freeLater(p, date, start, laterDates) {
  if (!p.price?.freeRules) return false;
  return freeLaterToday(p, date, start) || laterDates.some((d) => hoursOn(p, d) && freeOnDate(p, d));
}

const isLunchSlot = (m) => m >= 11 * 60 + 30 && m <= 14 * 60 + 30;
const SLOT_MISS = (p, date, start) => {
  if (!p.slot || p.slot === 'any' || inSlot(p.slot, date, start)) return 0;
  return p.slot === 'sunset' || p.slot === 'evening' ? 120 : 20;
};

// Minutos que ocupa una visita en el día (para repartir la carga entre días).
const loadOf = (p) => p.duration + waitMinutes(p, 0.75) + 15;

// ---------- Etapa 1: zonas a pie ----------
// Agrupa lugares de modo que dentro de una zona todos estén a ≤ maxKm entre sí (enlace completo).
export function clusterZones(places, maxKm = 1.5) {
  let zones = places.map((p) => [p]);
  const dist = (z1, z2) => Math.max(...z1.flatMap((a) => z2.map((b) => haversineKm(a, b))));
  for (;;) {
    let best = null;
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const d = dist(zones[i], zones[j]);
        if (d <= maxKm && (!best || d < best.d)) best = { i, j, d };
      }
    }
    if (!best) break;
    zones[best.i] = [...zones[best.i], ...zones[best.j]];
    zones = zones.filter((_, k) => k !== best.j);
  }
  return zones;
}

const centerOf = (pts) => ({ lat: pts.reduce((a, q) => a + q.lat, 0) / pts.length, lng: pts.reduce((a, q) => a + q.lng, 0) / pts.length });

// ---------- Etapa 2: repartir zonas entre los días ----------
// Devuelve { idLugar: fecha }. Une zonas vecinas en el mismo día, respeta el tiempo disponible,
// que el lugar quepa en su horario ese día, las reservas y los días gratis que valen la pena.
export function assignDays(places, frames, { lunch = true, profile, noDefer, trace, zoneKm = 1.5, emptyDayKm = 2.5 } = {}) {
  const usable = frames.filter((f) => f.end - f.start >= 45 || f.fixedToday.length);
  if (usable.length < 2 || !places.length) return {};
  const cap = Object.fromEntries(usable.map((f) => {
    const fixedLoad = f.fixedToday.reduce((acc, p) => acc + p.duration + 20, 0);
    return [f.date, Math.max(0, (f.end - f.start - (lunch ? 60 : 0) - fixedLoad) * 0.9)];
  }));
  const members = Object.fromEntries(usable.map((f) => [f.date, [...f.fixedToday]]));
  const fits = (p, f) => {
    const hrs = hoursOn(p, f.date);
    if (!hrs) return false;
    const st = Math.max(f.start + travel(f.pos, p).min, hrs[0]);
    return st + p.duration <= Math.min(hrs[1], f.end);
  };
  // Día gratis que vale la pena (ahorro ≥ €10) y en el que la visita cabe en el horario gratis (fila incluida).
  const freeDay = (p) => {
    if (!p.price?.freeRules || noDefer?.has(p.id)) return null;
    const f = usable.find((fr) => {
      const fr0 = freeOnDate(p, fr.date);
      const hrs = hoursOn(p, fr.date);
      if (!fr0 || !hrs) return false;
      const st = Math.max(fr.start + travel(fr.pos, p).min, hrs[0], fr0.from ?? 0);
      return st + waitMinutes(p, crowdAt(p, fr.date, st)) + p.duration <= Math.min(hrs[1], fr.end);
    });
    return f && (visitCost(p, f.date, 24 * 60, profile).saved ?? 0) >= 10 ? f.date : null;
  };
  const load = (pts) => pts.reduce((acc, p) => acc + loadOf(p), 0) + Math.max(0, pts.length - 1) * 12;
  const assign = {};

  // Costo de poner un grupo en un día: distancia a lo que ya hay ese día (un día vacío "cuesta" 2,5 km).
  const costFor = (pts, f) => {
    const m = members[f.date];
    let c = m.length ? haversineKm(centerOf(m), centerOf(pts)) : emptyDayKm;
    if (pts.some((p) => freeDay(p) === f.date)) c -= 3; // aprovecha la entrada gratis
    return c;
  };
  // Tiempo que ocupa el grupo en ese día: visitas + traslado desde lo que ya hay (o desde el hotel, ida y vuelta).
  const needOn = (pts, f) => {
    const m = members[f.date];
    const from = m.length ? centerOf(m) : f.pos;
    const hop = travel(from, centerOf(pts)).min;
    return load(pts) + (m.length ? hop : hop * 2);
  };
  const place = (pts) => {
    const opts = usable.filter((f) => pts.every((p) => fits(p, f)) && cap[f.date] >= needOn(pts, f));
    trace?.(`zona [${pts.map((p) => p.id)}] carga ${load(pts)} → ${usable.map((f) => `${f.date.slice(5)}: hueco ${Math.round(cap[f.date])}, necesita ${needOn(pts, f)}${pts.every((p) => fits(p, f)) ? '' : ' (no cabe en horario)'}`).join(' | ')}`);
    if (!opts.length) return false;
    const f = opts.reduce((m, x) => (costFor(pts, x) < costFor(pts, m) ? x : m), opts[0]);
    cap[f.date] -= needOn(pts, f);
    pts.forEach((p) => { assign[p.id] = f.date; });
    members[f.date].push(...pts);
    return true;
  };

  // Primero lo más difícil de ubicar: zonas grandes y lugares con pocos días posibles.
  const zones = clusterZones(places, zoneKm).sort((z1, z2) => load(z2) - load(z1));
  // Parte una zona en dos sub-zonas compactas (los dos lugares más alejados como semillas).
  const split = (z) => {
    let a = z[0]; let b = z[1]; let dmax = -1;
    for (const x of z) for (const y of z) { const d = haversineKm(x, y); if (d > dmax) { dmax = d; a = x; b = y; } }
    const g1 = []; const g2 = [];
    for (const x of z) (haversineKm(x, a) <= haversineKm(x, b) ? g1 : g2).push(x);
    return [g1, g2].filter((g) => g.length);
  };
  const singles = [];
  const queue = [...zones];
  while (queue.length) {
    const z = queue.shift();
    if (place(z)) continue;
    if (z.length > 1) { queue.unshift(...split(z)); continue; }
    singles.push(z[0]);
  }
  {
    const z = singles;
    // Lo que no entra en ningún día se deja al día con más hueco (el planificador decidirá).
    for (const p of [...z].sort((x, y) => (y.priority ?? 2) - (x.priority ?? 2) || loadOf(y) - loadOf(x))) {
      if (!place([p])) {
        const opts = usable.filter((f) => fits(p, f));
        if (opts.length) { // no hay hueco: al día con más tiempo libre (el planificador decidirá)
          const f = opts.reduce((m, x) => (cap[x.date] > cap[m.date] ? x : m), opts[0]);
          assign[p.id] = f.date; members[f.date].push(p); cap[f.date] -= loadOf(p);
        }
      }
    }
  }
  return assign;
}

// ---------- Simulación de un día ----------
// pool: lugares candidatos (el planificador elige). order: orden forzado (para probar recorridos).
function runDay(ctx, pool, order) {
  const { date, end, mode, profile, opts, laterDates, affinity } = ctx;
  const items = [];
  const used = [];
  const fixedQ = [...ctx.fixedToday];
  const cand = order ? [...order] : [...pool];
  let t = ctx.start;
  let pos = ctx.pos;
  let lunchDone = ctx.lunchDone0;
  const addFree = (from, to) => {
    if (to - from < 1) return;
    const last = items[items.length - 1];
    if (last?.type === 'free' && last.end >= from) last.end = to;
    else items.push({ type: 'free', start: from, end: to });
  };

  for (let guard = 0; guard < 400; guard++) {
    const nf = fixedQ[0];
    const limit = (q) => (nf ? nf.fixed.start - travel(q, nf, mode).min : end);
    if (!nf && t >= end - 15) break;
    if (!lunchDone && t >= 16 * 60) lunchDone = true; // ya es tarde para almorzar
    const lunchTime = !lunchDone && t >= 12 * 60 + 30;

    let best = null;
    for (const p of order ? cand.slice(0, 1) : cand) {
      const isFood = p.category === 'comida';
      let ev = evaluate(p, { pos, date, t, mode, dayEnd: end });
      // Si en menos de 45 min empieza la entrada gratis (ej. Louvre 1er viernes 18:00), espera y entra gratis.
      const fr = p.price?.freeRules && !opts.noDefer?.has(p.id) ? freeOnDate(p, date) : null;
      if (ev.ok && fr?.from != null && ev.start < fr.from && fr.from - ev.start <= 45) {
        const tr = travel(pos, p, mode);
        const ev2 = evaluate(p, { pos, date, t: fr.from - tr.min, mode, dayEnd: end });
        if (ev2.ok) ev = { ...ev2, idle: fr.from - (t + tr.min), leaveAt: fr.from - tr.min };
      }
      if (!ev.ok || ev.end > limit(p)) continue;
      // Atardecer / noche: si todavía es temprano y hoy da tiempo a ir en su momento, se espera.
      if (!order && (p.slot === 'sunset' || p.slot === 'evening') && !inSlot(p.slot, date, ev.start)) {
        const from = p.slot === 'sunset' ? sunset(date) - 90 : Math.min(18 * 60, sunset(date));
        const hrs = hoursOn(p, date);
        if (ev.start < from && hrs && from + ev.wait + p.duration <= Math.min(hrs[1], limit(p))) continue;
      }
      // A la hora de almorzar: un restaurante de tu lista, o algo corto que termine antes de las 14:00.
      if (lunchTime && !isFood && ev.end > 14 * 60) continue;
      if (lunchTime && isFood && ev.travel.min > 30) continue;
      if (isFood) {
        const meal = (!lunchDone && ev.start >= 11 * 60 + 45 && ev.start <= 14 * 60 + 30) || (ev.start >= 19 * 60 && ev.start <= 21 * 60 + 30);
        if (!meal) continue; // los restaurantes van a la hora de almorzar o cenar
      }
      const cost = visitCost(p, date, ev.start, profile);
      // Sin zonas, el día decide si esperar al día gratis; con zonas eso ya lo decidió el reparto.
      if (!cost.freeToday && cost.amount >= 10 && !opts.noDefer?.has(p.id)
        && (ctx.deferFree ? freeLater(p, date, ev.start, laterDates) : freeLaterToday(p, date, ev.start))) continue;
      let s = 0;
      if (!order) {
        const openLater = laterDates.filter((d) => hoursOn(p, d)).length;
        const urgency = openLater === 0 ? 80 : openLater === 1 ? 30 : 0;
        s = score(p, ev, { date, lunchPending: !lunchDone, urgency });
        if (cost.freeToday) s += Math.min(45, cost.saved * 1.5);
        if (isFood) s += 80;
        if (lunchTime && !isFood) s -= 40;
        if (affinity[p.id] && affinity[p.id] < date) s += 30; // quedó pendiente de un día anterior
      }
      if (!best || s > best.s) best = { p, ev, s, cost };
    }

    if (lunchTime && !best && t + 60 <= limit(pos)) {
      items.push({ type: 'lunch', start: t, end: t + 60 });
      t += 60;
      lunchDone = true;
      continue;
    }
    if (best) {
      if (best.p.category === 'comida' && isLunchSlot(best.ev.start)) lunchDone = true;
      if (best.ev.leaveAt > t) { addFree(t, best.ev.leaveAt); t = best.ev.leaveAt; }
      const { leaveAt, ...ev } = best.ev;
      items.push({ type: 'visit', place: best.p, from: pos, ...ev, cost: best.cost });
      used.push(best.p);
      cand.splice(cand.indexOf(best.p), 1);
      t = ev.end;
      pos = best.p;
      continue;
    }
    if (nf && t + 30 > limit(pos)) {
      // Nada más cabe antes de la reserva: vamos a ella.
      const tr = travel(pos, nf, mode);
      const leaveAt = Math.max(t, nf.fixed.start - tr.min - 5); // llega 5 min antes
      addFree(t, leaveAt);
      const arrive = leaveAt + tr.min;
      const st = Math.max(arrive, nf.fixed.start);
      const hrs = hoursOn(nf, date);
      const warnings = [];
      if (arrive > nf.fixed.start + 5) warnings.push(`Llegarías a las ${fmt(arrive)}, tarde para tu reserva`);
      if (!hrs || nf.fixed.start < hrs[0] || nf.fixed.start >= hrs[1]) warnings.push('Según el horario que conozco, a esa hora está cerrado: verifícalo');
      items.push({
        type: 'visit', fixed: true, place: nf, from: pos, travel: tr, arrive, start: st,
        idle: 0, crowd: crowdAt(nf, date, st), wait: 0, end: st + nf.duration, warnings, cost: visitCost(nf, date, st, profile),
      });
      fixedQ.shift();
      t = st + nf.duration;
      pos = nf;
      if (nf.category === 'comida' && isLunchSlot(st)) lunchDone = true;
      continue;
    }
    if (order && !cand.length && !nf) break;
    const step = nf ? Math.min(30, limit(pos) - t) : Math.min(30, end - t);
    if (step <= 0) break;
    addFree(t, t + step);
    t += step;
  }
  return { items, used, ok: !order || cand.length === 0 };
}

// Penalización total de un día (menos es mejor): traslados, esperas, filas, aforo, momento del día y precio.
function dayPenalty(items, date) {
  let q = 0;
  for (const it of items) {
    if (it.type !== 'visit') continue;
    q += it.travel.min * 1.2 + it.idle * 0.6 + it.wait * 0.8 + it.crowd * 40 + SLOT_MISS(it.place, date, it.start) + (it.cost?.amount || 0) * 3;
    if (it.warnings?.length) q += 500;
  }
  return q;
}

// ---------- Etapa 3: optimizar el recorrido del día ----------
// Prueba invertir tramos y mover lugares (2-opt / or-opt) y se queda con el orden de menor penalización.
function improveDay(ctx, res) {
  let seq = res.used;
  if (seq.length < 3) return res;
  let best = { res, q: dayPenalty(res.items, ctx.date) };
  let sims = 0;
  let improved = true;
  while (improved && sims < 600) {
    improved = false;
    outer: for (let i = 0; i < seq.length - 1; i++) {
      for (let j = i + 1; j < seq.length; j++) {
        const rev = [...seq.slice(0, i), ...seq.slice(i, j + 1).reverse(), ...seq.slice(j + 1)];
        const mv = [...seq]; mv.splice(j, 0, mv.splice(i, 1)[0]);
        const mv2 = [...seq]; mv2.splice(i, 0, mv2.splice(j, 1)[0]);
        for (const c of [rev, mv, mv2]) {
          sims++;
          const r = runDay(ctx, null, c);
          if (!r.ok) continue;
          const q = dayPenalty(r.items, ctx.date);
          if (q < best.q - 1) { best = { res: r, q }; seq = c; improved = true; break outer; }
        }
      }
    }
  }
  return best.res;
}

// Un lugar con hora fija (reserva) lleva place.fixed = { date:'YYYY-MM-DD', start: minutos }.
function planOnce(places, trip, opts = {}) {
  const arrival = splitDateTime(trip.arrival);
  const departure = splitDateTime(trip.departure);
  if (!arrival.date || !departure.date || departure.date < arrival.date) {
    return { days: [], unscheduled: [], error: 'Revisa las fechas de llegada y salida.' };
  }
  const mode = trip.mode || 'mixto';
  const hotelFar = trip.hotel?.lat && haversineKm(trip.hotel, PARIS) > MAX_HOTEL_KM;
  const hotel = trip.hotel?.lat && !hotelFar ? trip.hotel : PARIS;
  const warnings = hotelFar ? [{ type: 'hotelFar', km: Math.round(haversineKm(trip.hotel, PARIS)) }] : [];
  const profile = { residency: trip.residency || 'non-eea', age: trip.age || 'adult' };
  const dates = [];
  for (let d = arrival.date; d <= departure.date; d = addDays(d, 1)) dates.push(d);

  const pending = places.filter((p) => !opts.visited?.[p.id]);
  let remaining = pending.filter((p) => !p.fixed);
  const fixedAll = pending.filter((p) => p.fixed);
  const unscheduled = [];
  for (const p of fixedAll) {
    if (!dates.includes(p.fixed.date)) unscheduled.push({ place: p, reason: 'La fecha de la reserva no está dentro de tu viaje' });
    else if (opts.now && (p.fixed.date < opts.now.date || (p.fixed.date === opts.now.date && p.fixed.start < opts.now.min - 30))) {
      unscheduled.push({ place: p, reason: `La hora reservada (${fmt(p.fixed.start)}) ya pasó: márcalo como visitado o cambia la hora` });
    }
  }

  // Marco de cada día: horario disponible, punto de partida y reservas.
  const frames = [];
  dates.forEach((date, i) => {
    if (opts.now && date < opts.now.date) return;
    let start = toMin(trip.dayStart || '09:00');
    const end0 = toMin(trip.dayEnd || '22:00');
    let end = end0;
    if (date === arrival.date) start = Math.max(start, arrival.min + Number(trip.arrivalBuffer ?? 90));
    if (date === departure.date) end = Math.min(end, departure.min - Number(trip.departureBuffer ?? 180));
    let pos = hotel;
    if (opts.now && date === opts.now.date) {
      start = Math.max(start, opts.now.min);
      if (opts.now.pos) pos = opts.now.pos;
    }
    const fixedToday = fixedAll
      .filter((p) => p.fixed.date === date && !unscheduled.some((u) => u.place === p))
      .sort((x, y) => x.fixed.start - y.fixed.start);
    // Una reserva antes de la hora habitual de inicio adelanta el día para llegar a tiempo.
    if (fixedToday.length) {
      let earliest = 0;
      if (date === arrival.date) earliest = arrival.min + Number(trip.arrivalBuffer ?? 90);
      if (opts.now && date === opts.now.date) earliest = Math.max(earliest, opts.now.min);
      const leave = fixedToday[0].fixed.start - travel(pos, fixedToday[0], mode).min - 5;
      if (leave < start) start = Math.max(earliest, leave);
    }
    frames.push({ date, i, start, end, pos, fixedToday });
  });

  const affinity = opts.noZones ? {} : assignDays(remaining, frames, {
    lunch: trip.lunch, profile, noDefer: opts.noDefer, trace: opts.trace, zoneKm: opts.zoneKm, emptyDayKm: opts.emptyDayKm,
  });

  const days = [];
  for (const f of frames) {
    const day = { date: f.date, dow: dow(f.date), start: f.start, end: f.end, sunset: sunset(f.date), items: [] };
    days.push(day);
    if (f.end - f.start < 45 && !f.fixedToday.length) { day.note = 'Día sin tiempo libre para visitas'; continue; }
    const ctx = {
      ...f, mode, profile, opts, affinity, laterDates: dates.slice(f.i + 1), deferFree: !Object.keys(affinity).length,
      lunchDone0: !trip.lunch || f.start >= 14 * 60 || f.end <= 13 * 60
        || f.fixedToday.some((p) => p.category === 'comida' && isLunchSlot(p.fixed.start)),
    };
    // Cada día trabaja con los lugares de su zona (y lo pendiente de días anteriores).
    const pool = remaining.filter((p) => !affinity[p.id] || affinity[p.id] <= f.date);
    const res = runDay(ctx, pool, null);
    day.items = res.items;
    day.ctx = ctx;
    day.used = res.used;
    remaining = remaining.filter((p) => !res.used.includes(p));
  }

  // Repaso: lo que quedó fuera se intenta meter en el día (de su zona primero) que tenga hueco, sin quitar nada.
  for (const p of [...remaining].sort((x, y) => (y.priority ?? 2) - (x.priority ?? 2))) {
    const center = (d) => {
      const v = d.used.length ? d.used : [d.ctx.pos];
      return { lat: v.reduce((a, q) => a + q.lat, 0) / v.length, lng: v.reduce((a, q) => a + q.lng, 0) / v.length };
    };
    const cands = days.filter((d) => d.ctx && hoursOn(p, d.date))
      .sort((d1, d2) => haversineKm(center(d1), p) - haversineKm(center(d2), p));
    for (const d of cands) {
      const r = runDay({ ...d.ctx, affinity: {} }, [...d.used, p], null);
      if (r.used.length === d.used.length + 1) {
        d.items = r.items; d.used = r.used;
        remaining = remaining.filter((x) => x !== p);
        break;
      }
    }
  }

  // Si algo quedó fuera por esperar su día gratis, se replanifica sin esperar.
  const deferredOut = remaining.filter((p) => p.price?.freeRules && !opts.noDefer?.has(p.id));
  if (deferredOut.length) {
    const r = planOnce(places, trip, { ...opts, noDefer: new Set([...(opts.noDefer || []), ...deferredOut.map((p) => p.id)]) });
    r.path = `deferral(${deferredOut.map((p) => p.id)})>${r.path}`;
    return r;
  }
  const tripDates = days.map((d) => d.date);
  for (const p of remaining) {
    unscheduled.push({
      place: p,
      reason: p.price?.closed ? (p.price.note || 'Cerrado') : tripDates.some((d) => hoursOn(p, d)) ? 'No cupo en el tiempo disponible: súbele la prioridad o quita otro lugar' : 'Cerrado todos los días de tu viaje',
    });
  }
  return { days, unscheduled, warnings, affinity, path: opts.noZones ? 'nozones' : 'zones' };
}

// Puntaje global (menos es mejor): lugares fuera, cercanos separados y penalización de cada día.
function scoreOf(dayItems, left) {
  let q = 0;
  for (const p of left) q += p.fixed ? 0 : p.priority === 3 ? 20000 : 400 + (PRIORITY_WEIGHT[p.priority] ?? 150) * 3; // dejar algo fuera es lo peor (un imprescindible, muchísimo peor)
  const dayOf = new Map();
  for (const [date, items] of dayItems) {
    q += dayPenalty(items, date);
    for (const it of items) if (it.type === 'visit') dayOf.set(it.place, date);
  }
  const vs = [...dayOf.keys()];
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      if (dayOf.get(vs[i]) === dayOf.get(vs[j])) continue;
      const d = haversineKm(vs[i], vs[j]);
      if (d < 1) q += 40 + 80 * (1 - d); // cercanos en días distintos: cuanto más cerca, peor
    }
  }
  return q;
}
export function planScore(plan) {
  if (plan.error) return Infinity;
  return scoreOf(plan.days.map((d) => [d.date, d.items]), plan.unscheduled.map((u) => u.place));
}

// Búsqueda local entre días: mover, intercambiar o meter lugares, simulando cada día de verdad.
function localSearch(plan, budgetMs = 250) {
  const days = plan.days.filter((d) => d.ctx);
  if (!days.length) return;
  const t0 = Date.now();
  const sim = (d, set) => {
    const r = runDay({ ...d.ctx, affinity: {}, deferFree: false }, set, null);
    return r.used.length === set.length ? r : null;
  };
  const sets = new Map(days.map((d) => [d, [...d.used]]));
  const items = new Map(plan.days.map((d) => [d.date, d.items]));
  const fixable = (p) => !p.fixed && !p.price?.closed && days.some((d) => hoursOn(p, d.date));
  let left = plan.unscheduled.map((u) => u.place).filter(fixable);
  const others = plan.unscheduled.filter((u) => !fixable(u.place));
  let cur = scoreOf(items, left);
  const tryApply = (changes, newLeft) => {
    const tmp = new Map(items);
    for (const [d, r] of changes) tmp.set(d.date, r.items);
    const sc = scoreOf(tmp, newLeft);
    if (sc < cur - 0.5) {
      for (const [d, r, set] of changes) { items.set(d.date, r.items); sets.set(d, set); d.used = r.used; }
      left = newLeft; cur = sc;
      return true;
    }
    return false;
  };
  let improved = true;
  while (improved && Date.now() - t0 < budgetMs) {
    improved = false;
    // 1) meter lo que quedó fuera
    for (const p of [...left]) {
      for (const d of days) {
        const set = [...sets.get(d), p];
        const r = hoursOn(p, d.date) && sim(d, set);
        if (r && tryApply([[d, r, set]], left.filter((x) => x !== p))) { improved = true; break; }
      }
    }
    // 2) mover un lugar a otro día
    moves: for (const a of days) {
      for (const p of sets.get(a)) {
        for (const b of days) {
          if (b === a || !hoursOn(p, b.date)) continue;
          if (Date.now() - t0 > budgetMs) break moves;
          const sa = sets.get(a).filter((x) => x !== p);
          const sb = [...sets.get(b), p];
          const rb = sim(b, sb); if (!rb) continue;
          const ra = sim(a, sa); if (!ra) continue;
          if (tryApply([[a, ra, sa], [b, rb, sb]], left)) { improved = true; break moves; }
        }
      }
    }
    // 3) intercambiar dos lugares entre días
    swaps: for (const a of days) {
      for (const b of days) {
        if (b.date <= a.date) continue;
        for (const p of sets.get(a)) {
          for (const q of sets.get(b)) {
            if (!hoursOn(p, b.date) || !hoursOn(q, a.date)) continue;
            if (Date.now() - t0 > budgetMs) break swaps;
            const sa = [...sets.get(a).filter((x) => x !== p), q];
            const sb = [...sets.get(b).filter((x) => x !== q), p];
            const ra = sim(a, sa); if (!ra) continue;
            const rb = sim(b, sb); if (!rb) continue;
            if (tryApply([[a, ra, sa], [b, rb, sb]], left)) { improved = true; break swaps; }
          }
        }
      }
    }
  }
  for (const d of days) d.items = items.get(d.date);
  plan.unscheduled = [...others, ...plan.unscheduled.filter((u) => left.includes(u.place))];
}

// Los imprescindibles (prioridad 3) siempre entran: si alguno quedó fuera, se le hace sitio
// quitando lo de menor prioridad del día donde cueste menos; lo quitado intenta ir a otro día.
function forceMust(plan, opts) {
  const days = plan.days.filter((d) => d.ctx);
  const sim = (d, set) => {
    const r = runDay({ ...d.ctx, affinity: {}, deferFree: false }, set, null);
    return r.used.length === set.length ? r : null;
  };
  const must = plan.unscheduled.map((u) => u.place).filter((p) => p.priority === 3 && !p.fixed && !p.price?.closed);
  for (const p of must) {
    let best = null;
    for (const d of days) {
      if (!hoursOn(p, d.date)) continue;
      const removable = d.used.filter((x) => x.priority !== 3)
        .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || loadOf(b) - loadOf(a));
      for (let k = 0; k <= removable.length; k++) {
        const out = removable.slice(0, k);
        const set = [...d.used.filter((x) => !out.includes(x)), p];
        const r = sim(d, set);
        if (r) {
          const cost = out.reduce((acc, x) => acc + (PRIORITY_WEIGHT[x.priority] ?? 150), 0) + dayPenalty(r.items, d.date) / 100;
          if (!best || cost < best.cost) best = { d, r, set, out, cost };
          break;
        }
      }
    }
    if (!best) continue;
    best.d.items = best.r.items; best.d.used = best.r.used;
    plan.unscheduled = plan.unscheduled.filter((u) => u.place !== p);
    for (const x of best.out) {
      plan.unscheduled.push({ place: x, reason: `Se quitó para que entre «${p.name}» (imprescindible)` });
    }
  }
  if (must.length && !opts.noSearch) localSearch(plan, 150); // intenta reubicar lo que se quitó
  // Explicar por qué un imprescindible no entra ni así.
  for (const u of plan.unscheduled) {
    const p = u.place;
    if (p.priority !== 3 || p.fixed || p.price?.closed) continue;
    const openDays = days.filter((d) => hoursOn(p, d.date));
    if (!openDays.length) { u.reason = 'Imprescindible, pero está cerrado todos los días de tu viaje'; continue; }
    const longest = Math.max(...openDays.map((d) => Math.min(d.ctx.end, hoursOn(p, d.date)[1]) - Math.max(d.ctx.start, hoursOn(p, d.date)[0])));
    u.reason = longest < p.duration
      ? `Imprescindible, pero no cabe: necesita ${Math.round(p.duration / 6) / 10} h y como mucho tienes ${Math.max(0, Math.round(longest / 6) / 10)} h con el lugar abierto. Amplía tu horario del día o acorta la visita.`
      : 'Imprescindible, pero choca con otros imprescindibles o reservas: quita alguno o amplía tus días.';
  }
}

// Ordena cada día (2-opt), limpia tiempos libres y pone notas.
function finalize(plan, opts) {
  for (const day of plan.days) {
    if (day.ctx && !opts.noOptimize) {
      const r = improveDay({ ...day.ctx, affinity: {}, deferFree: false }, { items: day.items, used: day.used });
      day.items = r.items;
    }
    delete day.ctx; delete day.used;
    for (let k = 0; k < day.items.length; k++) {
      const it = day.items[k];
      if (it.type === 'free' && it.end - it.start < 10) { day.items.splice(k, 1); k--; }
    }
    while (day.items.length && day.items[day.items.length - 1].type === 'free') day.items.pop();
    if (!day.items.some((it) => it.type === 'visit')) { day.items = []; day.empty = true; }
  }
  for (const d of plan.days) {
    if (!d.empty || d.note) continue;
    d.note = plan.unscheduled.length ? 'No cupo ninguna visita este día (revisa abajo los lugares que quedaron fuera).' : 'Día libre: ya está todo programado. Agrega más lugares si quieres.';
  }
  return plan;
}

// Genera varios planes (sin zonas y con zonas de distintos tamaños), mejora el mejor y lo ordena.
export function planTrip(places, trip, opts = {}) {
  const variants = opts.noZones || opts.zoneKm ? [{}] : [
    { noZones: true },
    { zoneKm: 1.5, emptyDayKm: 2.5 }, { zoneKm: 1.5, emptyDayKm: 1.2 }, { zoneKm: 1.5, emptyDayKm: 4 },
    { zoneKm: 1.0, emptyDayKm: 2.5 }, { zoneKm: 2.0, emptyDayKm: 2.5 }, { zoneKm: 2.5, emptyDayKm: 2 },
  ];
  let best = null;
  for (const v of variants) {
    const plan = planOnce(places, trip, { ...opts, ...v });
    if (plan.error) return plan;
    const sc = planScore(plan);
    if (!best || sc < best.sc) best = { plan, sc, v };
  }
  const plan = best.plan;
  plan.variant = best.v;
  if (!opts.noSearch) localSearch(plan, opts.searchMs ?? 250);
  forceMust(plan, opts);
  return finalize(plan, opts);
}

// ---------- Recomendación "¿Qué hago ahora?" ----------
// reports: { id: { level: 0-1, at: epochMs } } aforo reportado por ti en el lugar (válido 90 min)
// nextFixed: próxima reserva de hoy (lugar con .fixed); no recomienda nada que te haga llegar tarde.
export function rankNow(places, { pos, date, min, mode = 'mixto', reports = {}, nowMs = Date.now(), nextFixed = null }) {
  return places.map((p) => {
    const r = reports[p.id];
    const fresh = r && nowMs - r.at < 90 * 60 * 1000 ? r.level : undefined;
    let ev = evaluate(p, { pos, date, t: min, mode, crowdOverride: fresh });
    const tr = travel(pos, p, mode);
    if (ev.ok && nextFixed && nextFixed.id !== p.id && ev.end + travel(p, nextFixed, mode).min > nextFixed.fixed.start) {
      ev = { ok: false, reason: `Llegarías tarde a tu reserva en ${nextFixed.name} (${fmt(nextFixed.fixed.start)})` };
    }
    if (!ev.ok) {
      const bt = bestTime(p, date, min + tr.min);
      return { place: p, ok: false, reason: ev.reason, travel: tr, best: bt, score: -1e6 + (PRIORITY_WEIGHT[p.priority] ?? 0) };
    }
    const best = bestTime(p, date, ev.start);
    const s = score(p, ev, { date, lunchPending: false });
    const reasons = [];
    reasons.push(`${tr.min} min ${tr.how}`);
    reasons.push(`aforo ${crowdLevel(ev.crowd).label.toLowerCase()} (${Math.round(ev.crowd * 100)}%)${fresh !== undefined ? ' · reportado' : ''}`);
    if (ev.wait) reasons.push(`~${ev.wait} min de fila`);
    if (ev.idle) reasons.push(`abre a las ${fmt(ev.start)}`);
    let later = null;
    if (best && best.start > ev.start + 45 && best.crowd < ev.crowd - 0.15) {
      later = `Mejor a las ${fmt(best.start)} (aforo ${Math.round(best.crowd * 100)}%)`;
    }
    return { place: p, ok: true, ev, travel: tr, best, later, reasons, score: s - (later ? 25 : 0) };
  }).sort((a, b) => b.score - a.score);
}

export function mapsLink(from, to, mode = 'transit') {
  const o = from ? `&origin=${from.lat},${from.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${to.lat},${to.lng}&travelmode=${mode}`;
}
