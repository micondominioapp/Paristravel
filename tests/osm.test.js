import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpeningHours, categoryFromOsm, placeFromNominatim } from '../js/osm.js';
import { planTrip, PARIS } from '../js/planner.js';

const h = (a, b) => [a * 60, b * 60];

test('horario simple de OSM', () => {
  const w = parseOpeningHours('Mo-Fr 09:00-18:00; Sa 10:00-17:00; Su off');
  assert.deepEqual(w, [null, h(9, 18), h(9, 18), h(9, 18), h(9, 18), h(9, 18), h(10, 17)]);
});

test('24/7, varios tramos, pasada medianoche y días no mencionados', () => {
  assert.deepEqual(parseOpeningHours('24/7')[3], [0, 1440]);
  const w = parseOpeningHours('Tu-Su 12:00-14:30,19:00-01:00');
  assert.equal(w[1], null); // lunes no mencionado = cerrado
  assert.deepEqual(w[2], [720, 1500]);
  assert.deepEqual(parseOpeningHours('07:30-02:00')[0], [450, 1560]);
});

test('reglas por temporada y rangos que cruzan el domingo', () => {
  const s = 'Apr-Sep: Mo-Su 09:00-19:00; Oct-Mar: Mo-Su 09:00-17:00';
  assert.deepEqual(parseOpeningHours(s, 6)[1], h(9, 19));
  assert.deepEqual(parseOpeningHours(s, 11)[1], h(9, 17));
  const w = parseOpeningHours('Fr-Mo 10:00-18:00');
  assert.ok(w[5] && w[6] && w[0] && w[1]);
  assert.equal(w[3], null);
  assert.deepEqual(parseOpeningHours('Mo-Sa 10:00-19:00; PH off; Su 11:00-18:00')[0], h(11, 18));
});

test('horario ilegible devuelve null', () => {
  assert.equal(parseOpeningHours('sunrise-sunset'), null);
  assert.equal(parseOpeningHours(''), null);
});

test('tipo según etiquetas', () => {
  assert.equal(categoryFromOsm('tourism', 'museum'), 'museo');
  assert.equal(categoryFromOsm('amenity', 'cafe'), 'comida');
  assert.equal(categoryFromOsm('shop', 'bakery'), 'compras');
  assert.equal(categoryFromOsm('leisure', 'park'), 'parque');
});

test('resultado de Nominatim se convierte en lugar planificable', () => {
  const r = {
    osm_type: 'node', osm_id: 1, lat: '48.8541', lon: '2.3326', category: 'amenity', type: 'cafe', importance: 0.45,
    name: 'Café de Flore', display_name: 'Café de Flore, 172, Boulevard Saint-Germain, Paris',
    address: { house_number: '172', road: 'Boulevard Saint-Germain', suburb: 'Saint-Germain-des-Prés' },
    extratags: { opening_hours: 'Mo-Su 07:30-01:30', website: 'https://cafedeflore.fr' },
  };
  const p = placeFromNominatim(r, 11);
  assert.equal(p.category, 'comida');
  assert.equal(p.hoursSource, 'osm');
  assert.equal(p.address, '172 Boulevard Saint-Germain, Saint-Germain-des-Prés');
  assert.ok(p.popularity > 0.4 && p.popularity < 0.8);
  const noHours = placeFromNominatim({ ...r, category: 'tourism', type: 'museum', extratags: {} }, 11);
  assert.equal(noHours.hoursSource, 'estimado');
  assert.equal(noHours.hours[1], null); // museos: lunes cerrado por defecto
  const plan = planTrip([{ ...p, id: 'c1', priority: 3 }], { arrival: '2026-12-01T09:00', departure: '2026-12-01T23:00', arrivalBuffer: 0, departureBuffer: 0, dayStart: '09:00', dayEnd: '22:00', lunch: false, hotel: PARIS });
  assert.equal(plan.unscheduled.length, 0);
});

test('un restaurante de tu lista reemplaza el almuerzo genérico', () => {
  const cafe = { id: 'c1', name: 'Café', category: 'comida', lat: 48.8541, lng: 2.3326, duration: 60, popularity: 0.5, maxWait: 5, priority: 2,
    hours: Array(7).fill([7 * 60, 23 * 60]) };
  const museum = { id: 'm1', name: 'Museo', category: 'museo', lat: 48.856, lng: 2.335, duration: 120, popularity: 0.5, maxWait: 5, priority: 2,
    hours: Array(7).fill([9 * 60, 18 * 60]) };
  const plan = planTrip([cafe, museum], { arrival: '2026-12-02T09:00', departure: '2026-12-02T23:00', arrivalBuffer: 0, departureBuffer: 0, dayStart: '09:00', dayEnd: '22:00', lunch: true, hotel: PARIS });
  const items = plan.days[0].items;
  assert.ok(!items.some((i) => i.type === 'lunch'));
  const c = items.find((i) => i.place?.id === 'c1');
  assert.ok(c.start >= 11 * 60 + 30 && c.start <= 14 * 60 + 30, `café a las ${c.start / 60}`);
});
