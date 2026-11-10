// Búsqueda automática de lugares en OpenStreetMap: ubicación, tipo, horario y popularidad.
import { hours } from './data.js';
import { tokens } from './match.js';

const DAYS = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mo..Su en el orden de OSM

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

function expandDays(spec) {
  const out = new Set();
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-');
    if (!(a in DAYS) || (b && !(b in DAYS))) return null;
    if (!b) { out.add(DAYS[a]); continue; }
    let i = ORDER.indexOf(DAYS[a]);
    const end = ORDER.indexOf(DAYS[b]);
    for (let n = 0; n < 7; n++) { out.add(ORDER[i]); if (i === end) break; i = (i + 1) % 7; }
  }
  return [...out];
}

function monthMatches(spec, month) {
  return spec.split(',').some((part) => {
    const [a, b] = part.split('-').map((x) => MONTHS[x.slice(0, 3)]);
    if (a === undefined) return false;
    if (b === undefined) return month === a;
    return a <= b ? month >= a && month <= b : month >= a || month <= b;
  });
}

// Convierte el formato opening_hours de OSM ("Mo-Fr 09:00-18:00; Sa 10:00-17:00; Su off")
// en un horario semanal [ [abre, cierra] | null ] x 7. month: 0-11 para reglas por temporada.
export function parseOpeningHours(str, month = new Date().getMonth()) {
  if (!str) return null;
  const s = str.trim();
  if (s === '24/7') return hours('00:00', '24:00');
  const week = Array(7).fill(undefined);
  let understood = 0;
  for (let rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
    if (/^PH|^SH/.test(rule) || /"/.test(rule)) continue; // feriados / comentarios
    const mm = rule.match(/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[A-Za-z0-9 ,-]*?)\s*:?\s+(?=[A-Z][a-z]|\d|off|closed)/);
    if (mm) {
      if (!monthMatches(mm[1].replace(/\s/g, ''), month)) continue;
      rule = rule.slice(mm[0].length).trim();
    }
    rule = rule.replace(/,\s*PH(\s+off)?/g, '');
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*)?\s*(.*)$/);
    const days = m[1] ? expandDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    const rest = m[2].trim();
    if (!days) continue;
    if (/^(off|closed)$/i.test(rest)) { days.forEach((d) => { week[d] = null; }); understood++; continue; }
    const ranges = [...rest.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?/g)];
    if (!ranges.length) continue;
    let open = Infinity; let close = 0;
    for (const [, a, b] of ranges) {
      const o = toMin(a); let c = toMin(b);
      if (c <= o) c += 24 * 60; // pasa de medianoche
      open = Math.min(open, o); close = Math.max(close, c);
    }
    days.forEach((d) => { week[d] = [open, close]; });
    understood++;
  }
  if (!understood) return null;
  // Días no mencionados: en OSM significa cerrado si se dieron días concretos.
  return week.map((h) => (h === undefined ? null : h));
}

// Tipo de lugar según las etiquetas de OSM.
export function categoryFromOsm(cls, type) {
  if (cls === 'tourism' && ['museum', 'gallery'].includes(type)) return 'museo';
  if (cls === 'tourism' && type === 'viewpoint') return 'mirador';
  if (cls === 'amenity' && ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'biergarten'].includes(type)) return 'comida';
  if (cls === 'amenity' && type === 'place_of_worship') return 'iglesia';
  if (cls === 'building' && ['church', 'cathedral', 'chapel'].includes(type)) return 'iglesia';
  if (cls === 'leisure' && ['park', 'garden'].includes(type)) return 'parque';
  if (cls === 'landuse' && type === 'cemetery') return 'parque';
  if (cls === 'amenity' && type === 'grave_yard') return 'parque';
  if (cls === 'shop' || (cls === 'amenity' && type === 'marketplace')) return 'compras';
  if (cls === 'place' || cls === 'boundary') return 'barrio';
  if (cls === 'highway' || cls === 'waterway' || (cls === 'man_made' && type === 'bridge')) return 'paseo';
  if (cls === 'amenity' && ['theatre', 'cinema', 'arts_centre', 'nightclub'].includes(type)) return 'monumento';
  return 'monumento';
}

// Valores típicos cuando OSM no tiene el dato.
export const CATEGORY_DEFAULTS = {
  museo: { duration: 90, maxWait: 25, hours: () => hours('10:00', '18:00', { closed: [1] }) },
  mirador: { duration: 45, maxWait: 15, hours: () => hours('10:00', '22:00') },
  monumento: { duration: 60, maxWait: 20, hours: () => hours('10:00', '18:00') },
  iglesia: { duration: 40, maxWait: 5, hours: () => hours('09:00', '19:00') },
  parque: { duration: 60, maxWait: 0, hours: () => hours('08:00', '20:00') },
  barrio: { duration: 90, maxWait: 0, hours: () => hours('00:00', '24:00') },
  compras: { duration: 45, maxWait: 0, hours: () => hours('10:00', '19:30', { closed: [0] }) },
  paseo: { duration: 45, maxWait: 0, hours: () => hours('00:00', '24:00') },
  comida: { duration: 75, maxWait: 15, hours: () => hours('12:00', '23:00') },
};

