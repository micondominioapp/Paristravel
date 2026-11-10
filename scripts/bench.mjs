// Compara la calidad de los planes: minutos de traslado, lugares fuera y agrupación por zonas.
// Uso: node scripts/bench.mjs
import { PLACES } from '../js/data.js';
import { planTrip, haversineKm } from '../js/planner.js';

const pick = (id, pr = 2) => ({ ...PLACES.find((p) => p.id === id), priority: pr });
const moulin = { id: 'moulin', name: 'Moulin Rouge', category: 'monumento', lat: 48.8841, lng: 2.3322, duration: 30, popularity: 0.6, maxWait: 0, priority: 2, hours: Array(7).fill([0, 1440]), price: { free: true } };
const hotel = { lat: 48.8846, lng: 2.3197, name: 'Hotel Batignolles' };
const base = { arrivalBuffer: 90, departureBuffer: 180, dayStart: '09:00', dayEnd: '22:00', mode: 'mixto', lunch: true, hotel };

const scenarios = {
  'Tu ejemplo (3 días, 13 lugares)': { trip: { ...base, arrival: '2026-11-12T09:00', departure: '2026-11-14T20:00' },
    places: [pick('sacrecoeur'), pick('montmartre'), moulin, pick('lafayette'), pick('garnier'), pick('starbucksopera'), pick('eiffel', 3), pick('louvre', 3), pick('orsay'), pick('notredame', 3), pick('saintechapelle'), pick('trocadero'), pick('arc')] },
  'Clásico (4 días, 18 lugares)': { trip: { ...base, arrival: '2026-12-03T10:00', departure: '2026-12-07T18:00' },
    places: ['eiffel', 'louvre', 'orsay', 'notredame', 'saintechapelle', 'arc', 'sacrecoeur', 'montmartre', 'orangerie', 'pantheon', 'luxembourg', 'garnier', 'champs', 'marais', 'trocadero', 'versailles', 'picasso', 'tuileries'].map((id) => pick(id, ['eiffel', 'louvre', 'versailles'].includes(id) ? 3 : 2)) },
  'Corto (2 días, 10 lugares)': { trip: { ...base, arrival: '2026-11-20T08:00', departure: '2026-11-21T21:00' },
    places: ['eiffel', 'louvre', 'notredame', 'sacrecoeur', 'montmartre', 'arc', 'champs', 'marais', 'latino', 'shakespeare'].map((id) => pick(id)) },
};

for (const [name, sc] of Object.entries(scenarios)) {
  const t0 = performance.now();
  const plan = planTrip(sc.places, sc.trip);
  const ms = performance.now() - t0;
  let travelMin = 0; let maxHop = 0; const perDay = [];
  for (const d of plan.days) {
    const v = d.items.filter((i) => i.type === 'visit');
    v.forEach((i) => { travelMin += i.travel.min; maxHop = Math.max(maxHop, i.travel.min); });
    // dispersión: distancia media de los lugares del día a su centro
    const c = v.length ? { lat: v.reduce((a, i) => a + i.place.lat, 0) / v.length, lng: v.reduce((a, i) => a + i.place.lng, 0) / v.length } : null;
    const spread = c ? v.reduce((a, i) => a + haversineKm(c, i.place), 0) / v.length : 0;
    perDay.push(`${d.date.slice(5)}: ${v.map((i) => i.place.id).join(' → ') || '—'} (dispersión ${spread.toFixed(1)} km)`);
  }
  // Pares de lugares a menos de 1 km que quedaron en días distintos (lo que querías evitar).
  const dayOf = {};
  plan.days.forEach((d) => d.items.forEach((i) => { if (i.type === 'visit') dayOf[i.place.id] = d.date; }));
  const ids = Object.keys(dayOf);
  const byId = Object.fromEntries(sc.places.map((p) => [p.id, p]));
  const split = [];
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    if (haversineKm(byId[ids[a]], byId[ids[b]]) < 1 && dayOf[ids[a]] !== dayOf[ids[b]]) split.push(`${ids[a]}/${ids[b]}`);
  }
  console.log(`\n## ${name}  [${ms.toFixed(0)} ms]`);
  console.log(`cercanos (<1 km) separados en días distintos: ${split.length} ${split.join(', ')}`);
  console.log(`traslado total ${travelMin} min · traslado más largo ${maxHop} min · fuera: ${plan.unscheduled.map((u) => u.place.id).join(', ') || 'ninguno'}`);
  perDay.forEach((l) => console.log('  ', l));
}
