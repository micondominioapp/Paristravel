# 🗼 París a mi ritmo

App web (funciona en el celular, sin instalar nada) para organizar un viaje a París:

- **📌 Lugares** – 32 lugares de París precargados (Torre Eiffel, Louvre, Orsay, Notre-Dame, Versalles, Montmartre, Catacumbas…) con horarios, días de cierre, duración sugerida y consejos.
  **Agregar cualquier otro lugar es automático:** escribes solo el nombre (“Café de Flore”, “Musée Carnavalet”) y la app busca en OpenStreetMap la ubicación, el tipo de lugar, el horario de cada día y qué tan popular es. Si OSM no tiene el horario, pone uno típico para ese tipo de lugar y lo marca como “estimado”. Los restaurantes y cafés que agregues se usan como tu almuerzo o cena.
  Si buscas una cadena en una zona (“starbucks ópera”), la app ubica la zona y te muestra los locales más cercanos a ella, con la distancia.
  Cada lugar muestra **foto** (Wikipedia / Wikimedia Commons; si no hay foto libre, un mapa del punto exacto), **dirección, código postal y distrito (arrondissement)**, y un enlace para ver más fotos en Google Maps.
  Puedes escribir en **francés, español o inglés** (“Musée du Louvre”, “Tour Eiffel”, “Château de Versailles”): la búsqueda ignora acentos y palabras como de/du/la.
- **📌 Reservas con hora fija** – al agregar un lugar desde la búsqueda puedes elegir ahí mismo el día, la hora y la prioridad; o después, a cualquier lugar elegido puedes ponerle día y hora (una reserva en un restaurante, una entrada con horario). El plan lo deja exactamente a esa hora y ordena todo lo demás alrededor para que llegues a tiempo. En **⚡ Ahora** te avisa de tu próxima reserva y a qué hora salir, y no te recomienda nada que te haga llegar tarde. A cada uno le pones prioridad (*Imprescindible / Me gustaría / Si da tiempo*) y momento preferido (mañana, tarde, noche, atardecer).
- **✈️ Viaje** – fecha y hora de llegada y salida, hotel, a qué hora empiezas y terminas el día, si te mueves a pie o en metro y si reservas hora de almuerzo.
- **🗓️ Plan** – arma automáticamente el itinerario día por día **agrupando lo que está cerca**: forma zonas a pie
  (ej. Sacré-Cœur + Montmartre + Moulin Rouge; Ópera + Galeries Lafayette), reparte las zonas entre los días según
  el tiempo disponible, mejora el reparto moviendo e intercambiando lugares entre días, y ordena cada día para
  caminar lo menos posible. Además: respeta horarios y cierres (p. ej. el Louvre no abre los martes), minimiza traslados, evita las horas de más aforo, programa los miradores al atardecer y deja lo que no cabe en una lista con el motivo. Mapa con la ruta del día, botón **“Cómo llegar”** (Google Maps) y **“Replanificar desde aquí”**, que usa tu ubicación y la hora actual para reordenar lo que te falta.
- **⚡ Ahora** – detecta tu ubicación (GPS) y te dice **a dónde ir en este momento**: abierto, cerca, con menos aforo, y si conviene ir más tarde (“Mejor a las 18:30, aforo 30%”).

## Precios y entradas gratis

Cada lugar muestra **tu precio** según lo que elijas en ✈️ Viaje (residente o no de la UE, y edad), porque desde
enero de 2026 el Louvre, Versalles, la Sainte-Chapelle y la Ópera Garnier cobran más a visitantes de fuera de la UE.
También muestra quién entra gratis, los **días gratis para todos** (1er domingo del mes, 1er viernes por la noche en
el Louvre, etc.) y cuáles caen en tu viaje, opciones de entrada, el enlace a la web oficial y consejos de visitantes.

El planificador **aprovecha los días gratis** cuando ahorras €10 o más (si no cabe ese día, lo programa en otro),
tiene en cuenta que esos días hay más gente, suma el **gasto por día y total** y calcula si te conviene el
**Paris Museum Pass**. Para restaurantes y cafés agregados por búsqueda da un rango estimado según el tipo de local.

Precios investigados en noviembre de 2026 en webs oficiales y guías (louvre.fr, toureiffel.paris, musee-orsay.fr,
Visit Paris Region, Centre des monuments nationaux y prensa). Los marcados “aprox.” no se pudieron confirmar en la
web oficial. **Confirma siempre antes de comprar.**

## 🧭 Asistente

- **Cómo llegar a tu alojamiento:** eliges dónde llegas (CDG, Orly, Beauvais o una estación de tren/bus), cuántas
  personas sois y cuánto equipaje llevas, y la app compara todas las opciones con precios 2026 (RER B, bus exprés
  9517 + metro 14, buses 350/351, Noctilien de noche, metro 14 y tranvía T7 desde Orly, Aérobus desde Beauvais,
  taxi de precio fijo según la orilla del Sena, Uber), marca la recomendada, la más barata y la más rápida, avisa
  si a esa hora no funciona y da los pasos y la ruta. Con eso calcula sola cuánto tardas desde que aterrizas hasta
  el hotel y a qué hora salir hacia el vuelo; ambos aparecen en el plan.
