import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../js/data.js';
import { basePrice, visitCost, freeOnDate, museumPassAdvice } from '../js/prices.js';
import { planTrip, crowdAt, PARIS } from '../js/planner.js';

const P = (id) => ({ ...PLACES.find((p) => p.id === id), priority: 2 });
const nonEU = { residency: 'non-eea', age: 'adult' };
const eu = { residency: 'eea', age: 'adult' };

test('precio según residencia, edad y temporada', () => {
  assert.equal(basePrice(P('louvre'), '2026-12-02', nonEU).amount, 32);
  assert.equal(basePrice(P('louvre'), '2026-12-02', eu).amount, 22);
  assert.equal(basePrice(P('louvre'), '2026-12-02', { residency: 'non-eea', age: 'minor' }).free, true);
  assert.equal(basePrice(P('louvre'), '2026-12-02', { residency: 'non-eea', age: 'young' }).amount, 32); // jóvenes de fuera de la UE pagan
  assert.equal(basePrice(P('louvre'), '2026-12-02', { residency: 'eea', age: 'young' }).free, true);
  assert.equal(basePrice(P('arc'), '2026-12-02', nonEU).amount, 16);
  assert.equal(basePrice(P('arc'), '2026-07-02', nonEU).amount, 21);
  assert.equal(basePrice(P('versailles'), '2026-12-02', nonEU).amount, 25);
  assert.equal(basePrice(P('versailles'), '2026-05-02', eu).amount, 32);
  assert.equal(basePrice(P('notredame'), '2026-12-02', nonEU).free, true);
  assert.deepEqual(basePrice(P('starbucksopera'), '2026-12-02', nonEU).range, [5, 10]);
});

test('días gratis: primer domingo, primer viernes por la noche, temporadas', () => {
  assert.ok(freeOnDate(P('orsay'), '2026-12-06')); // domingo 6/12
  assert.equal(freeOnDate(P('orsay'), '2026-12-13'), null);
  assert.ok(freeOnDate(P('arc'), '2026-12-06'));
  assert.equal(freeOnDate(P('arc'), '2026-06-07'), null); // junio no
  assert.equal(visitCost(P('louvre'), '2026-12-04', 17 * 60, nonEU).amount, 32); // viernes 4/12 antes de las 18
  const night = visitCost(P('louvre'), '2026-12-04', 18 * 60 + 30, nonEU);
  assert.equal(night.amount, 0);
  assert.equal(night.saved, 32);
  assert.equal(freeOnDate(P('louvre'), '2026-08-07'), null); // agosto no
});

test('los días gratis se llenan más', () => {
  const o = P('orsay');
  assert.ok(crowdAt(o, '2026-12-06', 11 * 60) > crowdAt(o, '2026-12-13', 11 * 60));
});

test('el plan lleva el costo de cada visita y aprovecha el día gratis', () => {
  const trip = { arrival: '2026-12-04T08:00', departure: '2026-12-07T22:00', arrivalBuffer: 0, departureBuffer: 0, dayStart: '09:00', dayEnd: '22:00', lunch: false, hotel: PARIS };
  const plan = planTrip([P('orsay'), P('montparnasse')], trip);
  const v = plan.days.flatMap((d) => d.items.map((i) => ({ ...i, date: d.date }))).find((i) => i.place?.id === 'orsay');
  assert.equal(v.date, '2026-12-06'); // va el domingo gratis
  assert.equal(v.cost.amount, 0);
  assert.match(plan.unscheduled.find((u) => u.place.id === 'montparnasse').reason, /cerr/i);
});

test('Museum Pass: recomienda cuando ahorra', () => {
  const dates = ['2026-12-01', '2026-12-02', '2026-12-03'];
  const mk = (id, date) => ({ date, place: P(id), cost: visitCost(P(id), date, 600, nonEU) });
  const visits = [mk('louvre', '2026-12-01'), mk('orsay', '2026-12-01'), mk('versailles', '2026-12-02'), mk('saintechapelle', '2026-12-02'), mk('arc', '2026-12-02')];
  const a = museumPassAdvice(visits, dates);
  assert.equal(a.days, 2);
  assert.equal(a.sum, 32 + 16 + 25 + 22 + 16);
  assert.equal(a.saving, 111 - 85);
  assert.equal(museumPassAdvice([mk('orsay', '2026-12-01')], dates).saving < 0, true);
});

test('Louvre el primer viernes: espera a las 18:00 gratis; si no cabe, va en día normal', () => {
  const trip = { arrival: '2026-12-03T08:00', departure: '2026-12-05T22:00', arrivalBuffer: 0, departureBuffer: 0, dayStart: '09:00', dayEnd: '22:00', lunch: false, hotel: PARIS };
  const plan = planTrip([{ ...P('louvre'), duration: 150 }], trip);
  const v = plan.days.flatMap((d) => d.items.map((i) => ({ ...i, date: d.date }))).find((i) => i.place?.id === 'louvre');
  assert.equal(v.date, '2026-12-04');
  assert.ok(v.start >= 18 * 60);
  assert.equal(v.cost.amount, 0);
  // el viernes termina el día a las 19:00: no cabe de noche -> se programa igual otro día pagando
  const short = planTrip([{ ...P('louvre'), duration: 150 }], { ...trip, dayEnd: '19:00' });
  assert.equal(short.unscheduled.length, 0);
  const v2 = short.days.flatMap((d) => d.items).find((i) => i.place?.id === 'louvre');
  assert.equal(v2.cost.amount, 32);
});
