# 🗼 París a mi ritmo

App web (funciona en el celular, sin instalar nada) para organizar un viaje a París:

- **📌 Lugares** – 32 lugares de París precargados (Torre Eiffel, Louvre, Orsay, Notre-Dame, Versalles, Montmartre, Catacumbas…) con horarios, días de cierre, duración sugerida y consejos. Puedes **agregar tus propios lugares** buscando la dirección o con tu ubicación actual. A cada uno le pones prioridad (*Imprescindible / Me gustaría / Si da tiempo*) y momento preferido (mañana, tarde, noche, atardecer).
- **✈️ Viaje** – fecha y hora de llegada y salida, hotel, a qué hora empiezas y terminas el día, si te mueves a pie o en metro y si reservas hora de almuerzo.
- **🗓️ Plan** – arma automáticamente el itinerario día por día: respeta horarios y cierres (p. ej. el Louvre no abre los martes), minimiza traslados, evita las horas de más aforo, programa los miradores al atardecer y deja lo que no cabe en una lista con el motivo. Mapa con la ruta del día, botón **“Cómo llegar”** (Google Maps) y **“Replanificar desde aquí”**, que usa tu ubicación y la hora actual para reordenar lo que te falta.
- **⚡ Ahora** – detecta tu ubicación (GPS) y te dice **a dónde ir en este momento**: abierto, cerca, con menos aforo, y si conviene ir más tarde (“Mejor a las 18:30, aforo 30%”).

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
- `js/planner.js` – motor: tiempos de traslado, aforo, puesta de sol, armado del itinerario y recomendaciones.
- `js/app.js` – interfaz.
- `tests/` – pruebas (`node --test`).
