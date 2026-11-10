import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES } from '../js/data.js';
import { placeMatches } from '../js/match.js';

const find = (q) => PLACES.filter((p) => placeMatches(q, p)).map((p) => p.id);

test('encuentra lugares escritos en francés, inglés o español', () => {
  assert.deepEqual(find('Musée du Louvre'), ['louvre']);
  assert.deepEqual(find('tour eiffel'), ['eiffel']);
  assert.deepEqual(find('Eiffel Tower'), ['eiffel']);
  assert.deepEqual(find('Château de Versailles'), ['versailles']);
  assert.deepEqual(find('cathedrale notre dame'), ['notredame']);
  assert.deepEqual(find('Sacré Cœur'), ['sacrecoeur']);
  assert.deepEqual(find('jardin des tuileries'), ['tuileries']);
  assert.deepEqual(find('Arc de Triomphe'), ['arc']);
  assert.deepEqual(find('cimetiere pere lachaise'), ['perelachaise']);
  assert.deepEqual(find('Quartier Latin'), ['latino']);
  assert.ok(find('museo').length > 5);
  assert.deepEqual(find('xyz inexistente'), []);
});
