import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpeningHours, categoryFromOsm, placeFromNominatim, arrondissement, districtLabel, searchPlaces } from '../js/osm.js';
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
    address: { house_number: '172', road: 'Boulevard Saint-Germain', quarter: 'Saint-Germain-des-Prés', suburb: 'Paris 6e Arrondissement', postcode: '75006', city: 'Paris' },
    extratags: { opening_hours: 'Mo-Su 07:30-01:30', website: 'https://cafedeflore.fr' },
  };
  const p = placeFromNominatim(r, 11);
  assert.equal(p.category, 'comida');
  assert.equal(p.hoursSource, 'osm');
  assert.equal(p.address, '172 Boulevard Saint-Germain, Saint-Germain-des-Prés');
  assert.equal(p.postcode, '75006');
  assert.equal(p.arrondissement, 6);
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

test('distrito a partir del código postal', () => {
  assert.equal(arrondissement('75002'), 2);
  assert.equal(arrondissement('75116'), 16);
  assert.equal(arrondissement('78000'), null);
  assert.equal(arrondissement('', 'Paris 9e Arrondissement'), 9);
  assert.equal(districtLabel(1), 'Distrito 1 (1er arrondissement)');
});

test('"starbucks ópera" busca Starbucks alrededor de la Ópera, del más cercano al más lejano', async () => {
  const calls = [];
  const sb = (id, lat, lon, road, num) => ({ osm_type: 'node', osm_id: id, lat: String(lat), lon: String(lon), category: 'amenity', type: 'cafe',
    importance: 0.1, name: 'Starbucks', display_name: `Starbucks, ${num}, ${road}, Paris`, address: { road, house_number: num, postcode: '75002', suburb: 'Paris 2e Arrondissement' }, extratags: {} });
  globalThis.fetch = async (url) => {
    const q = new URL(url).searchParams;
    calls.push(q.get('q'));
    let body = [];
    if (q.get('q') === 'starbucks ópera, Paris') body = [];
    else if (q.get('q') === 'ópera, Paris') body = [{ lat: '48.8719', lon: '2.3316', name: 'Opéra Garnier', namedetails: { 'name:es': 'Ópera Garnier' } }];
    else if (q.get('q') === 'starbucks' && q.get('bounded') === '1') body = [sb(2, 48.8664, 2.3348, "Avenue de l'Opéra", '26'), sb(1, 48.8705, 2.3316, 'Boulevard des Capucines', '3')];
    return { ok: true, json: async () => body };
  };
  const res = await searchPlaces('starbucks ópera', 11);
  assert.deepEqual(calls, ['starbucks ópera, Paris', 'ópera, Paris', 'starbucks']);
  assert.equal(res[0].address, '3 Boulevard des Capucines');
  assert.equal(res[0].near.name, 'Ópera Garnier');
  assert.ok(res[0].near.meters < res[1].near.meters);
  assert.equal(res[0].arrondissement, 2);
});
