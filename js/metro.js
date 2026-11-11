// Rutas en metro, RER y tranvía por la red real de París (datos: Île-de-France Mobilités, ODbL).
// Dice qué línea tomar, en qué dirección, cuántas paradas, dónde cambiar, cuánto caminar y cuánto cuesta.
import { METRO } from './metro-data.js';

const FARE = { metro: 2.55, bus: 2.05, airport: 14 }; // 2026
const SPEED = { M: 30, R: 45, T: 18 };   // km/h medios en marcha (incluye paradas cortas)
const WAIT = { M: 3, R: 5, T: 4 };       // espera media al subir (min)
const TRANSFER = 5;                      // cambio de línea dentro de la estación (min, a pie + espera)
const WALK_KMH = 4.5; const DETOUR = 1.3;
const ACCESS_KM = 1.2;                   // estaciones a las que vale la pena ir caminando

const S = METRO.stations.map(([name, lat, lng], i) => ({ i, name, lat, lng }));
const kind = (line) => (line.startsWith('RER') ? 'R' : line.startsWith('T') ? 'T' : 'M');
export const lineLabel = (line) => (line.startsWith('M') ? `Metro ${line.slice(1)}` : line.startsWith('T') ? `Tranvía ${line}` : line);
export const lineColor = (line) => METRO.lines[line]?.color || '#777';

// Adyacencia: estación -> [{to, line, km}]
const ADJ = S.map(() => []);
const LADJ = {}; // línea -> Map(estación -> [vecinos])
for (const [line, { edges }] of Object.entries(METRO.lines)) {
  const m = new Map();
  for (const [a, b, d] of edges) {
    ADJ[a].push({ to: b, line, km: d }); ADJ[b].push({ to: a, line, km: d });
    (m.get(a) || m.set(a, []).get(a)).push(b); (m.get(b) || m.set(b, []).get(b)).push(a);
  }
  LADJ[line] = m;
}

