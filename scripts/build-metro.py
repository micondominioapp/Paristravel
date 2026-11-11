"""Genera js/metro-data.js (red de metro, RER y tranvía de París) a partir de los datos abiertos
de Île-de-France Mobilités (ODbL): "emplacement-des-gares-idf" y "traces-du-reseau-ferre-idf".

Uso: python3 -I scripts/build-metro.py <emplacement-des-gares-idf.geojson> <traces-du-reseau-ferre-idf.geojson> js/metro-data.js
"""
import json, math, sys
from collections import defaultdict

gares_path, traces_path, out_path = sys.argv[1:4]
BBOX = (48.70, 49.02, 2.13, 2.60)  # lat_min, lat_max, lng_min, lng_max (París y alrededores, incluye CDG y Orly)
MODES = {'METRO': 'metro', 'RER': 'rer', 'TRAMWAY': 'tram', 'TRAM': 'tram'}

def inbox(lat, lng):
    return BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lng <= BBOX[3]

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

def line_key(p):
    # "res_com" es igual en ambos ficheros: "METRO 7bis", "TRAM 3a", "RER B"...
    if not MODES.get(p.get('mode')):
        return None
    rc = str(p.get('res_com') or '').strip()
    if rc.startswith('METRO '):
        return 'M' + rc[6:]
    if rc.startswith('TRAM '):
        return 'T' + rc[5:]
    if rc.startswith('RER '):
        return rc
    return None

# --- Estaciones (una por zona de correspondencia: las de distintas líneas comparten nodo) ---
gares = json.load(open(gares_path))['features']
nodes = {}          # zdc -> {name, pts}
line_stations = defaultdict(set)
platform = {}       # (línea, zdc) -> (lat, lng) del andén de esa línea
for f in gares:
    p = f['properties']
    lk = line_key(p)
    if not lk:
        continue
    lat, lng = p['geo_point_2d']['lat'], p['geo_point_2d']['lon']
    if not inbox(lat, lng):
        continue
    z = str(p.get('id_ref_zdc') or p.get('nom_zdc') or p['nom_gares'])
    n = nodes.setdefault(z, {'name': p.get('nom_zdc') or p['nom_gares'], 'pts': []})
    n['pts'].append((lat, lng))
    line_stations[lk].add(z)
    platform[(lk, z)] = (lat, lng)
for n in nodes.values():
    n['lat'] = sum(x[0] for x in n['pts']) / len(n['pts'])
    n['lng'] = sum(x[1] for x in n['pts']) / len(n['pts'])

# --- Tramos: las estaciones de la línea cercanas a cada tramo, en orden, son consecutivas ---
traces = json.load(open(traces_path))['features']
edges = defaultdict(dict)   # line -> {(a,b): km}
colors = {}
def project(pt, coords):
    """distancia (km) del punto a la polilínea y posición a lo largo (km)."""
    best = (1e9, 0.0); acc = 0.0
    for (x0, y0), (x1, y1) in zip(coords, coords[1:]):
        # coordenadas planas locales en km
        kx = 111.32 * math.cos(math.radians(pt[0])); ky = 110.57
        ax, ay = (x0 - pt[1]) * kx, (y0 - pt[0]) * ky
        bx, by = (x1 - pt[1]) * kx, (y1 - pt[0]) * ky
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / L2))
        cx, cy = ax + t * dx, ay + t * dy
        d = math.hypot(cx, cy)
        if d < best[0]:
            best = (d, acc + t * math.sqrt(L2))
        acc += math.sqrt(L2)
    return best

for f in traces:
    p = f['properties']
    lk = line_key(p)
    if not lk or lk not in line_stations:
        continue
    colors[lk] = '#' + (p.get('colourweb_hexa') or '777777')
    g = f['geometry']
    parts = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
    for coords in parts:
        if not any(inbox(c[1], c[0]) for c in coords):
            continue
        near = []
        for z in line_stations[lk]:
            d, pos = project(platform[(lk, z)], coords)  # andén de esta línea, no el centro de la estación
            if d < 0.2:
                near.append((pos, z))
        near.sort()
        for (p0, a), (p1, b) in zip(near, near[1:]):
            if a != b:
                key = tuple(sorted((a, b)))
                dist = max(p1 - p0, km((nodes[a]['lat'], nodes[a]['lng']), (nodes[b]['lat'], nodes[b]['lng'])))
                edges[lk][key] = min(edges[lk].get(key, 1e9), dist)

# Quitar "atajos": si a-b y además a-c-b con c en medio, a-b es redundante (tramos que saltan una estación).
for lk, es in edges.items():
    adj = defaultdict(set)
    for a, b in es: adj[a].add(b); adj[b].add(a)
    for (a, b) in list(es):
        for c in adj[a] & adj[b]:
            if es.get(tuple(sorted((a, c)))) and es.get(tuple(sorted((c, b)))) and es[(a, b)] >= 0.9 * (es[tuple(sorted((a, c)))] + es[tuple(sorted((c, b)))]):
                es.pop((a, b), None)
                break

# Unir trozos sueltos de una misma línea (estaciones cuyo andén queda lejos del trazado):
# se une el par de estaciones más cercano entre dos trozos si están a menos de 4 km.
for lk, es in edges.items():
    while True:
        adj = defaultdict(set)
        for a, b in es: adj[a].add(b); adj[b].add(a)
        for z in line_stations[lk]:
            adj.setdefault(z, set())
        comp = {}; cid = 0
        for n in adj:
            if n in comp: continue
            stack = [n]; comp[n] = cid
            while stack:
                x = stack.pop()
                for y in adj[x]:
                    if y not in comp: comp[y] = cid; stack.append(y)
            cid += 1
        if cid <= 1: break
        best = None
        for a in adj:
            for b in adj:
                if comp[a] < comp[b] and len(adj[a]) <= 1 or comp[a] < comp[b] and len(adj[b]) <= 1:
                    d = km(platform[(lk, a)], platform[(lk, b)])
                    if not best or d < best[0]: best = (d, a, b)
        if not best or best[0] > 4: break
        es[tuple(sorted((best[1], best[2])))] = best[0]

used = sorted({z for es in edges.values() for e in es for z in e})
idx = {z: i for i, z in enumerate(used)}
out = {
    'source': "Île-de-France Mobilités – datos abiertos (ODbL): emplacement-des-gares-idf y traces-du-reseau-ferre-idf",
    'stations': [[nodes[z]['name'], round(nodes[z]['lat'], 5), round(nodes[z]['lng'], 5)] for z in used],
    'lines': {lk: {'color': colors.get(lk, '#777777'), 'edges': [[idx[a], idx[b], round(d, 3)] for (a, b), d in sorted(es.items())]}
              for lk, es in sorted(edges.items()) if es},
}
with open(out_path, 'w') as fh:
    fh.write('// Generado por scripts/build-metro.py — Datos: Île-de-France Mobilités (ODbL). No editar a mano.\n')
    fh.write('export const METRO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('estaciones', len(used), 'líneas', len(out['lines']))
for lk in sorted(out['lines'], key=lambda k: (k[0], len(k), k)):
    print(lk, len(out['lines'][lk]['edges']), 'tramos,', len({i for e in out['lines'][lk]['edges'] for i in e[:2]}), 'estaciones')
