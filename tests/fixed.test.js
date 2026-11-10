import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../js/data.js';
import { planTrip, rankNow, PARIS } from '../js/planner.js';

const pick = (id, extra = {}) => ({ ...PLACES.find((p) => p.id === id), priority: 2, ...extra });
const trip = {
  arrival: '2026-12-02T08:00', departure: '2026-12-04T23:00', arrivalBuffer: 0, departureBuffer: 0,
  dayStart: '09:00', dayEnd: '22:00', mode: 'mixto', lunch: true, hotel: { ...PARIS, name: 'Hotel' },
};
const resto = (date, h, m = 0) => ({ id: 'resto', name: 'Le Jules Verne', category: 'comida', lat: 48.8583, lng: 2.2944, duration: 90,
  popularity: 0.5, maxWait: 10, priority: 2, hours: Array(7).fill([12 * 60, 23 * 60]), fixed: { date, start: h * 60 + m } });

test('la reserva se respeta a la hora exacta y el resto se ordena alrededor', () => {
  const places = ['louvre', 'orsay', 'notredame', 'saintechapelle', 'sacrecoeur', 'montmartre', 'eiffel', 'arc'].map((id) => pick(id));
  places.push(resto('2026-12-02', 13, 0));
  const plan = planTrip(places, trip);
  const d = plan.days.find((x) => x.date === '2026-12-02');
  const r = d.items.find((i) => i.place?.id === 'resto');
  assert.ok(r, 'reserva programada');
  assert.equal(r.start, 13 * 60);
  assert.ok(r.fixed);
  assert.deepEqual(r.warnings, []);
  // nada se solapa y se llega a tiempo
  for (let k = 1; k < d.items.length; k++) assert.ok(d.items[k].start >= d.items[k - 1].end - 0.001, `solape en ${k}`);
  const before = d.items[d.items.indexOf(r) - 1];
  assert.ok(!before || before.end + r.travel.min <= 13 * 60 + 0.001, 'llega a tiempo a la reserva');
  // el restaurante a la hora de comer reemplaza el almuerzo genérico
  assert.ok(!d.items.some((i) => i.type === 'lunch'));
  // la reserva no aparece en otros días
  assert.equal(plan.days.flatMap((x) => x.items).filter((i) => i.place?.id === 'resto').length, 1);
});

test('cena reservada después del fin del día igual se incluye', () => {
  const plan = planTrip([pick('louvre'), resto('2026-12-03', 22, 30)], trip);
  const d = plan.days.find((x) => x.date === '2026-12-03');
  const r = d.items.find((i) => i.place?.id === 'resto');
  assert.equal(r.start, 22 * 60 + 30);
});

test('avisa si la reserva es en un horario cerrado y si la fecha está fuera del viaje', () => {
  const plan = planTrip([resto('2026-12-02', 9, 0)], trip);
  const r = plan.days[0].items.find((i) => i.place?.id === 'resto');
  assert.ok(r.warnings.some((w) => /cerrado/.test(w)));
  const out = planTrip([resto('2027-01-10', 20, 0)], trip);
  assert.match(out.unscheduled[0].reason, /fuera|no está dentro/);
});

test('reserva ya pasada al replanificar', () => {
  const plan = planTrip([resto('2026-12-02', 13, 0)], trip, { now: { date: '2026-12-02', min: 16 * 60 } });
  assert.match(plan.unscheduled[0].reason, /ya pasó/);
});

test('"Ahora" no recomienda algo que te haga llegar tarde a la reserva', () => {
  const r = resto('2026-12-09', 13, 0);
  const ranked = rankNow([pick('louvre')], { pos: PARIS, date: '2026-12-09', min: 11 * 60, nextFixed: r });
  assert.equal(ranked[0].ok, false);
  assert.match(ranked[0].reason, /tarde a tu reserva/);
});

test('el tiempo libre antes de la reserva llega hasta la hora de salir', () => {
  const plan = planTrip([pick('eiffel'), resto('2026-12-03', 13, 30)], trip);
  const d = plan.days.find((x) => x.date === '2026-12-03');
  const r = d.items.find((i) => i.fixed);
  const prev = d.items[d.items.indexOf(r) - 1];
  assert.equal(prev.end + r.travel.min, r.arrive);
  assert.ok(r.start - r.arrive <= 5);
});

test('una reserva a las 8:00 adelanta el inicio del día (aunque empiece a las 9:00)', () => {
  const hotel = { lat: 48.8846, lng: 2.3197, name: 'B&B Hotel Paris 17 Batignolles' };
  const carette = { ...resto('2026-12-03', 8, 0), name: 'Carette', lat: 48.8635, lng: 2.2870, hours: Array(7).fill([7 * 60 + 30, 23 * 60]) };
  const plan = planTrip([carette, pick('louvre')], { ...trip, hotel });
  const d = plan.days.find((x) => x.date === '2026-12-03');
  const r = d.items.find((i) => i.fixed);
  assert.equal(r.start, 8 * 60);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.arrive <= 8 * 60, `llega a las ${r.arrive / 60}`);
  assert.ok(d.start < 8 * 60);
  // el día de llegada no se puede adelantar más allá de la llegada: ahí sí avisa
  const late = planTrip([{ ...carette, fixed: { date: '2026-12-02', start: 8 * 60 } }], { ...trip, arrival: '2026-12-02T08:00', arrivalBuffer: 90, hotel });
  const r2 = late.days[0].items.find((i) => i.fixed);
  assert.ok(r2.warnings.some((w) => /tarde/.test(w)));
});
