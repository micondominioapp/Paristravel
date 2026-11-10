import test from 'node:test';
import assert from 'node:assert/strict';
import { repoFromLocation, toBase64, fromBase64, pullTrip, pushTrip, tokenUrl } from '../js/sync.js';

test('repositorio a partir de la URL de GitHub Pages', () => {
  assert.equal(repoFromLocation({ hostname: 'micondominioapp.github.io', pathname: '/Paristravel/' }), 'micondominioapp/Paristravel');
  assert.equal(repoFromLocation({ hostname: 'localhost', pathname: '/' }), 'micondominioapp/Paristravel');
});

test('base64 con acentos y emojis', () => {
  const s = JSON.stringify({ name: 'Café de Flore — París 🗼' });
  assert.equal(fromBase64(toBase64(s)), s);
});

function fakeGitHub() {
  const store = { branch: false, file: null, sha: null, n: 0 };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET'; const body = init.body ? JSON.parse(init.body) : null;
    const ok = (data, status = 200) => ({ ok: true, status, json: async () => data });
    const err = (status, message) => ({ ok: false, status, json: async () => ({ message }) });
    if (u.pathname.endsWith('/contents/viaje.json') && method === 'GET') return store.file ? ok({ content: store.file, sha: store.sha }) : err(404, 'Not Found');
    if (u.pathname.endsWith('/contents/viaje.json') && method === 'PUT') {
      if (!store.branch) return err(404, 'Branch datos not found');
      if (store.file && body.sha !== store.sha) return err(409, 'sha does not match');
      store.file = body.content; store.sha = `sha${++store.n}`;
      return ok({ content: { sha: store.sha } }, 201);
    }
    if (u.pathname === '/repos/o/r') return ok({ default_branch: 'main', permissions: { push: true } });
    if (u.pathname.endsWith('/git/ref/heads/main')) return ok({ object: { sha: 'abc' } });
    if (u.pathname.endsWith('/git/refs') && method === 'POST') { store.branch = true; return ok({}, 201); }
    return err(500, 'inesperado');
  };
  return store;
}

test('guardar crea la rama la primera vez, leer devuelve lo guardado, y un sha viejo no rompe', async () => {
  const store = fakeGitHub();
  assert.equal(await pullTrip('o/r', null), null);
  const sha1 = await pushTrip('o/r', 'tok', { v: 1, trip: { hotel: { name: 'Hôtel' } }, updatedAt: 1 }, null);
  assert.equal(store.branch, true);
  const got = await pullTrip('o/r', null);
  assert.equal(got.sha, sha1);
  assert.equal(got.data.trip.hotel.name, 'Hôtel');
  const sha2 = await pushTrip('o/r', 'tok', { v: 1, trip: {}, updatedAt: 2 }, 'sha-viejo'); // otro dispositivo guardó antes
  assert.notEqual(sha2, sha1);
  assert.equal((await pullTrip('o/r', null)).data.updatedAt, 2);
});

test('enlace para crear la clave', () => {
  const u = new URL(tokenUrl('o/r'));
  assert.equal(u.searchParams.get('contents'), 'write');
});
