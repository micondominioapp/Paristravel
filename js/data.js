// Catálogo de lugares de París y modelo de aforo estimado.
// IMPORTANTE: los horarios son aproximados y cambian por temporada; verifica en la web oficial.
// Los días van de 0 = domingo a 6 = sábado.

const t = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

// Construye un horario semanal: hours('09:00','18:00', { closed:[2], extra:{3:['09:00','21:00']} })
export function hours(open, close, { closed = [], extra = {} } = {}) {
  return Array.from({ length: 7 }, (_, d) => {
    if (closed.includes(d)) return null;
    if (extra[d]) return [t(extra[d][0]), t(extra[d][1])];
    return [t(open), t(close)];
  });
}

export const CATEGORIES = {
  museo: { label: 'Museo', icon: '🖼️' },
  mirador: { label: 'Mirador', icon: '🗼' },
  monumento: { label: 'Monumento', icon: '🏛️' },
  iglesia: { label: 'Iglesia', icon: '⛪' },
  parque: { label: 'Parque', icon: '🌳' },
  barrio: { label: 'Barrio', icon: '🏘️' },
  compras: { label: 'Compras', icon: '🛍️' },
  paseo: { label: 'Paseo', icon: '⛴️' },
};

export const SLOTS = {
  any: 'Cualquier hora',
  morning: 'Mañana',
  afternoon: 'Tarde',
  evening: 'Noche',
  sunset: 'Atardecer',
};

// Curvas de afluencia típicas por hora (0-1) según tipo de lugar.
export const CATEGORY_CURVES = {
  museo: { 8: 0.15, 9: 0.45, 10: 0.7, 11: 0.9, 12: 0.95, 13: 0.9, 14: 1, 15: 0.95, 16: 0.8, 17: 0.6, 18: 0.45, 19: 0.35, 20: 0.3, 21: 0.25 },
  mirador: { 8: 0.2, 9: 0.4, 10: 0.6, 11: 0.8, 12: 0.85, 13: 0.85, 14: 0.9, 15: 0.9, 16: 0.9, 17: 0.95, 18: 1, 19: 1, 20: 0.95, 21: 0.8, 22: 0.6, 23: 0.4 },
  monumento: { 8: 0.2, 9: 0.4, 10: 0.65, 11: 0.85, 12: 0.9, 13: 0.9, 14: 0.95, 15: 1, 16: 0.9, 17: 0.75, 18: 0.6, 19: 0.45, 20: 0.35, 21: 0.3 },
  iglesia: { 7: 0.15, 8: 0.3, 9: 0.5, 10: 0.75, 11: 0.9, 12: 0.85, 13: 0.8, 14: 0.9, 15: 1, 16: 0.95, 17: 0.8, 18: 0.6, 19: 0.4, 20: 0.3, 21: 0.25 },
  parque: { 7: 0.1, 8: 0.2, 9: 0.3, 10: 0.4, 11: 0.55, 12: 0.75, 13: 0.85, 14: 0.9, 15: 1, 16: 1, 17: 0.95, 18: 0.85, 19: 0.7, 20: 0.5, 21: 0.3 },
  barrio: { 8: 0.15, 9: 0.25, 10: 0.4, 11: 0.55, 12: 0.7, 13: 0.8, 14: 0.85, 15: 1, 16: 1, 17: 1, 18: 0.95, 19: 0.85, 20: 0.75, 21: 0.6, 22: 0.45, 23: 0.3 },
  compras: { 9: 0.2, 10: 0.4, 11: 0.55, 12: 0.7, 13: 0.75, 14: 0.85, 15: 0.95, 16: 1, 17: 1, 18: 0.9, 19: 0.7, 20: 0.5, 21: 0.3 },
  paseo: { 9: 0.25, 10: 0.4, 11: 0.6, 12: 0.7, 13: 0.7, 14: 0.8, 15: 0.85, 16: 0.85, 17: 0.9, 18: 0.95, 19: 1, 20: 1, 21: 0.9, 22: 0.6, 23: 0.4 },
};

// Afluencia relativa según día de la semana (Dom..Sáb).
export const DAY_FACTOR = [1.15, 0.95, 0.9, 0.95, 0.95, 1.05, 1.2];
// Afluencia relativa según mes (Ene..Dic).
export const SEASON_FACTOR = [0.75, 0.75, 0.85, 1.0, 1.05, 1.1, 1.2, 1.2, 1.0, 0.95, 0.8, 0.95];

