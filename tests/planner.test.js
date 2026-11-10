import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../js/data.js';
import { planTrip, rankNow, crowdAt, sunset, dow, travel, evaluate, parisOffset, PARIS } from '../js/planner.js';

const pick = (ids, priority = 2) => ids.map((id) => ({ ...PLACES.find((p) => p.id === id), priority }));
const trip = {
  arrival: '2026-12-01T10:00', departure: '2026-12-04T18:00', arrivalBuffer: 90, departureBuffer: 180,
  dayStart: '09:00', dayEnd: '22:00', mode: 'mixto', lunch: true, hotel: { ...PARIS, name: 'Hotel' },
};

test('fechas y zona horaria de París', () => {
  assert.equal(dow('2026-12-01'), 2); // martes
  assert.equal(parisOffset('2026-12-01'), 60);
  assert.equal(parisOffset('2026-07-01'), 120);
  const s = sunset('2026-12-01');
  assert.ok(s > 16 * 60 + 40 && s < 17 * 60 + 15, `atardecer diciembre ${s}`);
  const s2 = sunset('2026-06-21');
  assert.ok(s2 > 21 * 60 + 40 && s2 < 22 * 60 + 10, `atardecer junio ${s2}`);
});

test('el Louvre nunca se programa en martes (cerrado)', () => {
  const plan = planTrip(pick(['louvre', 'orsay', 'eiffel', 'notredame']), trip);
  for (const d of plan.days) {
    for (const it of d.items) {
      if (it.type !== 'visit') continue;
      const h = it.place.hours[d.dow];
      assert.ok(h, `${it.place.id} programado en día cerrado`);
      assert.ok(it.start >= h[0] && it.end <= h[1], `${it.place.id} fuera de horario`);
      assert.ok(it.start >= d.start && it.end <= d.end, `${it.place.id} fuera de la jornada`);
    }
  }
  const louvreDay = plan.days.find((d) => d.items.some((i) => i.place?.id === 'louvre'));
  assert.ok(louvreDay && louvreDay.dow !== 2);
});

test('respeta llegada y salida', () => {
  const plan = planTrip(pick(PLACES.slice(0, 15).map((p) => p.id)), trip);
  assert.equal(plan.days[0].start, 10 * 60 + 90);
  assert.equal(plan.days.at(-1).end, 15 * 60);
  for (const d of plan.days) {
    for (let i = 1; i < d.items.length; i++) assert.ok(d.items[i].start >= d.items[i - 1].end - 0.001);
  }
});

test('lugares imposibles quedan como no programados con motivo', () => {
  const oneDay = { ...trip, arrival: '2026-12-07T08:00', departure: '2026-12-07T23:00' }; // lunes
  const plan = planTrip(pick(['versailles', 'orsay', 'rodin']), oneDay);
  const reasons = Object.fromEntries(plan.unscheduled.map((u) => [u.place.id, u.reason]));
  assert.match(reasons.versailles, /Cerrado/);
  assert.match(reasons.orsay, /Cerrado/);
});

test('el aforo cambia según hora y día', () => {
  const louvre = PLACES.find((p) => p.id === 'louvre');
  assert.ok(crowdAt(louvre, '2026-12-07', 14 * 60) > crowdAt(louvre, '2026-12-07', 9 * 60));
  // lunes más lleno que miércoles (Orsay cerrado los lunes)
  assert.ok(crowdAt(louvre, '2026-12-07', 12 * 60) > crowdAt(louvre, '2026-12-09', 12 * 60));
});

test('replanificar desde ahora excluye días pasados y visitados', () => {
  const places = pick(['louvre', 'eiffel', 'notredame', 'sacrecoeur']);
  const pos = { lat: 48.8867, lng: 2.3431, name: 'Mi ubicación' };
  const plan = planTrip(places, trip, { visited: { notredame: true }, now: { date: '2026-12-03', min: 15 * 60, pos } });
  assert.equal(plan.days[0].date, '2026-12-03');
  assert.equal(plan.days[0].start, 15 * 60);
  const ids = plan.days.flatMap((d) => d.items).filter((i) => i.type === 'visit').map((i) => i.place.id);
  assert.ok(!ids.includes('notredame'));
  const first = plan.days[0].items.find((i) => i.type === 'visit');
  if (first) assert.equal(first.from, pos);
});

test('recomendación ahora prefiere lo cercano y abierto', () => {
  const pos = { lat: 48.8865, lng: 2.3408 }; // Montmartre
  const ranked = rankNow(pick(['sacrecoeur', 'versailles', 'orsay']), { pos, date: '2026-12-07', min: 10 * 60 });
  assert.equal(ranked[0].place.id, 'sacrecoeur');
  const orsay = ranked.find((r) => r.place.id === 'orsay');
  assert.equal(orsay.ok, false); // lunes cerrado
});

test('reporte de aforo reemplaza la estimación', () => {
  const pos = PARIS;
  const [r] = rankNow(pick(['louvre']), { pos, date: '2026-12-09', min: 11 * 60, reports: { louvre: { level: 0.9, at: Date.now() } } });
  assert.equal(r.ev.crowd, 0.9);
});

test('tiempos de traslado razonables', () => {
  const e = PLACES.find((p) => p.id === 'eiffel');
  const v = PLACES.find((p) => p.id === 'versailles');
  assert.equal(travel(PARIS, PARIS).min, 0);
  const t = travel(e, v, 'mixto');
  assert.equal(t.how, 'metro');
  assert.ok(t.min > 30 && t.min < 80);
  const ev = evaluate(e, { pos: PARIS, date: '2026-12-09', t: 23 * 60, mode: 'mixto' });
  assert.equal(ev.ok, false);
});
