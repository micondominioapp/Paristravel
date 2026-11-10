import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../js/data.js';
import { planTrip, clusterZones, sunset, haversineKm } from '../js/planner.js';

const pick = (id, pr = 2) => ({ ...PLACES.find((p) => p.id === id), priority: pr });
const hotel = { lat: 48.8846, lng: 2.3197, name: 'Hotel Batignolles' };
const base = { arrivalBuffer: 90, departureBuffer: 180, dayStart: '09:00', dayEnd: '22:00', mode: 'mixto', lunch: true, hotel };
const dayOf = (plan) => Object.fromEntries(plan.days.flatMap((d) => d.items.filter((i) => i.type === 'visit').map((i) => [i.place.id, d.date])));

test('zonas a pie: agrupa lo que está cerca', () => {
  const ids = ['eiffel', 'trocadero', 'sacrecoeur', 'montmartre', 'moulinrouge', 'garnier', 'lafayette', 'starbucksopera', 'notredame', 'saintechapelle', 'versailles'];
  const zones = clusterZones(ids.map((id) => pick(id))).map((z) => z.map((p) => p.id).sort().join('+'));
  assert.ok(zones.includes('eiffel+trocadero'));
  assert.ok(zones.includes('montmartre+moulinrouge+sacrecoeur'));
  assert.ok(zones.includes('garnier+lafayette+starbucksopera'));
  assert.ok(zones.includes('notredame+saintechapelle'));
  assert.ok(zones.includes('versailles'));
  for (const z of clusterZones(ids.map((id) => pick(id)))) {
    for (const a of z) for (const b of z) assert.ok(haversineKm(a, b) <= 1.5);
  }
});

test('tu ejemplo: lo cercano queda el mismo día y nada se queda fuera', () => {
  const ids = ['sacrecoeur', 'montmartre', 'moulinrouge', 'lafayette', 'garnier', 'starbucksopera', 'eiffel', 'louvre', 'orsay', 'notredame', 'saintechapelle', 'trocadero', 'arc'];
  const places = ids.map((id) => pick(id, ['eiffel', 'louvre', 'notredame'].includes(id) ? 3 : 2));
  const plan = planTrip(places, { ...base, arrival: '2026-11-12T09:00', departure: '2026-11-14T20:00' });
  assert.equal(plan.unscheduled.length, 0);
  const d = dayOf(plan);
  assert.equal(d.notredame, d.saintechapelle);
  assert.equal(d.sacrecoeur, d.montmartre);
  assert.equal(d.lafayette, d.garnier);
  assert.equal(d.garnier, d.starbucksopera);
  assert.equal(d.eiffel, d.trocadero);
});

test('viaje clásico de 4 días: no deja fuera nada y junta Sacré-Cœur con Montmartre', () => {
  const ids = ['eiffel', 'louvre', 'orsay', 'notredame', 'saintechapelle', 'arc', 'sacrecoeur', 'montmartre', 'orangerie', 'pantheon', 'luxembourg', 'garnier', 'champs', 'marais', 'trocadero', 'versailles', 'picasso', 'tuileries'];
  const plan = planTrip(ids.map((id) => pick(id, ['eiffel', 'louvre', 'versailles'].includes(id) ? 3 : 2)), { ...base, arrival: '2026-12-03T10:00', departure: '2026-12-07T18:00' });
  assert.equal(plan.unscheduled.length, 0);
  const d = dayOf(plan);
  assert.equal(d.sacrecoeur, d.montmartre);
  assert.equal(d.eiffel, d.trocadero);
  // Versalles ocupa su propio día (está a 17 km)
  assert.deepEqual(plan.days.find((x) => x.date === d.versailles).items.filter((i) => i.type === 'visit').map((i) => i.place.id), ['versailles']);
});

test('la Torre Eiffel va al atardecer si el día lo permite', () => {
  const plan = planTrip([pick('eiffel'), pick('louvre'), pick('trocadero')], { ...base, arrival: '2026-11-12T09:00', departure: '2026-11-12T23:30', departureBuffer: 0 });
  assert.equal(plan.unscheduled.length, 0);
  const e = plan.days[0].items.find((i) => i.place?.id === 'eiffel');
  const ss = sunset('2026-11-12');
  assert.ok(e.start >= ss - 90 && e.start <= ss + 30, `Eiffel a las ${e.start / 60}`);
});

test('el planificador es rápido', () => {
  const ids = PLACES.filter((p) => !p.price?.closed).map((p) => p.id);
  const t0 = performance.now();
  planTrip(ids.map((id) => pick(id)), { ...base, arrival: '2026-12-01T09:00', departure: '2026-12-08T20:00' });
  assert.ok(performance.now() - t0 < 2500);
});
