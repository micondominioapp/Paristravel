// Sincronización del viaje entre dispositivos usando el propio repositorio de GitHub.
// El viaje se guarda en el archivo viaje.json de la rama "datos" (no toca la app publicada).
// Leer es público (cualquiera que abra la app ve el viaje); guardar necesita una clave (token) de GitHub.

export const SYNC_BRANCH = 'datos';
export const SYNC_PATH = 'viaje.json';
const API = 'https://api.github.com';

// owner/repo a partir de la URL de GitHub Pages (micondominioapp.github.io/Paristravel/).
export function repoFromLocation(loc = globalThis.location) {
  const m = loc?.hostname?.match(/^([^.]+)\.github\.io$/i);
  const first = loc?.pathname?.split('/').filter(Boolean)[0];
  if (m && first) return `${m[1]}/${first}`;
  return 'micondominioapp/Paristravel';
}

// UTF-8 <-> base64 (la API de GitHub usa base64).
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function headers(token) {
  const h = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export class SyncError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function gh(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method, cache: 'no-store', headers: { ...headers(token), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw new SyncError(data?.message || `HTTP ${res.status}`, res.status);
  return data;
}

// Lee el viaje guardado. Devuelve { data, sha } o null si todavía no hay ninguno.
export async function pullTrip(repo, token) {
  try {
    const f = await gh(`/repos/${repo}/contents/${SYNC_PATH}?ref=${SYNC_BRANCH}`, { token });
    return { data: JSON.parse(fromBase64(f.content)), sha: f.sha };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function ensureBranch(repo, token) {
  const info = await gh(`/repos/${repo}`, { token });
  const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(info.default_branch)}`, { token });
  try {
    await gh(`/repos/${repo}/git/refs`, { token, method: 'POST', body: { ref: `refs/heads/${SYNC_BRANCH}`, sha: ref.object.sha } });
  } catch (e) {
    if (e.status !== 422) throw e; // 422 = ya existe
  }
}

// Guarda el viaje. sha = versión que tenemos (si otro dispositivo guardó después, se reintenta con la nueva).
export async function pushTrip(repo, token, data, sha) {
  const body = (s) => ({
    message: `Actualizar viaje (${data.updatedBy || 'app'})`,
    content: toBase64(JSON.stringify(data, null, 1)), branch: SYNC_BRANCH, ...(s ? { sha: s } : {}),
  });
  const put = (s) => gh(`/repos/${repo}/contents/${SYNC_PATH}`, { token, method: 'PUT', body: body(s) });
  try {
    return (await put(sha)).content.sha;
  } catch (e) {
    if (e.status === 404 && /branch/i.test(e.message)) { await ensureBranch(repo, token); return (await put(null)).content.sha; }
    if (e.status === 409 || e.status === 422) { // versión vieja: tomamos la actual y guardamos encima
      const cur = await pullTrip(repo, token).catch(() => null);
      return (await put(cur?.sha || null)).content.sha;
    }
    throw e;
  }
}

// Comprueba la clave: que exista y pueda escribir en el repositorio.
export async function checkToken(repo, token) {
  const info = await gh(`/repos/${repo}`, { token });
  return !!info.permissions?.push;
}

// Enlace para crear la clave con casi todo ya rellenado (falta elegir el repositorio).
export function tokenUrl(repo) {
  const qs = new URLSearchParams({
    name: 'Paris a mi ritmo - sincronizar', description: `Guardar el viaje de la app en ${repo}`,
    expires_in: '90', contents: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${qs}`;
}

export const friendlyError = (e) => {
  if (!navigator.onLine) return 'Sin conexión: se sincronizará cuando vuelva internet.';
  if (e?.status === 401) return 'La clave de GitHub no es válida o venció. Crea una nueva.';
  if (e?.status === 403) return /rate limit/i.test(e.message) ? 'GitHub limitó las consultas por un rato; vuelve a intentar en unos minutos.' : 'La clave no tiene permiso para guardar en el repositorio (Contents: Read and write).';
  if (e?.status === 404) return 'No encuentro el repositorio: revisa que la clave tenga acceso a Paristravel.';
  return `No se pudo sincronizar (${e?.message || 'error'}).`;
};
