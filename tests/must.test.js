import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../js/data.js';
import { planTrip } from '../js/planner.js';

const pick = (id, pr = 2) => ({ ...PLACES.find((p) => p.id === id), priority: pr });
const base = { arrivalBuffer: 90, departureBuffer: 180, dayStart: '09:00', dayEnd: '22:00', mode: 'mixto', lunch: true, hotel: { lat: 48.8846, lng: 2.3197, name: 'Hotel' } };
const visited = (plan) => plan.days.flatMap((d) => d.items).filter((i) => i.type === 'visit').map((i) => i.place.id);

test('los imprescindibles siempre entran, quitando lo de menor prioridad', () => {
  // Viaje corto y muy lleno: antes la Torre Eiffel (prioridad normal) se quedaba fuera.
  const ids = ['louvre', 'notredame', 'sacrecoeur', 'montmartre', 'arc', 'champs', 'marais', 'latino', 'shakespeare'];
  const trip = { ...base, arrival: '2026-11-20T08:00', departure: '2026-11-21T21:00' };
  const plan = planTrip([...ids.map((id) => pick(id, 1)), pick('eiffel', 3)], trip);
  assert.ok(visited(plan).includes('eiffel'), 'la Torre Eiffel imprescindible está en el plan');
  for (const u of plan.unscheduled) assert.notEqual(u.place.priority, 3);
});

test('si hay que quitar algo, se quita primero lo de "si da tiempo"', () => {
  const trip = { ...base, arrival: '2026-11-20T08:00', departure: '2026-11-20T23:00', departureBuffer: 0 };
  const plan = planTrip([pick('louvre', 3), pick('orsay', 3), pick('eiffel', 3), pick('arc', 1), pick('champs', 1), pick('trocadero', 2)], trip);
  const v = visited(plan);
  for (const id of ['louvre', 'orsay', 'eiffel']) assert.ok(v.includes(id), `${id} imprescindible`);
  const out = plan.unscheduled.map((u) => u.place.id);
  if (out.includes('trocadero')) assert.ok(out.includes('arc') || out.includes('champs'), 'antes de quitar "me gustaría" se quitan los "si da tiempo"');
});

test('un imprescindible imposible explica por qué', () => {
  const trip = { ...base, arrival: '2026-11-20T08:00', departure: '2026-11-20T15:00', departureBuffer: 0, dayStart: '12:00' };
  const plan = planTrip([pick('versailles', 3)], trip);
  const u = plan.unscheduled.find((x) => x.place.id === 'versailles');
  assert.ok(u);
  assert.match(u.reason, /Imprescindible/);
});
