// Cómo llegar del aeropuerto o estación al alojamiento (y desde donde estés).
// Precios 2026 (Île-de-France Mobilités, service-public.gouv.fr, Aérobus). Confírmalos antes de viajar.
import { travel, haversineKm, PARIS, fmt } from './planner.js';

export const FARES = {
  airport: 14, // billete "Paris Région–Aéroports" (RER B / metro 14 a Orly), incluye la conexión en metro/RER
  metro: 2.55, // ticket Métro-Train-RER
  bus: 2.05, // ticket Bus-Tram
  aerobus: 17.9, // Aérobus Beauvais ↔ Porte Maillot (en línea)
  taxiCDG: { right: 56, left: 65 }, // forfait oficial Paris ↔ CDG
  taxiORY: { right: 45, left: 36 }, // forfait oficial Paris ↔ Orly
};

const P = (lat, lng) => ({ lat, lng });
const HUB = {
  gareDuNord: P(48.8809, 2.3553), chatelet: P(48.8584, 2.347), chapelle: P(48.8977, 2.3594), nation: P(48.8483, 2.3958),
  pleyel: P(48.9187, 2.3437), maillot: P(48.878, 2.2826), villejuif: P(48.7876, 2.3679), gareEst: P(48.8768, 2.3592),
};

export const ARRIVAL_PLACES = {
  CDG: { name: 'Aeropuerto Charles de Gaulle (CDG)', short: 'CDG', lat: 49.0097, lng: 2.5479, kind: 'airport', exitMin: 45 },
  ORY: { name: 'Aeropuerto de Orly (ORY)', short: 'Orly', lat: 48.7262, lng: 2.3652, kind: 'airport', exitMin: 40 },
  BVA: { name: 'Aeropuerto de Beauvais (BVA)', short: 'Beauvais', lat: 49.4544, lng: 2.1128, kind: 'airport', exitMin: 30 },
  GDN: { name: 'Gare du Nord (Eurostar, trenes del norte)', short: 'Gare du Nord', lat: 48.8809, lng: 2.3553, kind: 'station', exitMin: 15 },
  GDL: { name: 'Gare de Lyon (TGV del sur, Suiza, Italia)', short: 'Gare de Lyon', lat: 48.8443, lng: 2.3744, kind: 'station', exitMin: 15 },
  GMP: { name: 'Gare Montparnasse (TGV del oeste, España vía Burdeos)', short: 'Montparnasse', lat: 48.8412, lng: 2.3209, kind: 'station', exitMin: 15 },
  GDE: { name: "Gare de l'Est (TGV del este, Alemania)", short: "Gare de l'Est", lat: 48.8768, lng: 2.3592, kind: 'station', exitMin: 15 },
  GSL: { name: 'Gare Saint-Lazare (Normandía)', short: 'Saint-Lazare', lat: 48.8763, lng: 2.3253, kind: 'station', exitMin: 10 },
  BERCY: { name: 'Bercy (buses FlixBus / BlaBlaCar)', short: 'Bercy', lat: 48.8386, lng: 2.3824, kind: 'station', exitMin: 10 },
};

// ¿Orilla derecha del Sena? (decide el precio fijo del taxi). Trazado aproximado del río en París.
const SEINE = [[2.2245, 48.841], [2.258, 48.8448], [2.279, 48.8545], [2.293, 48.859], [2.303, 48.864], [2.32, 48.865],
  [2.333, 48.859], [2.342, 48.8565], [2.353, 48.8525], [2.365, 48.846], [2.377, 48.839], [2.4, 48.827], [2.416, 48.819]];
