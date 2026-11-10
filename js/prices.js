// Precios de entrada, gratuidades y Paris Museum Pass.
// profile: { residency: 'non-eea' | 'eea', age: 'adult' | 'young' (18-25) | 'minor' (<18) }

export const PROFILE_DEFAULT = { residency: 'non-eea', age: 'adult' };

// Paris Museum Pass (precios 2026 según Visit Paris Region; confírmalos en parismuseumpass.fr).
export const MUSEUM_PASS = [{ days: 2, price: 85 }, { days: 4, price: 105 }, { days: 6, price: 125 }];

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const euro = (n) => (n == null ? '' : `€${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')}`);

function ymd(date) { return date.split('-').map(Number); }
function weekday(date) { const [y, m, d] = ymd(date); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }

// ¿Se aplica esta regla de gratuidad en esta fecha? Devuelve { label, from } o null.
export function freeRuleOn(rule, date) {
  const [, m, d] = ymd(date);
  const month = m - 1;
  const first = d <= 7;
  const dw = weekday(date);
  if (rule.months && !rule.months.includes(month)) return null;
  if (rule.exceptMonths && rule.exceptMonths.includes(month)) return null;
  switch (rule.type) {
    case 'firstSunday': return first && dw === 0 ? { label: 'primer domingo del mes' } : null;
    case 'firstFridayEvening': return first && dw === 5 ? { label: 'primer viernes del mes por la noche', from: rule.from } : null;
    case 'firstSaturdayEvening': return first && dw === 6 ? { label: 'primer sábado del mes por la tarde', from: rule.from } : null;
    case 'date': return `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` === rule.md ? { label: rule.label || 'día festivo' } : null;
    default: return null;
  }
}

export function freeOnDate(place, date) {
  for (const r of place.price?.freeRules || []) {
    const hit = freeRuleOn(r, date);
    if (hit) return { ...hit, needsBooking: !!r.booking };
  }
  return null;
}

// Texto corto de la regla, para mostrar en la ficha.
export function freeRuleText(rule) {
  const ms = rule.months ? ` (${rule.months.map((x) => MONTHS_ES[x]).join(', ')})` : '';
  const ex = rule.exceptMonths ? ` (excepto ${rule.exceptMonths.map((x) => MONTHS_ES[x]).join(' y ')})` : '';
  const bk = rule.booking ? ', con reserva' : '';
  switch (rule.type) {
    case 'firstSunday': return `1er domingo del mes${ms}${bk}`;
    case 'firstFridayEvening': return `1er viernes del mes desde las ${fmtMin(rule.from)}${ex}${bk}`;
    case 'firstSaturdayEvening': return `1er sábado del mes desde las ${fmtMin(rule.from)}${bk}`;
    case 'date': return rule.label || rule.md;
    default: return '';
  }
}

const FREE_FOR_TEXT = { u18: 'menores de 18', eea26: 'residentes UE/EEE de 18 a 25', u26: 'menores de 26', u4: 'menores de 4 años', u8: 'menores de 8 años' };
export const freeForText = (codes = []) => codes.map((c) => FREE_FOR_TEXT[c] || c).join('; ');

function seasonal(price, month) {
  const s = (price.seasons || []).find((x) => x.months.includes(month));
  return s ? { ...price, ...s } : price;
}

// Precio normal (sin gratuidades por fecha) para el perfil del viajero.
export function basePrice(place, date, profile = PROFILE_DEFAULT) {
  const pr = place.price;
  if (!pr) return { known: false };
  if (pr.free) return { known: true, free: true, amount: 0, reason: 'Entrada gratuita' };
  if (pr.closed) return { known: true, closed: true };
  if (pr.range) return { known: true, amount: (pr.range[0] + pr.range[1]) / 2, range: pr.range, estimate: true };
  const month = date ? ymd(date)[1] - 1 : new Date().getMonth();
  const p = seasonal(pr, month);
  const ff = p.freeFor || [];
  const young = profile.age === 'minor' || profile.age === 'young';
  if (profile.age === 'minor' && ff.includes('u18')) return { known: true, free: true, amount: 0, regular: p.adult, reason: 'Gratis para menores de 18' };
  if (young && ff.includes('u26')) return { known: true, free: true, amount: 0, regular: p.adult, reason: 'Gratis para menores de 26' };
  if (young && profile.residency === 'eea' && ff.includes('eea26')) return { known: true, free: true, amount: 0, regular: p.adult, reason: 'Gratis para residentes UE de 18 a 25' };
  const amount = profile.residency === 'eea' ? (p.eea ?? p.adult) : p.adult;
  return { known: amount != null, amount, approx: !!p.approx, regular: amount };
}

// Costo de una visita concreta (fecha y hora de entrada).
export function visitCost(place, date, startMin, profile = PROFILE_DEFAULT) {
  const base = basePrice(place, date, profile);
  if (!base.known || base.free || base.closed) return base;
  const f = freeOnDate(place, date);
  if (f && (f.from == null || startMin >= f.from)) {
    return { ...base, amount: 0, free: true, freeToday: true, saved: base.amount, reason: `Gratis hoy: ${f.label}${f.needsBooking ? ' (reserva tu franja)' : ''}` };
  }
  return base;
}

// ¿Conviene el Paris Museum Pass? visits: [{ date, place, cost }] del plan.
export function museumPassAdvice(visits, dates) {
  const covered = visits.filter((v) => v.place.price?.pass && v.cost?.known && !v.cost.free && v.cost.amount > 0);
  if (!covered.length) return null;
  let best = null;
  for (const opt of MUSEUM_PASS) {
    for (let i = 0; i < dates.length; i++) {
      const win = dates.slice(i, i + opt.days);
      const inWin = covered.filter((v) => win.includes(v.date));
      const sum = inWin.reduce((a, v) => a + v.cost.amount, 0);
      const saving = sum - opt.price;
      if (!best || saving > best.saving) best = { ...opt, from: win[0], to: win[win.length - 1], sum, saving, places: inWin.map((v) => v.place.name) };
    }
  }
  return best;
}

// Estimación para restaurantes y cafés según el tipo de OpenStreetMap (por persona).
export const FOOD_ESTIMATE = {
  cafe: [5, 15], restaurant: [25, 50], fast_food: [10, 16], bar: [8, 20], pub: [8, 20],
  ice_cream: [4, 8], bakery: [3, 10], biergarten: [10, 25],
};
