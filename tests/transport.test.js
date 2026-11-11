import test from 'node:test';
import assert from 'node:assert/strict';
import { transferOptions, rightBank, arrivalMinutes, departureMinutes, FARES } from '../js/transport.js';

const batignolles = { lat: 48.8846, lng: 2.3197, name: 'Hotel Batignolles' }; // orilla derecha
const latinQuarter = { lat: 48.8493, lng: 2.347, name: 'Hotel Barrio Latino' }; // orilla izquierda

test('orilla del Sena', () => {
  assert.equal(rightBank(batignolles), true);
  assert.equal(rightBank(latinQuarter), false);
  assert.equal(rightBank({ lat: 48.8738, lng: 2.295 }), true); // Arco del Triunfo
  assert.equal(rightBank({ lat: 48.8584, lng: 2.2945 }), false); // Torre Eiffel
});

test('CDG de día, 1 persona: recomienda lo económico (bus 9517 + metro); con mucho equipaje, el RER B', () => {
  const o = transferOptions('CDG', batignolles, { people: 1, minute: 10 * 60 });
  const rec = o.find((x) => x.tags.includes('Recomendado'));
  const cheap = o.find((x) => x.tags.includes('Más barato'));
  assert.equal(rec.id, '9517');
  assert.equal(rec.total, 4.6);
  assert.ok(['9517', '350', '351'].includes(cheap.id));
  const heavy = transferOptions('CDG', batignolles, { people: 1, luggage: 'mucha', minute: 10 * 60 }).find((x) => x.tags.includes('Recomendado'));
  assert.equal(heavy.id, 'rerb');
  assert.equal(heavy.total, FARES.airport);
  assert.equal(o.find((x) => x.id === 'taxi').total, 56); // orilla derecha
  assert.equal(transferOptions('CDG', latinQuarter, {}).find((x) => x.id === 'taxi').total, 65);
});

test('4 personas con mucho equipaje: el taxi de precio fijo es lo recomendado', () => {
  const rec = transferOptions('CDG', batignolles, { people: 4, luggage: 'mucha', minute: 10 * 60 }).find((x) => x.tags.includes('Recomendado'));
  assert.equal(rec.id, 'taxi');
  assert.equal(rec.total, 56);
});

test('de madrugada no ofrece RER ni buses de día', () => {
  const o = transferOptions('CDG', batignolles, { people: 1, minute: 1 * 60 + 30 });
  assert.equal(o.find((x) => x.id === 'rerb').available, false);
  assert.equal(o.find((x) => x.id === 'noct').available, true);
  assert.ok(o.find((x) => x.tags.includes('Recomendado')).available);
});

test('Orly, Beauvais y estaciones', () => {
  assert.equal(transferOptions('ORY', latinQuarter, { minute: 12 * 60 }).find((x) => x.id === 'taxi').total, 36);
  assert.equal(transferOptions('ORY', batignolles, { luggage: 'mucha', minute: 12 * 60 }).find((x) => x.tags.includes('Recomendado')).id, 'm14');
  assert.equal(transferOptions('BVA', batignolles, { minute: 12 * 60 })[0].id, 'aerobus');
  const gdl = transferOptions('GDL', batignolles, { minute: 12 * 60 });
  assert.equal(gdl.find((x) => x.tags.includes('Más barato')).id, 'metro');
});

test('tiempos para el plan: llegada y salida', () => {
  const a = arrivalMinutes('CDG', batignolles, { minute: 10 * 60 });
  assert.ok(a >= 75 && a <= 150, `llegada ${a}`);
  const d = departureMinutes('CDG', batignolles, { minute: 18 * 60 });
  assert.ok(d >= 180 && d <= 270, `salida ${d}`);
});

test('taxi y VTC están disponibles a cualquier hora', () => {
  for (const m of [0, 3 * 60, 12 * 60, 23 * 60 + 59]) {
    const o = transferOptions('CDG', batignolles, { minute: m });
    assert.equal(o.find((x) => x.id === 'taxi').available, true);
    assert.equal(o.find((x) => x.id === 'vtc').available, true);
  }
});