- **Desde donde estoy hasta mi alojamiento:** a pie, metro o taxi desde tu ubicación.
- **Pregúntale a Claude:** chat con Claude (modelo `claude-opus-5-5`, con búsqueda web para huelgas, horarios y
  precios del día). Con cada pregunta la app le pasa la hora, tu ubicación, tu alojamiento, tu llegada, el plan de
  hoy y los traslados calculados. Necesita una clave de la API de Anthropic (platform.claude.com) que se guarda
  **solo en ese dispositivo**; cada pregunta cuesta unos céntimos. Si el modelo rechaza una pregunta, la API la
  reintenta sola con otro modelo (`fallbacks: "default"`). El SDK oficial (`@anthropic-ai/sdk` 1.3.0) va incluido
  en `js/vendor/` (licencia Apache 2.0).

## Imprescindibles

Lo que marques como **⭐ Imprescindible** siempre entra en el plan: si no cabe, se le hace sitio quitando lo de menor
prioridad (primero lo de “Si da tiempo”) y lo quitado se intenta llevar a otro día. Si aun así es imposible (cerrado
todos los días o más largo que tu jornada), el plan explica el motivo.

## Mi viaje en todos mis dispositivos

El viaje se guarda en este mismo repositorio, en el archivo `viaje.json` de la rama **`datos`** (aparte de la app,
así no se vuelve a publicar la web en cada cambio). **Cualquiera que abra la app ve ese viaje automáticamente**
(leer es público). Para **guardar cambios** desde un dispositivo, en ✈️ Viaje → “Mi viaje en todos mis dispositivos”
se pega una clave de GitHub (*fine-grained token*) con acceso solo a este repositorio y permiso
*Contents: Read and write*; la app trae un enlace que deja el formulario casi rellenado. La app sube los cambios
sola y busca cambios de otros dispositivos al abrirse, al volver a ella y cada 2 minutos (gana el cambio más reciente).

⚠️ El repositorio es público: el viaje (incluido el nombre del hotel) es visible para cualquiera.

## Compartir el itinerario

En **🗓️ Plan** (o en **✈️ Viaje**) toca **🔗 Compartir viaje** y envía el enlace por WhatsApp. Quien lo abra
ve el mismo itinerario: fechas, hotel, lugares elegidos, prioridades y lugares agregados. El viaje va
comprimido dentro del propio enlace, así que no hace falta servidor ni cuenta. Si cambias algo, envía el enlace de nuevo.

## Aforo

Los monumentos de París no publican su aforo en vivo de forma abierta, así que la app lo **estima** con:
hora del día (curva típica por tipo de lugar), día de la semana, temporada, el atardecer (miradores) y efectos
cruzados conocidos (el Louvre se llena los lunes porque Orsay cierra, y Orsay los martes porque cierra el Louvre).
Con eso calcula un % de aforo y la fila estimada. Cuando estás en un lugar puedes **reportar el aforo real**
(vacío / normal / lleno) y la app lo usa durante 90 minutos para sus recomendaciones.

> Los horarios son aproximados y cambian por temporada: confírmalos en la web oficial antes de ir.

## Usarla

Es HTML + JavaScript sin compilación. Todo se guarda en el propio teléfono (localStorage); puedes exportar e importar el viaje.

```bash
npm start      # servidor local en http://localhost:8080
npm test       # pruebas del planificador
```

Para tenerla en el celular, publícala con **GitHub Pages** (Settings → Pages → rama `main`, carpeta raíz).
Abre la URL en el teléfono y elige “Agregar a pantalla de inicio”: funciona como app y sin conexión (la ubicación requiere HTTPS, que GitHub Pages ya da).

## Estructura

- `js/data.js` – catálogo de lugares, horarios y curvas de aforo.
- `js/osm.js` – búsqueda automática en OpenStreetMap y lectura de horarios (`opening_hours`).
- `js/match.js` – búsqueda de nombres en varios idiomas.
- `js/photos.js` – fotos desde Wikipedia/Wikimedia y mapa de respaldo.
- `js/prices.js` – precios, gratuidades y Paris Museum Pass.
- `js/transport.js` – traslados aeropuerto/estación ↔ alojamiento (tarifas 2026).
- `js/assistant.js` – chat con Claude (SDK oficial en `js/vendor/`).
- `js/sync.js` – sincronización del viaje con GitHub (rama `datos`).
- `js/share.js` – enlace para compartir el viaje.
- `js/planner.js` – motor: tiempos de traslado, aforo, puesta de sol, armado del itinerario y recomendaciones.
- `js/app.js` – interfaz.
- `tests/` – pruebas (`npm test`).
- `scripts/bench.mjs` – compara la calidad de los planes (traslado total, lugares cercanos separados, lugares fuera).
