import test from 'node:test';
import assert from 'node:assert/strict';
import { imageTagUrl, photoKey, resolvePhotos, mapTile } from '../js/photos.js';

test('etiquetas de imagen de OSM', () => {
  assert.equal(imageTagUrl('File:Starbucks Opéra.jpg'), 'https://commons.wikimedia.org/wiki/Special:FilePath/Starbucks_Op%C3%A9ra.jpg?width=480');
  assert.match(imageTagUrl('https://commons.wikimedia.org/wiki/File:A b.jpg'), /FilePath\/A_b\.jpg/);
  assert.equal(imageTagUrl('https://ejemplo.fr/foto.jpg'), 'https://ejemplo.fr/foto.jpg');
  assert.equal(imageTagUrl('Category:Cafés'), null);
  assert.equal(photoKey({ wikipedia: 'fr:Tour Eiffel' }), 'w:fr:Tour Eiffel');
  assert.equal(photoKey({}), null);
});

test('fotos de Wikipedia en lote, siguiendo redirecciones', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    const u = new URL(url);
    if (u.hostname === 'fr.wikipedia.org') {
      assert.equal(u.searchParams.get('titles'), 'Tour Eiffel|Opéra Garnier|No existe');
      return { ok: true, json: async () => ({ query: {
        redirects: [{ from: 'Opéra Garnier', to: 'Palais Garnier' }],
        pages: { 1: { title: 'Tour Eiffel', thumbnail: { source: 'https://upload.wikimedia.org/eiffel.jpg' } }, 2: { title: 'Palais Garnier', thumbnail: { source: 'https://upload.wikimedia.org/garnier.jpg' } }, '-1': { title: 'No existe', missing: '' } },
      } }) };
    }
    return { ok: true, json: async () => ({ claims: { P18: [{ mainsnak: { datavalue: { value: 'Café de Flore.jpg' } } }] } }) };
  };
  const r = await resolvePhotos(['w:fr:Tour Eiffel', 'w:fr:Opéra Garnier', 'w:fr:No existe', 'd:Q123']);
  assert.equal(r['w:fr:Tour Eiffel'], 'https://upload.wikimedia.org/eiffel.jpg');
  assert.equal(r['w:fr:Opéra Garnier'], 'https://upload.wikimedia.org/garnier.jpg');
  assert.equal(r['w:fr:No existe'], null);
  assert.match(r['d:Q123'], /Caf%C3%A9_de_Flore\.jpg/);
  assert.equal(calls, 2);
  await resolvePhotos(['w:fr:Tour Eiffel']); // en caché: sin nuevas llamadas
  assert.equal(calls, 2);
});

test('recorte de mapa', () => {
  const t = mapTile(48.8584, 2.2945);
  assert.match(t.url, /^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/);
  assert.ok(t.left >= 0 && t.left < 100 && t.top >= 0 && t.top < 100);
});