// Convierte un resultado de Nominatim en un lugar listo para el planificador.
export function placeFromNominatim(r, month) {
  const cls = r.category ?? r.class;
  const category = categoryFromOsm(cls, r.type);
  const def = CATEGORY_DEFAULTS[category];
  const oh = r.extratags?.opening_hours;
  const parsed = parseOpeningHours(oh, month);
  const importance = Number(r.importance) || 0.2;
  const name = r.namedetails?.['name:es'] || r.name || r.namedetails?.name || r.display_name.split(',')[0];
  const addr = r.address || {};
  const street = addr.road || addr.pedestrian || addr.square || addr.footway || addr.place;
  const short = [street && `${addr.house_number ? `${addr.house_number} ` : ''}${street}`, addr.quarter || addr.neighbourhood].filter(Boolean).join(', ');
  const ex = r.extratags || {};
  return {
    name,
    localName: r.namedetails?.name || null, // nombre original (en francés)
    address: short || r.display_name.split(',').slice(1, 3).join(',').trim(),
    category,
    lat: Number(r.lat),
    lng: Number(r.lon),
    duration: def.duration,
    // La "importancia" de OSM/Wikipedia sirve como indicador de qué tan concurrido es.
    popularity: Math.round(Math.min(1, Math.max(0.25, 0.15 + importance * 1.1)) * 100) / 100,
    maxWait: def.maxWait,
    slot: category === 'comida' ? 'any' : category === 'mirador' ? 'sunset' : 'any',
    hours: parsed || def.hours(),
    hoursSource: parsed ? 'osm' : 'estimado',
    openingHoursRaw: oh || null,
    postcode: addr.postcode || null,
    arrondissement: arrondissement(addr.postcode, [addr.city_district, addr.suburb, addr.borough].filter(Boolean).join(' ')),
    city: addr.city || addr.town || addr.village || null,
    website: ex.website || ex['contact:website'] || null,
    wikipedia: ex.wikipedia || null,
    wikidata: ex.wikidata || null,
    image: ex.image || ex.wikimedia_commons || null,
    osm: `${r.osm_type}/${r.osm_id}`,
  };
}

// Distrito (arrondissement) de París a partir del código postal o del nombre del barrio.
export function arrondissement(postcode, text = '') {
  const pc = String(postcode || '').trim();
  if (pc === '75116') return 16;
  const m = pc.match(/^750(\d{2})$/);
  if (m && +m[1] >= 1 && +m[1] <= 20) return +m[1];
  const t = String(text).match(/(\d{1,2})\s*(?:e|er|ème)\s+arrondissement/i);
  return t ? +t[1] : null;
}

export function districtLabel(n) {
  if (!n) return '';
  return `Distrito ${n} (${n}${n === 1 ? 'er' : 'e'} arrondissement)`;
}

// Nominatim pide máximo 1 consulta por segundo.
let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function nominatim(params) {
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const qs = new URLSearchParams({ format: 'jsonv2', extratags: '1', namedetails: '1', addressdetails: '1', countrycodes: 'fr', ...params });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: { 'Accept-Language': 'es,fr' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const PARIS_BOX = '1.9,49.1,2.7,48.6';
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 73);

// ¿El resultado contiene todas las palabras buscadas (en el nombre o la dirección)?
function fullMatch(q, r) {
  const hay = tokens(`${r.display_name} ${Object.values(r.namedetails || {}).join(' ')}`);
  return tokens(q).every((w) => hay.some((v) => v.startsWith(w)));
}

// Búsqueda inteligente: primero el texto completo; si son varias palabras, prueba también
// "qué" + "dónde" (ej. "starbucks ópera" = un Starbucks cerca de la Ópera), del más cercano al más lejano.
export async function searchPlaces(q, month, onStatus = () => {}) {
  const raw = await nominatim({ q: `${q}, Paris`, limit: '8', viewbox: PARIS_BOX });
  let results = raw.map((r) => placeFromNominatim(r, month));
  const words = q.trim().split(/\s+/);
  const good = raw.filter((r) => fullMatch(q, r)).length;
  if (words.length >= 2 && good < 3) {
    for (let k = words.length - 1; k >= 1 && k >= words.length - 2; k--) {
      const what = words.slice(0, k).join(' ');
      const where = words.slice(k).join(' ');
      onStatus(`Buscando "${what}" cerca de "${where}"…`);
      const [area] = await nominatim({ q: `${where}, Paris`, limit: '1', viewbox: PARIS_BOX });
      if (!area) continue;
      const c = { lat: Number(area.lat), lng: Number(area.lon) };
      const box = [c.lng - 0.014, c.lat + 0.009, c.lng + 0.014, c.lat - 0.009].join(',');
      const near = await nominatim({ q: what, limit: '10', viewbox: box, bounded: '1' });
      if (!near.length) continue;
      const areaName = area.namedetails?.['name:es'] || area.name || where;
      const nearPlaces = near.map((r) => {
        const p = placeFromNominatim(r, month);
        p.near = { name: areaName, meters: Math.round(dist(p, c) * 1000) };
        return p;
      }).sort((x, y) => x.near.meters - y.near.meters);
      results = [...nearPlaces, ...results];
      break;
    }
  }
  if (!results.length && words.length) {
    results = (await nominatim({ q, limit: '6' })).map((r) => placeFromNominatim(r, month));
  }
  return results.filter((f, i) => results.findIndex((g) => g.osm === f.osm) === i);
}
