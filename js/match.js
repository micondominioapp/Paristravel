// Comparación de nombres tolerante: sin acentos, sin mayúsculas y sin palabras de relleno
// en español, francés o inglés ("Musée du Louvre" = "museo louvre" = "louvre").
const STOP = new Set(['de', 'del', 'du', 'des', 'la', 'le', 'les', 'el', 'los', 'las', 'l', 'd', 'the', 'of', 'y', 'et', 'and', 'a', 'en', 'paris', 'parís']);
const SYN = { musee: 'museo', museum: 'museo', jardin: 'jardin', garden: 'jardin', gardens: 'jardin', jardines: 'jardin',
  tour: 'torre', tower: 'torre', cathedrale: 'catedral', cathedral: 'catedral', eglise: 'iglesia', church: 'iglesia',
  basilique: 'basilica', chateau: 'palacio', palais: 'palacio', palace: 'palacio', pont: 'puente', bridge: 'puente',
  place: 'plaza', square: 'plaza', cimetiere: 'cementerio', cemetery: 'cementerio', opera: 'opera' };

export const normText = (x) => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, ' ').trim();

export function tokens(x) {
  return normText(x).split(' ').filter((w) => w && !STOP.has(w)).map((w) => SYN[w] || w);
}

// ¿El texto buscado corresponde a este nombre? Todas las palabras buscadas deben aparecer (o empezar una palabra del nombre).
export function nameMatches(query, name) {
  const q = tokens(query);
  if (!q.length) return false;
  const n = tokens(name);
  return q.every((w) => n.some((v) => v === w || (w.length >= 3 && v.startsWith(w))));
}

export function placeMatches(query, place) {
  return [place.name, ...(place.aliases || [])].some((n) => nameMatches(query, n));
}
