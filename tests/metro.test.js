import test from 'node:test';
import assert from 'node:assert/strict';
import { route, compare } from '../js/metro.js';
import { PLACES } from '../js/data.js';

const at = (id) => PLACES.find((p) => p.id === id);
const rides = (r) => r.legs.filter((l) => l.type === 'ride');

test('Bastille → Arco del Triunfo: metro 1 directo, dirección La Défense, €2,55', () => {
  const r = route({ lat: 48.8532, lng: 2.3692 }, at('arc'));
  assert.equal(rides(r).length, 1);
  assert.equal(rides(r)[0].line, 'M1');
  assert.ok(rides(r)[0].dir.some((d) => /Défense/.test(d)));
  assert.equal(r.price, 2.55);
});

test('Torre Eiffel → Notre-Dame: RER C hasta Saint-Michel Notre-Dame', () => {
  const r = route(at('eiffel'), at('notredame'));
  assert.equal(rides(r)[0].line, 'RER C');
  assert.match(rides(r).at(-1).to, /Saint-Michel/);
});

test('hasta Orly en metro 14 cuesta el billete aeropuerto (€14)', () => {
  const r = route({ lat: 48.8846, lng: 2.3197 }, { lat: 48.7262, lng: 2.3652 });
  assert.ok(rides(r).some((l) => l.line === 'M14'));
  assert.equal(r.price, 14);
});

test('caminar o metro: Louvre → Orsay caminando; Louvre → Sacré-Cœur en metro', () => {
  assert.equal(compare(at('louvre'), at('orsay')).best, 'walk');
  const c = compare(at('louvre'), at('sacrecoeur'));
  assert.equal(c.best, 'metro');
  assert.ok(c.metro.minutes < c.walk);
});

test('todas las líneas de metro están conectadas (cada una es un solo trazado)', async () => {
  const { METRO } = await import('../js/metro-data.js');
  for (const [line, { edges }] of Object.entries(METRO.lines)) {
    const adj = new Map();
    for (const [a, b] of edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    const start = adj.keys().next().value; const seen = new Set([start]); const st = [start];
    while (st.length) for (const y of adj.get(st.pop())) if (!seen.has(y)) { seen.add(y); st.push(y); }
    assert.equal(seen.size, adj.size, `${line} tiene trozos sueltos`);
  }
});