// popularity: 0-1 (qué tan lleno se pone en hora pico)
// maxWait: minutos de fila en el peor momento
// dayBoost: multiplicador por día (p.ej. el Louvre se llena más los lunes porque Orsay cierra)
export const PLACES = [
  { id: 'eiffel', name: 'Torre Eiffel', category: 'mirador', lat: 48.8584, lng: 2.2945, duration: 150, popularity: 1, maxWait: 90, slot: 'sunset', booking: true,
    capacity: '~20.000 visitantes/día', hours: hours('09:30', '23:45'),
    tip: 'Compra entrada con hora en la web oficial. Tras el anochecer brilla 5 min cada hora en punto.' },
  { id: 'louvre', name: 'Museo del Louvre', category: 'museo', lat: 48.8606, lng: 2.3376, duration: 180, popularity: 1, maxWait: 60, slot: 'morning', booking: true,
    capacity: 'Límite ~30.000 visitantes/día', hours: hours('09:00', '18:00', { closed: [2], extra: { 3: ['09:00', '21:00'], 5: ['09:00', '21:00'] } }),
    dayBoost: { 1: 1.15 }, tip: 'Reserva franja horaria obligatoria. Entra por la Porte des Lions o el Carrousel. Cierra los martes.' },
  { id: 'orsay', name: "Museo d'Orsay", category: 'museo', lat: 48.86, lng: 2.3266, duration: 150, popularity: 0.85, maxWait: 45, slot: 'any', booking: true,
    capacity: '~12.000 visitantes/día', hours: hours('09:30', '18:00', { closed: [1], extra: { 4: ['09:30', '21:45'] } }),
    dayBoost: { 2: 1.2 }, tip: 'Los martes se llena (el Louvre cierra). Jueves abre hasta tarde.' },
  { id: 'notredame', name: 'Notre-Dame', category: 'iglesia', lat: 48.853, lng: 2.3499, duration: 60, popularity: 0.95, maxWait: 60, slot: 'morning', booking: false,
    capacity: 'Aforo controlado, ~35.000/día', hours: hours('07:50', '19:00', { extra: { 4: ['07:50', '22:00'], 0: ['08:15', '19:30'], 6: ['08:15', '19:30'] } }),
    tip: 'Puedes reservar franja gratuita en la app oficial para evitar fila.' },
  { id: 'saintechapelle', name: 'Sainte-Chapelle', category: 'iglesia', lat: 48.8554, lng: 2.345, duration: 60, popularity: 0.8, maxWait: 40, slot: 'morning', booking: true,
    capacity: 'Aforo reducido', hours: hours('09:00', '19:00'), tip: 'Ideal en día soleado por los vitrales.' },
  { id: 'arc', name: 'Arco del Triunfo', category: 'mirador', lat: 48.8738, lng: 2.295, duration: 60, popularity: 0.8, maxWait: 30, slot: 'evening', booking: true,
    capacity: 'Terraza con aforo limitado', hours: hours('10:00', '23:00'), tip: 'Vistas a los Campos Elíseos iluminados de noche.' },
  { id: 'sacrecoeur', name: 'Sacré-Cœur', category: 'iglesia', lat: 48.8867, lng: 2.3431, duration: 60, popularity: 0.85, maxWait: 15, slot: 'morning', booking: false,
    capacity: 'Gran capacidad', hours: hours('06:30', '22:30'), tip: 'Temprano evitas multitudes en las escalinatas.' },
  { id: 'montmartre', name: 'Montmartre y Place du Tertre', category: 'barrio', lat: 48.8865, lng: 2.3408, duration: 120, popularity: 0.85, maxWait: 0, slot: 'morning', booking: false,
    capacity: 'Espacio abierto', hours: hours('00:00', '24:00'), tip: 'Cuidado con carteristas y vendedores de pulseras.' },
  { id: 'orangerie', name: "Museo de l'Orangerie", category: 'museo', lat: 48.8638, lng: 2.3227, duration: 75, popularity: 0.6, maxWait: 30, slot: 'any', booking: true,
    capacity: 'Aforo reducido', hours: hours('09:00', '18:00', { closed: [2] }), tip: 'Los Nenúfares de Monet. Cierra los martes.' },
  { id: 'pantheon', name: 'Panteón', category: 'monumento', lat: 48.8462, lng: 2.3464, duration: 60, popularity: 0.5, maxWait: 15, slot: 'any', booking: false,
    capacity: 'Amplio', hours: hours('10:00', '18:00'), tip: 'Combínalo con el Jardín de Luxemburgo.' },
  { id: 'luxembourg', name: 'Jardín de Luxemburgo', category: 'parque', lat: 48.8462, lng: 2.3372, duration: 60, popularity: 0.6, maxWait: 0, slot: 'any', booking: false,
    capacity: 'Espacio abierto', hours: hours('08:00', '20:00'), tip: 'El horario de cierre varía con la puesta de sol.' },
  { id: 'garnier', name: 'Ópera Garnier', category: 'monumento', lat: 48.872, lng: 2.3316, duration: 75, popularity: 0.65, maxWait: 25, slot: 'any', booking: true,
    capacity: 'Aforo controlado', hours: hours('10:00', '17:00'), tip: 'Puede cerrar por ensayos; revisa el calendario.' },
  { id: 'champs', name: 'Campos Elíseos', category: 'compras', lat: 48.8698, lng: 2.3075, duration: 60, popularity: 0.9, maxWait: 0, slot: 'evening', booking: false,
    capacity: 'Espacio abierto', hours: hours('00:00', '24:00'), tip: 'Precioso iluminado de noche, sobre todo en Navidad.' },
  { id: 'invalides', name: 'Los Inválidos (tumba de Napoleón)', category: 'museo', lat: 48.855, lng: 2.3125, duration: 120, popularity: 0.6, maxWait: 20, slot: 'any', booking: false,
    capacity: 'Amplio', hours: hours('10:00', '18:00'), tip: 'Museo del Ejército + tumba de Napoleón.' },
  { id: 'rodin', name: 'Museo Rodin', category: 'museo', lat: 48.8553, lng: 2.3159, duration: 90, popularity: 0.55, maxWait: 20, slot: 'any', booking: true,
    capacity: 'Medio', hours: hours('10:00', '18:30', { closed: [1] }), tip: 'El jardín de esculturas es lo mejor.' },
  { id: 'catacombes', name: 'Catacumbas', category: 'monumento', lat: 48.8339, lng: 2.3324, duration: 75, popularity: 0.8, maxWait: 90, slot: 'any', booking: true,
    capacity: 'Máx. ~200 personas a la vez', hours: hours('09:45', '20:30', { closed: [1] }), tip: 'Reserva obligatoria: se agota con días de antelación.' },
  { id: 'marais', name: 'Le Marais', category: 'barrio', lat: 48.859, lng: 2.362, duration: 120, popularity: 0.75, maxWait: 0, slot: 'afternoon', booking: false,
    capacity: 'Espacio abierto', hours: hours('00:00', '24:00'), tip: 'Abierto en domingo. Place des Vosges y falafel en Rue des Rosiers.' },
  { id: 'lafayette', name: 'Galeries Lafayette (terraza)', category: 'compras', lat: 48.8738, lng: 2.332, duration: 60, popularity: 0.8, maxWait: 0, slot: 'any', booking: false,
    capacity: 'Grande', hours: hours('10:00', '20:30', { extra: { 0: ['11:00', '20:00'] } }), tip: 'La terraza de la azotea es gratis y tiene vistas.' },
  { id: 'crucero', name: 'Crucero por el Sena', category: 'paseo', lat: 48.8638, lng: 2.3008, duration: 70, popularity: 0.7, maxWait: 20, slot: 'sunset', booking: false,
    capacity: 'Barcos de ~500 personas', hours: hours('10:00', '22:30'), tip: 'Salidas desde Pont de l\'Alma cada 30-45 min.' },
  { id: 'trocadero', name: 'Trocadéro (vista de la Torre)', category: 'mirador', lat: 48.8616, lng: 2.2893, duration: 30, popularity: 0.8, maxWait: 0, slot: 'evening', booking: false,
    capacity: 'Espacio abierto', hours: hours('00:00', '24:00'), tip: 'La mejor foto de la Torre Eiffel iluminada.' },
  { id: 'versailles', name: 'Palacio de Versalles', category: 'monumento', lat: 48.8049, lng: 2.1204, duration: 300, popularity: 0.95, maxWait: 60, slot: 'morning', booking: true,
    capacity: '~27.000 visitantes/día', hours: hours('09:00', '17:30', { closed: [1] }), tip: 'Día completo. RER C. Cierra los lunes; evita martes y domingos.' },
  { id: 'montparnasse', name: 'Torre Montparnasse (mirador)', category: 'mirador', lat: 48.8421, lng: 2.3219, duration: 60, popularity: 0.5, maxWait: 15, slot: 'sunset', booking: false,
    capacity: 'Medio', hours: hours('09:30', '23:30'), tip: 'La mejor vista CON la Torre Eiffel.' },
  { id: 'picasso', name: 'Museo Picasso', category: 'museo', lat: 48.8598, lng: 2.3625, duration: 90, popularity: 0.5, maxWait: 15, slot: 'any', booking: true,
    capacity: 'Medio', hours: hours('09:30', '18:00', { closed: [1], extra: { 0: ['10:00', '18:00'], 6: ['10:00', '18:00'] } }), tip: 'En pleno Marais.' },
  { id: 'tuileries', name: 'Jardín de las Tullerías', category: 'parque', lat: 48.8635, lng: 2.3275, duration: 45, popularity: 0.6, maxWait: 0, slot: 'any', booking: false,
    capacity: 'Espacio abierto', hours: hours('07:00', '21:00'), tip: 'Conecta el Louvre con la Concordia.' },
  { id: 'shakespeare', name: 'Shakespeare and Company', category: 'compras', lat: 48.8526, lng: 2.3471, duration: 30, popularity: 0.7, maxWait: 20, slot: 'morning', booking: false,
    capacity: 'Muy pequeño, fila en puerta', hours: hours('10:00', '20:00', { extra: { 0: ['12:00', '19:00'] } }), tip: 'Frente a Notre-Dame.' },
  { id: 'perelachaise', name: 'Cementerio Père-Lachaise', category: 'parque', lat: 48.8614, lng: 2.3933, duration: 90, popularity: 0.45, maxWait: 0, slot: 'any', booking: false,
    capacity: 'Espacio abierto', hours: hours('08:00', '18:00', { extra: { 6: ['08:30', '18:00'], 0: ['09:00', '18:00'] } }), tip: 'Tumbas de Jim Morrison, Édith Piaf, Chopin.' },
  { id: 'canal', name: 'Canal Saint-Martin', category: 'barrio', lat: 48.871, lng: 2.365, duration: 60, popularity: 0.5, maxWait: 0, slot: 'afternoon', booking: false,
    capacity: 'Espacio abierto', hours: hours('00:00', '24:00'), tip: 'Ambiente local, bares y cafés.' },
  { id: 'latino', name: 'Barrio Latino', category: 'barrio', lat: 48.8493, lng: 2.347, duration: 90, popularity: 0.6, maxWait: 0, slot: 'evening', booking: false,
    capacity: 'Espacio abierto', hours: hours('00:00', '24:00'), tip: 'Cena barata y animada en Rue Mouffetard.' },
  { id: 'alexandre', name: 'Pont Alexandre III y orillas del Sena', category: 'paseo', lat: 48.8639, lng: 2.3136, duration: 40, popularity: 0.5, maxWait: 0, slot: 'sunset', booking: false,
    capacity: 'Espacio abierto', hours: hours('00:00', '24:00'), tip: 'El puente más bonito de París.' },
  { id: 'vivienne', name: 'Galerie Vivienne (pasajes cubiertos)', category: 'compras', lat: 48.8665, lng: 2.3398, duration: 30, popularity: 0.3, maxWait: 0, slot: 'any', booking: false,
    capacity: 'Pequeño', hours: hours('08:30', '20:30'), tip: 'Ideal para un día de lluvia.' },
  { id: 'boursecommerce', name: 'Bourse de Commerce', category: 'museo', lat: 48.8628, lng: 2.3428, duration: 75, popularity: 0.5, maxWait: 15, slot: 'any', booking: true,
    capacity: 'Medio', hours: hours('11:00', '19:00', { closed: [2], extra: { 5: ['11:00', '21:00'] } }), tip: 'Arte contemporáneo; la cúpula es espectacular.' },
  { id: 'vuitton', name: 'Fundación Louis Vuitton', category: 'museo', lat: 48.8766, lng: 2.2633, duration: 120, popularity: 0.6, maxWait: 20, slot: 'any', booking: true,
    capacity: 'Medio', hours: hours('11:00', '20:00', { closed: [2] }), tip: 'Edificio de Frank Gehry en el Bois de Boulogne.' },
];
