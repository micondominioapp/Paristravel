// Fotos de los lugares desde Wikipedia / Wikimedia Commons (gratis, sin clave).
// Si no hay foto libre, se muestra un recorte del mapa en el punto exacto.

const CACHE_KEY = 'paristravel.photos';
const WIDTH = 480;
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { cache = {}; }
const saveCache = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* lleno */ } };

export function commonsFile(name) {
  const file = String(name).replace(/^.*?(File|Fichier|Archivo):/i, '').replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${WIDTH}`;
}

// Etiqueta OSM image / wikimedia_commons -> URL de imagen utilizable.
export function imageTagUrl(tag) {
  if (!tag) return null;
  const t = String(tag).trim();
  if (/^(File|Fichier|Archivo):/i.test(t) || /commons\.wikimedia\.org\/wiki\/File:/i.test(t)) return commonsFile(t);
  if (/^https:\/\/.+\.(jpe?g|png|webp)(\?.*)?$/i.test(t)) return t;
  return null;
}

export function photoKey(p) {
  if (p.image && imageTagUrl(p.image)) return `i:${p.image}`;
  if (p.wikipedia) return `w:${p.wikipedia}`;
  if (p.wikidata) return `d:${p.wikidata}`;
  return null;
}

async function wikiBatch(lang, titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const chunk = titles.slice(i, i + 50);
    const qs = new URLSearchParams({
      action: 'query', format: 'json', origin: '*', redirects: '1', prop: 'pageimages',
      piprop: 'thumbnail', pithumbsize: String(WIDTH), titles: chunk.join('|'),
    });
    const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${qs}`);
    if (!res.ok) continue;
    const { query = {} } = await res.json();
    const alias = {};
    for (const n of query.normalized || []) alias[n.from] = n.to;
    for (const r of query.redirects || []) alias[r.from] = r.to;
    const byTitle = {};
    for (const pg of Object.values(query.pages || {})) byTitle[pg.title] = pg.thumbnail?.source || null;
    for (const t of chunk) {
      let k = t;
      for (let n = 0; n < 3 && alias[k]; n++) k = alias[k];
      out[t] = byTitle[k] ?? null;
    }
  }
  return out;
}

async function wikidataImage(qid) {
  const qs = new URLSearchParams({ action: 'wbgetclaims', entity: qid, property: 'P18', format: 'json', origin: '*' });
  const res = await fetch(`https://www.wikidata.org/w/api.php?${qs}`);
  if (!res.ok) return null;
  const file = (await res.json()).claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return file ? commonsFile(file) : null;
}

// Devuelve { clave: url|null } para todas las claves pedidas (usa caché).
export async function resolvePhotos(keys) {
  const todo = [...new Set(keys.filter((k) => k && !(k in cache)))];
  const wiki = {};
  const jobs = [];
  for (const k of todo) {
    const v = k.slice(2);
    if (k.startsWith('i:')) cache[k] = imageTagUrl(v);
    else if (k.startsWith('w:')) {
      const m = v.match(/^([a-z-]{2,12}):(.+)$/);
      const [lang, title] = m ? [m[1], m[2]] : ['fr', v];
      (wiki[lang] ||= []).push([k, title]);
    } else if (k.startsWith('d:')) {
      jobs.push(wikidataImage(v).then((u) => { cache[k] = u; }).catch(() => {}));
    }
  }
  for (const [lang, list] of Object.entries(wiki)) {
    jobs.push(wikiBatch(lang, list.map(([, t]) => t)).then((map) => {
      for (const [k, t] of list) cache[k] = map[t] ?? null;
    }).catch(() => {}));
  }
  await Promise.all(jobs);
  if (todo.length) saveCache();
  return Object.fromEntries(keys.map((k) => [k, cache[k] ?? null]));
}

// Recorte del mapa de OpenStreetMap (zoom 17) con un pin en la posición exacta.
export function mapTile(lat, lng, z = 17) {
  const n = 2 ** z;
  const xf = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const x = Math.floor(xf); const y = Math.floor(yf);
  return { url: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, left: (xf - x) * 100, top: (yf - y) * 100 };
}
