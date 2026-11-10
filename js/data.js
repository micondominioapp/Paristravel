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
  comida: { label: 'Comida', icon: '🍽️' },
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
  comida: { 8: 0.3, 9: 0.35, 10: 0.3, 11: 0.4, 12: 0.85, 13: 1, 14: 0.75, 15: 0.4, 16: 0.4, 17: 0.5, 18: 0.6, 19: 0.85, 20: 1, 21: 0.95, 22: 0.7, 23: 0.5 },
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

// Otros nombres (francés, inglés y comunes) para encontrar cada lugar escribiendo como quieras.
const ALIASES = {
  eiffel: ['Tour Eiffel', 'Eiffel Tower', 'La Tour Eiffel'],
  louvre: ['Musée du Louvre', 'Louvre Museum', 'Le Louvre'],
  orsay: ["Musée d'Orsay", 'Orsay Museum'],
  notredame: ['Cathédrale Notre-Dame de Paris', 'Notre Dame Cathedral', 'Catedral de Notre Dame'],
  saintechapelle: ['La Sainte-Chapelle', 'Santa Capilla'],
  arc: ['Arc de Triomphe', "Arc de Triomphe de l'Étoile", 'Arco de Triunfo', 'Place Charles de Gaulle'],
  sacrecoeur: ['Basilique du Sacré-Cœur', 'Sacre Coeur', 'Sagrado Corazón', 'Basilica Sagrado Corazon'],
  montmartre: ['Place du Tertre', 'Butte Montmartre'],
  orangerie: ["Musée de l'Orangerie", 'Orangerie', 'Nenúfares de Monet', 'Nymphéas'],
  pantheon: ['Panthéon', 'Pantheon'],
  luxembourg: ['Jardin du Luxembourg', 'Luxembourg Gardens', 'Jardines de Luxemburgo'],
  garnier: ['Opéra Garnier', 'Palais Garnier', 'Opera de Paris', 'Ópera de París'],
  champs: ['Avenue des Champs-Élysées', 'Champs Elysees', 'Campos Eliseos'],
  invalides: ['Les Invalides', "Hôtel des Invalides", "Musée de l'Armée", 'Tombeau de Napoléon', 'Tumba de Napoleón'],
  rodin: ['Musée Rodin', 'Rodin Museum'],
  catacombes: ['Catacombes de Paris', 'Catacombs', 'Catacumbas de París'],
  marais: ['Le Marais', 'Place des Vosges', 'Rue des Rosiers'],
  lafayette: ['Galeries Lafayette Haussmann', 'Galerías Lafayette'],
  crucero: ['Bateaux Mouches', 'Bateaux Parisiens', 'Croisière sur la Seine', 'Seine River Cruise', 'Paseo en barco'],
  trocadero: ['Trocadéro', 'Place du Trocadéro', 'Palais de Chaillot', 'Jardins du Trocadéro'],
  versailles: ['Château de Versailles', 'Palace of Versailles', 'Versalles'],
  montparnasse: ['Tour Montparnasse', 'Montparnasse 56'],
  picasso: ['Musée Picasso', 'Musée national Picasso-Paris'],
  tuileries: ['Jardin des Tuileries', 'Tuileries Garden', 'Tullerías'],
  shakespeare: ['Shakespeare & Company', 'Librería Shakespeare'],
  perelachaise: ['Cimetière du Père-Lachaise', 'Pere Lachaise', 'Cementerio Pere Lachaise'],
  canal: ['Canal Saint Martin'],
  latino: ['Quartier Latin', 'Latin Quarter', 'Rue Mouffetard'],
  alexandre: ['Pont Alexandre-III', 'Puente Alejandro III', 'Quais de Seine'],
  vivienne: ['Galerie Vivienne', 'Passages couverts', 'Pasajes cubiertos'],
  boursecommerce: ['Bourse de Commerce', 'Pinault Collection'],
  vuitton: ['Fondation Louis Vuitton', 'Louis Vuitton Foundation'],
};
for (const p of PLACES) p.aliases = ALIASES[p.id] || [];

PLACES.push({
  id: 'starbucksopera', name: 'Starbucks Opéra (Boulevard des Capucines)', category: 'comida', lat: 48.8705, lng: 2.3316,
  duration: 45, popularity: 0.7, maxWait: 15, slot: 'any', booking: false, capacity: 'Café grande, se llena por las fotos',
  hours: hours('08:00', '21:00'), hoursEstimated: true,
  tip: 'El famoso Starbucks “palacio” con techos pintados y lámparas de cristal, a pasos de la Ópera Garnier. Horario aproximado.',
});
ALIASES.starbucksopera = ['Starbucks Opera', 'Starbucks Capucines', 'Starbucks Boulevard des Capucines'];
PLACES.at(-1).aliases = ALIASES.starbucksopera;

