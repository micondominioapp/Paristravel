import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTrip, decodeTrip, shareUrl, codeFromHash } from '../js/share.js';

const state = {
  trip: { arrival: '2026-12-01T10:00', departure: '2026-12-05T18:00', hotel: { lat: 48.87, lng: 2.33, name: 'Hôtel Été' }, mode: 'mixto', lunch: true },
  selected: { louvre: { priority: 3 }, eiffel: { priority: 3, slot: 'sunset' }, 'custom-1': { priority: 2 } },
  custom: [{ id: 'custom-1', name: 'Café de Flore', category: 'comida', lat: 48.85, lng: 2.33, duration: 60, hours: Array(7).fill([450, 1530]) }],
  visited: { louvre: true },
  reports: { eiffel: { level: 0.9, at: 1 } },
  replan: { date: '2026-12-02', min: 600 },
};

test('el enlace lleva el viaje completo y se puede leer', async () => {
  const code = await encodeTrip(state);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/);
  const url = shareUrl(code, 'https://ejemplo.github.io/Paristravel/?x=1#otro');
  assert.equal(codeFromHash(new URL(url).hash), code);
  const back = await decodeTrip(code);
  assert.deepEqual(back.trip, state.trip);
  assert.deepEqual(back.selected, state.selected);
  assert.deepEqual(back.custom, state.custom);
  assert.deepEqual(back.visited, state.visited);
  assert.equal(back.reports, undefined); // lo local no se comparte
  assert.ok(url.length < 2000, `enlace de ${url.length} caracteres`);
});

test('un enlace roto da error', async () => {
  await assert.rejects(decodeTrip('zAAAA'));
  await assert.rejects(decodeTrip('xabc'));
});
