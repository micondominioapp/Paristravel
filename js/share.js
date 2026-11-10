// Compartir el viaje por enlace: el viaje va comprimido dentro del propio link (#viaje=...),
// así no hace falta servidor ni cuentas. Quien lo abre ve el mismo itinerario.

const PREFIX_Z = 'z'; // comprimido
const PREFIX_J = 'j'; // sin comprimir (navegadores antiguos)

function toB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// Solo lo que define el itinerario (no los reportes de aforo ni la replanificación local).
export function sharedPart(state) {
  return {
    v: 1,
    trip: state.trip,
    selected: state.selected,
    custom: state.custom,
    visited: state.visited,
  };
}

export async function encodeTrip(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(sharedPart(state)));
  if (typeof CompressionStream === 'function') {
    try { return PREFIX_Z + toB64Url(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch { /* sin soporte */ }
  }
  return PREFIX_J + toB64Url(bytes);
}

export async function decodeTrip(code) {
  const kind = code[0];
  let bytes = fromB64Url(code.slice(1));
  if (kind === PREFIX_Z) bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== PREFIX_J) throw new Error('formato');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data.v !== 1 || !data.trip) throw new Error('formato');
  return data;
}

export function shareUrl(code, base = location.href) {
  const u = new URL(base);
  u.hash = `viaje=${code}`;
  u.search = '';
  return u.toString();
}

export function codeFromHash(hash = location.hash) {
  const m = hash.match(/viaje=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