// Código postal, dirección y artículo de Wikipedia (francés) para la foto.
const INFO = {
  eiffel: ['75007', 'Champ de Mars, 5 Av. Anatole France', 'Tour Eiffel'],
  louvre: ['75001', 'Rue de Rivoli', 'Musée du Louvre'],
  orsay: ['75007', "1 Rue de la Légion d'Honneur", "Musée d'Orsay"],
  notredame: ['75004', '6 Parvis Notre-Dame – Pl. Jean-Paul II', 'Cathédrale Notre-Dame de Paris'],
  saintechapelle: ['75001', '10 Boulevard du Palais', 'Sainte-Chapelle'],
  arc: ['75008', 'Place Charles de Gaulle', "Arc de triomphe de l'Étoile"],
  sacrecoeur: ['75018', '35 Rue du Chevalier de la Barre', 'Basilique du Sacré-Cœur de Montmartre'],
  montmartre: ['75018', 'Place du Tertre', 'Place du Tertre'],
  orangerie: ['75001', 'Jardin des Tuileries, Place de la Concorde', "Musée de l'Orangerie"],
  pantheon: ['75005', 'Place du Panthéon', 'Panthéon (Paris)'],
  luxembourg: ['75006', 'Rue de Médicis / Rue de Vaugirard', 'Jardin du Luxembourg'],
  garnier: ['75009', "Place de l'Opéra", 'Opéra Garnier'],
  champs: ['75008', 'Avenue des Champs-Élysées', 'Avenue des Champs-Élysées'],
  invalides: ['75007', '129 Rue de Grenelle', 'Hôtel des Invalides'],
  rodin: ['75007', '77 Rue de Varenne', 'Musée Rodin'],
  catacombes: ['75014', '1 Av. du Colonel Henri Rol-Tanguy', 'Catacombes de Paris'],
  marais: ['75004', 'Place des Vosges / Rue des Rosiers', 'Le Marais'],
  lafayette: ['75009', '40 Boulevard Haussmann', 'Galeries Lafayette Haussmann'],
  crucero: ['75008', "Port de la Conférence (Pont de l'Alma)", 'Bateaux-Mouches'],
  trocadero: ['75016', 'Place du Trocadéro', 'Place du Trocadéro-et-du-11-Novembre'],
  versailles: ['78000', "Place d'Armes, Versailles", 'Château de Versailles'],
  montparnasse: ['75015', '33 Avenue du Maine', 'Tour Montparnasse'],
  picasso: ['75003', '5 Rue de Thorigny', 'Musée Picasso (Paris)'],
  tuileries: ['75001', 'Place de la Concorde / Rue de Rivoli', 'Jardin des Tuileries'],
  shakespeare: ['75005', '37 Rue de la Bûcherie', 'Shakespeare and Company (librairie)'],
  perelachaise: ['75020', '16 Rue du Repos', 'Cimetière du Père-Lachaise'],
  canal: ['75010', 'Quai de Valmy / Quai de Jemmapes', 'Canal Saint-Martin'],
  latino: ['75005', 'Rue Mouffetard', 'Quartier latin'],
  alexandre: ['75008', 'Pont Alexandre III', 'Pont Alexandre-III'],
  vivienne: ['75002', '6 Rue Vivienne', 'Galerie Vivienne'],
  boursecommerce: ['75001', '2 Rue de Viarmes', 'Bourse de commerce de Paris'],
  vuitton: ['75116', '8 Avenue du Mahatma Gandhi', 'Fondation Louis-Vuitton'],
  starbucksopera: ['75002', '3 Boulevard des Capucines', null],
};
for (const p of PLACES) {
  const [postcode, address, wiki] = INFO[p.id] || [];
  Object.assign(p, { postcode, address, wikipedia: wiki ? `fr:${wiki}` : null });
}

