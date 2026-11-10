// Motor de planificación: tiempos, distancias, aforo estimado y armado del itinerario.
import { CATEGORY_CURVES, DAY_FACTOR, SEASON_FACTOR } from './data.js';
import { freeOnDate, visitCost } from './prices.js';

export const PARIS = { lat: 48.8566, lng: 2.3522, name: 'Centro de París' };
export const MAX_HOTEL_KM = 60; // un alojamiento más lejos no puede ser el de este viaje (Versalles está a 17 km)
export const PRIORITY_WEIGHT = { 3: 300, 2: 150, 1: 60 };
export const PRIORITY_LABEL = { 3: 'Imprescindible', 2: 'Me gustaría', 1: 'Si da tiempo' };

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
export function parisOffset(dateStr) {
  const [y, m, d] = ymd(dateStr);
  return parisNow(new Date(Date.UTC(y, m - 1, d, 12))).min - 12 * 60;
}

// Hora de la puesta de sol en París (minutos, hora local). Aproximación NOAA.
export function sunset(dateStr, lat = PARIS.lat, lng = PARIS.lng) {
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
function freeLater(p, date, start, laterDates) {
  if (!p.price?.freeRules) return false;
  const today = freeOnDate(p, date);
  const hrs = hoursOn(p, date);
  if (today && today.from != null && start < today.from && hrs && today.from + p.duration <= hrs[1]) return true;
  return laterDates.some((d) => hoursOn(p, d) && freeOnDate(p, d));
}

// Un lugar con hora fija (reserva) lleva place.fixed = { date:'YYYY-MM-DD', start: minutos }.
export function planTrip(places, trip, opts = {}) {
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
  const remaining = pending.filter((p) => !p.fixed);
  const fixedAll = pending.filter((p) => p.fixed);
  const unscheduled = [];
  const isLunchSlot = (m) => m >= 11 * 60 + 30 && m <= 14 * 60 + 30;
  const days = [];

  for (const p of fixedAll) {
    if (!dates.includes(p.fixed.date)) unscheduled.push({ place: p, reason: 'La fecha de la reserva no está dentro de tu viaje' });
    else if (opts.now && (p.fixed.date < opts.now.date || (p.fixed.date === opts.now.date && p.fixed.start < opts.now.min - 30))) {
      unscheduled.push({ place: p, reason: `La hora reservada (${fmt(p.fixed.start)}) ya pasó: márcalo como visitado o cambia la hora` });
    }
  }

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (opts.now && date < opts.now.date) continue;
    let start = toMin(trip.dayStart || '09:00');
    let end = toMin(trip.dayEnd || '22:00');
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
    const day = { date, dow: dow(date), start, end, sunset: sunset(date), items: [] };
    days.push(day);
    if (end - start < 45 && !fixedToday.length) { day.note = 'Día sin tiempo libre para visitas'; continue; }

    const laterDates = dates.slice(i + 1);
    let t = start;
    let lunchDone = !trip.lunch || start >= 14 * 60 || end <= 13 * 60
      || fixedToday.some((p) => p.category === 'comida' && isLunchSlot(p.fixed.start));
    const addFree = (from, to) => {
      if (to - from < 1) return;
      const last = day.items[day.items.length - 1];
      if (last?.type === 'free' && last.end >= from) last.end = to;
      else day.items.push({ type: 'free', start: from, end: to });
    };

    for (;;) {
      const nf = fixedToday[0];
      // Hora límite: llegar a tiempo a la próxima reserva, o fin del día.
      const limit = (q) => (nf ? nf.fixed.start - travel(q, nf, mode).min : end);
      if (!nf && t >= end - 15) break;
      if (!lunchDone && t >= 15 * 60 + 30) lunchDone = true; // ya es tarde para almorzar

      const lunchTime = !lunchDone && t >= 12 * 60 + 30;
      let best = null;
      for (const p of remaining) {
        const isFood = p.category === 'comida';
        if (lunchTime && !isFood) continue; // a la hora de almorzar solo vale un restaurante de tu lista
        let ev = evaluate(p, { pos, date, t, mode, dayEnd: end });
        // Si en menos de 45 min empieza la entrada gratis (ej. Louvre 1er viernes 18:00), espera y entra gratis.
        const fr = p.price?.freeRules && !opts.noDefer?.has(p.id) ? freeOnDate(p, date) : null;
        if (ev.ok && fr?.from != null && ev.start < fr.from && fr.from - ev.start <= 45) {
          const tr = travel(pos, p, mode);
          const ev2 = evaluate(p, { pos, date, t: fr.from - tr.min, mode, dayEnd: end });
          if (ev2.ok) ev = { ...ev2, idle: fr.from - (t + tr.min), leaveAt: fr.from - tr.min };
        }
        if (!ev.ok || ev.end > limit(p)) continue;
        if (lunchTime && ev.travel.min > 30) continue;
        const openLater = laterDates.filter((d) => hoursOn(p, d)).length;
        const urgency = openLater === 0 ? 80 : openLater === 1 ? 30 : 0;
        let s = score(p, ev, { date, lunchPending: !lunchDone, urgency });
        const cost = visitCost(p, date, ev.start, profile);
        if (cost.freeToday) s += Math.min(45, cost.saved * 1.5); // aprovecha la entrada gratis
        else if (cost.amount >= 10 && !opts.noDefer?.has(p.id) && freeLater(p, date, ev.start, laterDates)) continue; // espera el día gratis
        if (isFood) {
          // Los restaurantes y cafés van solo a la hora de almorzar o cenar.
          const meal = (!lunchDone && ev.start >= 11 * 60 + 45 && ev.start <= 14 * 60 + 30) || (ev.start >= 19 * 60 && ev.start <= 21 * 60 + 30);
          if (!meal) continue;
          s += 80;
        }
        if (!best || s > best.s) best = { p, ev, s };
      }
      if (lunchTime && !best && t + 60 <= limit(pos)) {
        day.items.push({ type: 'lunch', start: t, end: t + 60 });
        t += 60;
        lunchDone = true;
        continue;
      }
      if (best) {
        if (best.p.category === 'comida' && isLunchSlot(best.ev.start)) lunchDone = true;
        if (best.ev.leaveAt > t) { addFree(t, best.ev.leaveAt); t = best.ev.leaveAt; }
        delete best.ev.leaveAt;
        day.items.push({ type: 'visit', place: best.p, from: pos, ...best.ev, cost: visitCost(best.p, date, best.ev.start, profile) });
        remaining.splice(remaining.indexOf(best.p), 1);
        t = best.ev.end;
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
        const crowd = crowdAt(nf, date, st);
        day.items.push({
          type: 'visit', fixed: true, place: nf, from: pos, travel: tr, arrive, start: st,
          idle: 0, crowd, wait: 0, end: st + nf.duration, warnings, cost: visitCost(nf, date, st, profile),
        });
        fixedToday.shift();
        t = st + nf.duration;
        pos = nf;
        if (nf.category === 'comida' && isLunchSlot(st)) lunchDone = true;
        continue;
      }
      // Tiempo libre (esperando a que algo abra o a la próxima reserva).
      const step = nf ? Math.min(30, limit(pos) - t) : Math.min(30, end - t);
      addFree(t, t + step);
      t += step;
    }
    // Entre el fin de lo programado y una reserva: tiempo libre visible; al final del día se recorta.
    for (let k = 0; k < day.items.length; k++) {
      const it = day.items[k];
      if (it.type === 'free' && it.end - it.start < 10) { day.items.splice(k, 1); k--; }
    }
    while (day.items.length && day.items[day.items.length - 1].type === 'free') day.items.pop();
    if (!day.items.some((it) => it.type === 'visit')) { day.items = []; day.empty = true; }
  }

  // Si algo quedó fuera por esperar su día gratis, se replanifica sin esperar.
  const deferredOut = remaining.filter((p) => p.price?.freeRules && !opts.noDefer?.has(p.id));
  if (deferredOut.length) {
    return planTrip(places, trip, { ...opts, noDefer: new Set([...(opts.noDefer || []), ...deferredOut.map((p) => p.id)]) });
  }
  const tripDates = days.map((d) => d.date);
  for (const p of remaining) {
    unscheduled.push({
      place: p,
      reason: p.price?.closed ? (p.price.note || 'Cerrado') : tripDates.some((d) => hoursOn(p, d)) ? 'No cupo en el tiempo disponible: súbele la prioridad o quita otro lugar' : 'Cerrado todos los días de tu viaje',
    });
  }
  for (const d of days) {
    if (!d.empty || d.note) continue;
    d.note = unscheduled.length ? 'No cupo ninguna visita este día (revisa abajo los lugares que quedaron fuera).' : 'Día libre: ya está todo programado. Agrega más lugares si quieres.';
  }
  return { days, unscheduled, warnings };
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