function hav(a, b) {
  const R = 6371; const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r; const dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export const walkMinutes = (a, b) => Math.round((hav(a, b) * DETOUR / WALK_KMH) * 60);
const nearCache = new Map();
const near = (p) => { const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`; if (!nearCache.has(k)) { if (nearCache.size > 2000) nearCache.clear(); nearCache.set(k, nearRaw(p)); } return nearCache.get(k); };
const nearRaw = (p) => S.map((s) => ({ s, km: hav(p, s) })).filter((x) => x.km <= ACCESS_KM).sort((x, y) => x.km - y.km).slice(0, 8);

// Cola de prioridad mínima (montículo binario).
class Heap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1; const r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.a.length; }
}

// Terminal(es) en el sentido de la marcha: desde «to» alejándose de «from».
function direction(line, from, to) {
  const m = LADJ[line]; const ends = new Set(); const seen = new Set([from, to]);
  const stack = [to]; let far = to; let farD = 0;
  while (stack.length) {
    const x = stack.pop();
    const nb = (m.get(x) || []).filter((y) => !seen.has(y));
    if (!nb.length && x !== to) ends.add(x);
    for (const y of nb) {
      seen.add(y); stack.push(y);
      const d = hav(S[to], S[y]); if (d > farD) { farD = d; far = y; }
    }
  }
  if (!ends.size && (m.get(to) || []).length <= 1) ends.add(to); // «to» ya es el final de la línea
  return [...(ends.size ? ends : new Set([far]))].map((i) => S[i].name);
}

const cache = new Map();
/**
 * Mejor ruta en transporte público de a -> b ({lat,lng}).
 * Devuelve { minutes, walkMin, legs:[{type:'walk',min,to} | {type:'ride',line,from,to,stops,dir,min}], price, ticket } o null.
 */
export function route(a, b) {
  const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);
  const res = computeRoute(a, b);
  if (cache.size > 5000) cache.clear();
  cache.set(key, res);
  return res;
}

// Desde un origen, tiempos a toda la red (una sola vez por origen; se reutiliza para cualquier destino).
const fromCache = new Map();
function fromOrigin(a) {
  const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}`;
  if (fromCache.has(key)) return fromCache.get(key);
  const dist = new Map(); const prev = new Map(); const heap = new Heap();
  const bestAt = new Map(); // estación -> { t, k } habiendo viajado en algo
  for (const st of near(a)) {
    const k = `${st.s.i}|`; const t = (st.km * DETOUR / WALK_KMH) * 60;
    if (t < (dist.get(k) ?? Infinity)) { dist.set(k, t); prev.set(k, null); heap.push([t, st.s.i, '']); }
  }
  while (heap.size) {
    const [t, i, line] = heap.pop();
    const k = `${i}|${line}`;
    if (t > (dist.get(k) ?? Infinity)) continue;
    if (line && t < (bestAt.get(i)?.t ?? Infinity)) bestAt.set(i, { t, k });
    for (const e of ADJ[i]) {
      const kd = kind(e.line);
      let c = t + 0.4 + (e.km / SPEED[kd]) * 60;
      if (line !== e.line) c += line ? TRANSFER + WAIT[kd] - 3 : WAIT[kd];
      const k2 = `${e.to}|${e.line}`;
      if (c < (dist.get(k2) ?? Infinity)) { dist.set(k2, c); prev.set(k2, k); heap.push([c, e.to, e.line]); }
    }
  }
  const r = { prev, bestAt };
  if (fromCache.size > 200) fromCache.clear();
  fromCache.set(key, r);
  return r;
}

function computeRoute(a, b) {
  const ends = near(b);
  if (!ends.length) return null;
  const { prev, bestAt } = fromOrigin(a);
  let best = null;
  for (const e of ends) {
    const at = bestAt.get(e.s.i);
    if (!at) continue;
    const egress = Math.round((e.km * DETOUR / WALK_KMH) * 60);
    if (!best || at.t + egress < best.t) best = { t: at.t + egress, k: at.k, end: e.s.i, egress };
  }
  if (!best) return null;
  const endWalk = new Map([[best.end, best.egress]]);
  // reconstruir
  const path = []; let k = best.k;
  while (k) { const [i, line] = k.split('|'); path.push({ i: Number(i), line }); k = prev.get(k); }
  path.reverse();
  const legs = [];
  const first = path[0];
  const accessMin = Math.round((hav(a, S[first.i]) * DETOUR / WALK_KMH) * 60);
  if (accessMin > 0) legs.push({ type: 'walk', min: accessMin, to: S[first.i].name });
  for (let j = 1; j < path.length; j++) {
    const { i, line } = path[j];
    const last = legs[legs.length - 1];
    if (last?.type === 'ride' && last.line === line) { last.stops++; last.toI = i; last.prevI = path[j - 1].i; continue; }
    legs.push({ type: 'ride', line, fromI: path[j - 1].i, toI: i, prevI: path[j - 1].i, stops: 1 });
  }
  const egress = endWalk.get(best.end);
  if (egress > 0) legs.push({ type: 'walk', min: egress, to: 'tu destino' });
  let rideTime = 0;
  for (const l of legs) {
    if (l.type !== 'ride') continue;
    l.from = S[l.fromI].name; l.to = S[l.toI].name;
    l.dir = direction(l.line, l.prevI, l.toI);
    l.color = lineColor(l.line); l.label = lineLabel(l.line);
    const kd = kind(l.line);
    l.min = Math.round(l.stops * 1.6 * (kd === 'R' ? 1.5 : kd === 'T' ? 1.1 : 1));
    rideTime += l.min;
    delete l.fromI; delete l.toI; delete l.prevI;
  }
  const rides = legs.filter((l) => l.type === 'ride');
  if (!rides.length) return null;
  const walkMin = legs.filter((l) => l.type === 'walk').reduce((s, l) => s + l.min, 0);
  const airport = rides.some((l) => /Aéroport|Aeroport/i.test(l.from + l.to));
  const tram = rides.some((l) => kind(l.line) === 'T'); const rail = rides.some((l) => kind(l.line) !== 'T');
  let price; let ticket;
  if (airport) { price = FARE.airport; ticket = `Billete «Paris Région–Aéroports» (€${FARE.airport})`; }
  else if (tram && rail) { price = FARE.bus + FARE.metro; ticket = `Ticket Bus-Tram (€${FARE.bus}) para el tranvía + ticket Metro-Train-RER (€${FARE.metro})`; }
  else if (tram) { price = FARE.bus; ticket = `Ticket Bus-Tram (€${FARE.bus})`; }
  else { price = FARE.metro; ticket = `Un ticket Metro-Train-RER (€${FARE.metro}), vale para todos los cambios durante 2 h`; }
  return { minutes: Math.round(best.t), walkMin, rideMin: rideTime, changes: rides.length - 1, legs, price, ticket };
}

/** ¿Caminar o metro? Devuelve { best:'walk'|'metro', walk, metro, reason }. */
export function compare(a, b) {
  const walk = walkMinutes(a, b);
  const m = walk > 8 ? route(a, b) : null;
  let best = 'walk'; let reason = 'Está cerca: mejor caminando.';
  if (m) {
    const saves = walk - m.minutes;
    if (walk <= 15) { reason = `Caminando ${walk} min; el metro casi no ahorra tiempo.`; }
    else if (saves >= 8 || walk > 40) { best = 'metro'; reason = `El metro te ahorra ${saves} min (caminando serían ${walk} min).`; }
    else reason = `Caminando ${walk} min; el metro solo ahorraría ${Math.max(0, saves)} min.`;
  }
  return { best, walk, metro: m, reason };
}

export const metroSource = METRO.source;