// ---------------- Precios (investigados en noviembre de 2026) ----------------
// adult = precio adulto para visitantes de fuera de la UE/EEE; eea = residentes UE/EEE (si es distinto).
// approx = precio no confirmado en la web oficial. Confírmalo siempre en "web" antes de comprar.
const WINTER = [10, 11, 0, 1, 2]; // nov–mar
const U18_EEA = ['u18', 'eea26'];
const PRICES = {
  eiffel: { adult: 36.7, freeFor: ['u4'], web: 'https://www.toureiffel.paris',
    options: ['Cima en ascensor €36,70', '2º piso en ascensor €23,50', 'Escaleras al 2º piso + ascensor a la cima ≈ €28', 'Jóvenes de 12 a 24: tarifa reducida', 'Nuevos precios desde el 11/01/2027 (algo más caros)'],
    people: 'Muchos visitantes dicen que la vista del 2º piso es más bonita que la de la cima (la ciudad se ve más cerca). Compra con semanas de antelación.' },
  louvre: { adult: 32, eea: 22, freeFor: U18_EEA, pass: true, web: 'https://www.louvre.fr',
    freeRules: [{ type: 'firstFridayEvening', from: 18 * 60, exceptMonths: [6, 7] }, { type: 'date', md: '07-14', label: '14 de julio' }],
    note: 'Desde el 14/01/2026 los visitantes de fuera de la UE pagan €32. Franja horaria obligatoria incluso si es gratis o con Museum Pass.',
    people: 'La sala de la Mona Lisa es un caos; ve primero a otras alas o a última hora. Los viernes de noche gratis se llenan.' },
  orsay: { adult: 16, freeFor: U18_EEA, pass: true, web: 'https://www.musee-orsay.fr',
    freeRules: [{ type: 'firstSunday', booking: true }],
    options: ['En línea €16 · en taquilla €14', 'Jueves desde las 18:00: €12 en línea'],
    people: 'El reloj gigante del 5º piso es la foto típica. Los jueves por la noche hay menos gente.' },
  notredame: { free: true, web: 'https://www.notredamedeparis.fr',
    options: ['Catedral: gratis (reserva opcional de franja)', 'Torres: €16 solo en línea (incluidas en Museum Pass)', 'Tesoro: ≈ €12'],
    people: 'Reservar la franja gratuita ahorra mucha fila. Las torres se agotan; resérvalas con tiempo.' },
  saintechapelle: { adult: 22, eea: 16, freeFor: U18_EEA, pass: true, web: 'https://www.sainte-chapelle.fr',
    note: 'Desde enero de 2026 los visitantes de fuera de la UE pagan €22.',
    people: 'Los vitrales impresionan mucho más en un día soleado. La fila de seguridad del Palacio de Justicia puede ser larga.' },
  arc: { adult: 16, freeFor: U18_EEA, pass: true, web: 'https://www.paris-arc-de-triomphe.fr',
    seasons: [{ months: [3, 4, 5, 6, 7, 8], adult: 21 }],
    freeRules: [{ type: 'firstSunday', months: WINTER }],
    options: ['Oct–mar: €16 en línea / €17 en taquilla', 'Abr–sep: €21 en línea / €22 en taquilla', 'Los miércoles, tarifa baja todo el año'],
    people: 'Son 284 escalones hasta la terraza. Al anochecer, la vista de los Campos Elíseos iluminados es lo mejor.' },
  sacrecoeur: { free: true, options: ['Basílica: gratis', 'Cúpula ≈ €8 (en taquilla)', 'Cripta ≈ €4'],
    people: 'La vista desde la escalinata ya es gratis. Cuidado con los vendedores de pulseras de la subida.' },
  montmartre: { free: true },
  orangerie: { adult: 12.5, freeFor: U18_EEA, pass: true, web: 'https://www.musee-orangerie.fr',
    freeRules: [{ type: 'firstSunday', booking: true }],
    people: 'Visita corta y tranquila (1 h). Combínala con las Tullerías.' },
  pantheon: { adult: 13, freeFor: U18_EEA, pass: true, approx: true, web: 'https://www.paris-pantheon.fr',
    freeRules: [{ type: 'firstSunday', months: WINTER }],
    options: ['€13 en línea · €14–16 en taquilla', 'Domingo gratis de nov–mar: por confirmar en la web oficial'] },
  luxembourg: { free: true },
  garnier: { adult: 25, freeFor: ['u18'], web: 'https://www.operadeparis.fr/visites/palais-garnier',
    options: ['Visita libre €25 (fuera de la UE)', 'Residentes UE: tarifa más baja con justificante', 'Visita guiada €35 (fuera de la UE)'],
    note: 'Desde 2026 hay tarifa distinta para visitantes de fuera de la UE. No está en el Museum Pass.',
    people: 'La gran escalinata y el techo de Chagall valen la pena. Puede cerrar por ensayos: revisa el calendario.' },
  champs: { free: true },
  invalides: { adult: 17, freeFor: U18_EEA, pass: true, approx: true, web: 'https://www.musee-armee.fr',
    freeRules: [{ type: 'date', md: '07-14', label: '14 de julio' }],
    options: ['Incluye tumba de Napoleón y Museo del Ejército'] },
  rodin: { adult: 13, freeFor: U18_EEA, pass: true, approx: true, web: 'https://www.musee-rodin.fr',
    freeRules: [{ type: 'firstSunday', months: [9, 10, 11, 0, 1, 2] }],
    options: ['€13 (algunas fuentes dicen €14)'],
    people: 'El jardín con El Pensador es lo mejor; si hace buen tiempo dedícale tiempo.' },
  catacombes: { adult: 31, web: 'https://www.catacombes.paris.fr',
    options: ['€31 con audioguía/casco inmersivo', 'Reducida (18–26) €25', '8–17 años €15', 'Menores de 8: gratis'],
    note: 'Reabrieron el 8/04/2026 con recorrido nuevo. Las entradas salen a la venta solo 7 días antes y se agotan.',
    people: 'Unas 240 escaleras y 1 h bajo tierra a 14 °C: lleva abrigo ligero y calzado cómodo.' },
  marais: { free: true },
  lafayette: { free: true, options: ['Terraza de la azotea: gratis'] },
  crucero: { adult: 17, approx: true, web: 'https://www.bateaux-mouches.fr',
    options: ['Paseo de 1 h: ≈ €17–19 adulto', 'Almuerzo o cena a bordo: desde ≈ €85–99'],
    people: 'Al atardecer o de noche, con la Torre iluminada, es cuando más vale la pena.' },
  trocadero: { free: true },
  versailles: { adult: 25, eea: 22, freeFor: U18_EEA, pass: true, web: 'https://www.chateauversailles.fr',
    seasons: [{ months: [3, 4, 5, 6, 7, 8, 9], adult: 35, eea: 32 }],
    freeRules: [{ type: 'firstSunday', months: WINTER }],
    options: ['Pasaporte (palacio + Trianon + jardines): €25 nov–mar / €35 abr–oct (fuera de la UE)', 'Residentes UE: €22 / €32', 'Jardines gratis salvo días de Grandes Eaux (fuentes musicales)'],
    note: 'Franja horaria obligatoria para entrar al palacio. Domingo gratis de nov–mar: verifícalo en la web oficial.',
    people: 'Martes y domingos son los días más llenos. Llega a la apertura; los jardines son enormes (hay bicis y carritos).' },
  montparnasse: { closed: true, note: 'El mirador cerró el 31/03/2026 por obras durante varios años.' },
  picasso: { adult: 16, freeFor: U18_EEA, pass: true, web: 'https://www.museepicassoparis.fr',
    freeRules: [{ type: 'firstSunday' }] },
  tuileries: { free: true },
  shakespeare: { free: true, options: ['Entrar es gratis; el café de al lado cobra aparte'],
    people: 'Muy pequeña: suele haber fila en la puerta y no se permiten fotos dentro.' },
  perelachaise: { free: true },
  canal: { free: true },
  latino: { free: true },
  alexandre: { free: true },
  vivienne: { free: true },
  boursecommerce: { adult: 18, approx: true, web: 'https://www.pinaultcollection.com',
    freeRules: [{ type: 'firstSaturdayEvening', from: 17 * 60 }],
    options: ['≈ €18–20 según exposición', 'Combinada con Fundación Louis Vuitton: €38'] },
  vuitton: { adult: 16, approx: true, web: 'https://www.fondationlouisvuitton.fr',
    options: ['≈ €16–22 según la exposición', 'Combinada con Bourse de Commerce: €38'] },
  starbucksopera: { range: [5, 10], unit: 'por persona',
    people: 'Se viene por la decoración (techos pintados y lámparas); los precios son los normales de Starbucks.' },
};
for (const p of PLACES) if (PRICES[p.id]) p.price = PRICES[p.id];

// El mirador de Montparnasse está cerrado por obras desde el 31/03/2026.
{
  const mp = PLACES.find((p) => p.id === 'montparnasse');
  mp.hours = Array(7).fill(null);
  mp.name = 'Torre Montparnasse (mirador) — cerrado por obras';
  mp.tip = 'Cerró el 31 de marzo de 2026 por obras de renovación durante varios años. Alternativa: la terraza gratis de las Galeries Lafayette.';
}