export function rightBank(pt) {
  if (pt.lng <= SEINE[0][0]) return pt.lat > SEINE[0][1];
  for (let i = 1; i < SEINE.length; i++) {
    const [x0, y0] = SEINE[i - 1]; const [x1, y1] = SEINE[i];
    if (pt.lng <= x1) return pt.lat > y0 + ((pt.lng - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pt.lat > SEINE[SEINE.length - 1][1];
}
export const inParisProper = (pt) => haversineKm(pt, PARIS) < 7;

// Taxi con taxímetro en París (estimación: bajada de bandera + km), para estaciones o fuera del forfait.
export function taxiMeter(a, b) {
  const km = haversineKm(a, b) * 1.3;
  const lo = Math.max(8, Math.round(4.5 + km * 1.3)); const hi = Math.round(lo * 1.35 + 3);
  return [lo, hi];
}
const within = (min, [a, b]) => (a <= b ? min >= a && min <= b : min >= a || min <= b);
const leg = (from, dest) => travel(from, dest, 'transit').min;

/**
 * Opciones para ir del lugar de llegada al destino.
 * @param {string} placeId  clave de ARRIVAL_PLACES
 * @param {{lat,lng,name}} dest  hotel o destino
 * @param {{people?:number, luggage?:'poca'|'normal'|'mucha', minute?:number}} o  hora de llegada (minutos) para avisar de horarios
 */
export function transferOptions(placeId, dest, { people = 1, luggage = 'normal', minute = 12 * 60 } = {}) {
  const pl = ARRIVAL_PLACES[placeId];
  if (!pl || !dest) return [];
  const n = Math.max(1, Number(people) || 1);
  const rb = rightBank(dest);
  const paris = inParisProper(dest);
  const list = [];
  const add = (o) => list.push({ ...o, total: Math.round((o.perPerson != null ? o.perPerson * n : o.total) * 100) / 100 });
  const taxiNote = n > 4 ? ' Son más de 4: pide un taxi grande (van) o dos taxis.' : '';
  const taxiTotal = (fixed) => (n > 4 ? fixed * 2 : fixed);

  if (placeId === 'CDG') {
    add({ id: 'rerb', name: 'RER B (tren) + metro', icon: '🚆', perPerson: FARES.airport, minutes: 40 + leg(HUB.gareDuNord, dest), hours: [4 * 60 + 50, 23 * 60 + 50],
      steps: ['Sigue los carteles «Paris par train / RER B» en tu terminal.', `Compra el billete «Paris Région–Aéroports» (€${FARES.airport}) en las máquinas, en la app Île-de-France Mobilités o con la tarjeta Navigo Easy.`, 'Baja en Gare du Nord o Châtelet–Les Halles y sigue en metro hasta tu hotel: el mismo billete vale para el metro.'],
      note: 'Rápido y sin tráfico. Hay escaleras y puede ir lleno en hora punta.' });
    add({ id: '9517', name: 'Bus exprés 9517 + metro 14', icon: '🚌', perPerson: FARES.bus + FARES.metro, minutes: 45 + leg(HUB.pleyel, dest), hours: [5 * 60 + 30, 23 * 60],
      steps: ['Toma el bus exprés 9517 (sustituye al Roissybus desde marzo de 2026) hasta Saint-Denis Pleyel.', `Paga con un ticket Bus-Tram (€${FARES.bus}).`, `En Saint-Denis Pleyel toma el metro 14 hacia el centro (ticket Metro €${FARES.metro}) y conecta hasta tu hotel.`],
      note: 'La opción más barata de día. Horario aproximado: confírmalo en la app de IDFM.', busy: true });
    const via351 = haversineKm(HUB.nation, dest) < haversineKm(HUB.chapelle, dest);
    add({ id: via351 ? '351' : '350', name: `Bus ${via351 ? '351 (hasta Nation)' : '350 (hasta Porte de la Chapelle)'} + metro`, icon: '🚌', perPerson: FARES.bus + FARES.metro,
      minutes: 75 + leg(via351 ? HUB.nation : HUB.chapelle, dest), hours: [6 * 60, 21 * 60 + 30],
      steps: [`Toma el bus ${via351 ? '351' : '350'} (ticket Bus-Tram €${FARES.bus}).`, `Al final, metro hasta tu hotel (€${FARES.metro}).`], note: 'Barato pero lento (atasco en la autopista).', busy: true });
    add({ id: 'noct', name: 'Noctilien N140 / N143 (bus nocturno)', icon: '🌙', perPerson: FARES.bus, minutes: 60 + leg(HUB.gareEst, dest), hours: [0, 5 * 60 + 30],
      steps: ['De madrugada, bus nocturno N140 o N143 hasta Gare de l\'Est / Gare du Nord (ticket Bus-Tram).', 'Desde ahí, taxi corto o a pie hasta el hotel.'], note: 'Solo de noche, cuando no hay RER.', busy: true, night: true });
    if (paris) {
      add({ id: 'taxi', name: `Taxi oficial (precio fijo, orilla ${rb ? 'derecha' : 'izquierda'})`, icon: '🚕', total: taxiTotal(FARES.taxiCDG[rb ? 'right' : 'left']), minutes: 50, hours: [0, 24 * 60],
        steps: ['Sal por la parada oficial «Taxis Parisiens» (no aceptes ofertas dentro de la terminal).', `Precio fijo hasta cualquier punto de París de la orilla ${rb ? 'derecha' : 'izquierda'}: €${FARES.taxiCDG[rb ? 'right' : 'left']} por coche (hasta 4 personas, maletas incluidas).${taxiNote}`],
        note: 'Puerta a puerta. Con atasco puede tardar más de 1 h, pero el precio no cambia.', taxi: true });
    }
    add({ id: 'vtc', name: 'Uber / Bolt (VTC)', icon: '📱', total: n > 4 ? 120 : 65, range: n > 4 ? [90, 150] : [50, 80], minutes: 50, hours: [0, 24 * 60],
      steps: ['Pide el coche en la app y ve al punto de recogida de VTC señalizado en la terminal.'], note: 'Precio variable según demanda.', taxi: true });
  } else if (placeId === 'ORY') {
    add({ id: 'm14', name: 'Metro 14 directo', icon: '🚇', perPerson: FARES.airport, minutes: 25 + leg(HUB.chatelet, dest), hours: [5 * 60 + 30, 24 * 60 + 30],
      steps: ['Sigue los carteles de la línea 14 del metro (estación «Aéroport d\'Orly»).', `Compra el billete «Paris Région–Aéroports» (€${FARES.airport}).`, 'Llega a Châtelet en unos 25 min y conecta en metro hasta tu hotel con el mismo billete.'],
      note: 'La opción más cómoda en transporte público.' });
    add({ id: 't7', name: 'Tranvía T7 + metro 7', icon: '🚋', perPerson: FARES.bus + FARES.metro, minutes: 35 + leg(HUB.villejuif, dest), hours: [5 * 60 + 30, 24 * 60 + 30],
      steps: [`Tranvía T7 hasta Villejuif–Louis Aragon (ticket Bus-Tram €${FARES.bus}).`, `Metro 7 hacia el centro (€${FARES.metro}) y conecta hasta tu hotel.`], note: 'La más barata, pero más lenta.', busy: true });
    if (paris) {
      add({ id: 'taxi', name: `Taxi oficial (precio fijo, orilla ${rb ? 'derecha' : 'izquierda'})`, icon: '🚕', total: taxiTotal(FARES.taxiORY[rb ? 'right' : 'left']), minutes: 35, hours: [0, 24 * 60],
        steps: ['Parada oficial de taxis a la salida.', `Precio fijo: €${FARES.taxiORY[rb ? 'right' : 'left']} por coche (hasta 4 personas).${taxiNote}`], note: 'Puerta a puerta.', taxi: true });
    }
    add({ id: 'vtc', name: 'Uber / Bolt (VTC)', icon: '📱', total: n > 4 ? 90 : 45, range: n > 4 ? [70, 110] : [35, 55], minutes: 35, hours: [0, 24 * 60],
      steps: ['Pide el coche en la app; punto de recogida VTC señalizado.'], note: 'Precio variable.', taxi: true });
  } else if (placeId === 'BVA') {
    add({ id: 'aerobus', name: 'Aérobus (lanzadera) hasta Porte Maillot + metro', icon: '🚌', perPerson: FARES.aerobus + FARES.metro, minutes: 85 + leg(HUB.maillot, dest), hours: [0, 24 * 60],
      steps: [`Lanzadera Aérobus A01 hasta Porte Maillot (≈ €${FARES.aerobus} en línea, algo más en taquilla). Sale según los vuelos.`, `En Porte Maillot, metro 1 (€${FARES.metro}) y conecta hasta tu hotel.`],
      note: 'Beauvais está a 85 km: es prácticamente la única opción razonable.' });
    add({ id: 'taxi', name: 'Taxi (taxímetro, sin precio fijo)', icon: '🚕', total: 180, range: [160, 220], minutes: 80, hours: [0, 24 * 60],
      steps: ['Taxi con taxímetro: muy caro por la distancia.'], note: 'Solo si sois varios o llegas sin lanzadera.', taxi: true });
  } else { // estaciones de tren o bus dentro de París
    add({ id: 'metro', name: 'Metro / RER', icon: '🚇', perPerson: FARES.metro, minutes: Math.max(10, leg(pl, dest)), hours: [5 * 60 + 30, 24 * 60 + 60],
      steps: [`Compra un ticket Metro-Train-RER (€${FARES.metro}) o paga con Navigo Easy.`, 'Usa «Cómo llegar» para ver la línea exacta.'], note: 'Lo más barato y rápido.' });
    const [lo, hi] = taxiMeter(pl, dest);
    add({ id: 'taxi', name: 'Taxi (taxímetro)', icon: '🚕', total: Math.round((lo + hi) / 2), range: [lo, hi], minutes: Math.round(travel(pl, dest, 'transit').km * 3 + 8), hours: [0, 24 * 60],
      steps: ['Parada oficial de taxis a la salida de la estación.'], note: 'Cómodo con mucho equipaje.', taxi: true });
  }

  // Disponibilidad a esa hora y equipaje
  for (const o of list) {
    o.available = o.hours[1] - o.hours[0] >= 24 * 60 ? true : within(minute, o.hours.map((h) => h % (24 * 60)));
    if (o.night) o.available = within(minute, [0, 5 * 60 + 30]) || minute >= 24 * 60 - 30;
    o.warn = !o.available ? 'No funciona a esa hora' : (luggage === 'mucha' && o.busy ? 'Incómodo con mucho equipaje' : '');
  }
  const ok = list.filter((o) => o.available);
  const cheapest = ok.reduce((m, o) => (!m || o.total < m.total ? o : m), null);
  const fastest = ok.reduce((m, o) => (!m || o.minutes < m.minutes ? o : m), null);
  // Recomendado: dinero + tiempo (≈ €12 por persona y hora) + incomodidad por equipaje.
  // Prioriza ahorrar; los buses con trasbordo suman algo de incomodidad (mucho más con maletas grandes).
  const discomfort = { poca: 1, normal: 4, mucha: 15 }[luggage] ?? 4;
  const value = (o) => o.total + (o.minutes / 60) * 12 * n + (o.busy ? discomfort * n : 0) + (luggage === 'mucha' && !o.taxi ? 6 * n : 0);
  const recommended = ok.reduce((m, o) => (!m || value(o) < value(m) ? o : m), null);
  for (const o of list) {
    o.tags = [];
    if (o === recommended) o.tags.push('Recomendado');
    if (o === cheapest) o.tags.push('Más barato');
    if (o === fastest) o.tags.push('Más rápido');
  }
  return list.sort((a, b) => (b.available - a.available) || (a === recommended ? -1 : b === recommended ? 1 : a.total - b.total));
}

export function recommendedTransfer(placeId, dest, o) {
  return transferOptions(placeId, dest, o).find((x) => x.tags.includes('Recomendado')) || null;
}

// Minutos desde que aterrizas/llegas hasta estar en el hotel (salida + traslado), redondeado a 5.
export function arrivalMinutes(placeId, dest, o) {
  const pl = ARRIVAL_PLACES[placeId]; const r = recommendedTransfer(placeId, dest, o);
  if (!pl || !r) return null;
  return Math.ceil((pl.exitMin + r.minutes) / 5) * 5;
}
// Minutos antes de la salida (vuelo/tren) para irte del hotel: traslado + antelación.
export function departureMinutes(placeId, dest, o) {
  const pl = ARRIVAL_PLACES[placeId]; const r = recommendedTransfer(placeId, dest, o);
  if (!pl || !r) return null;
  const ahead = pl.kind === 'airport' ? 150 : 30; // 2 h 30 antes del vuelo (internacional) / 30 min antes del tren
  return Math.ceil((ahead + r.minutes) / 15) * 15;
}

export const fmtDur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`);
export { fmt };
