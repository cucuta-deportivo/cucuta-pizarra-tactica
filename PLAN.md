# Plan pendiente · Pizarra Táctica

Lo que queda por hacer, en orden. Estados: **Pendiente**, **En curso**, **Hecho**.
Lo ya terminado está en los PR #1 y #2 (fotos en la exportación, renovación de fotos, RLS solo para entrenadores activos, acceso con usuario sin exponer correos).

## Fase 1 · Mejoras de la pizarra (rama `mejoras-pizarra`, un commit por paso, un solo PR)

| Paso | Qué | Estado |
| --- | --- | --- |
| 5 | Quitar por completo la imantación a la cuadrícula (opción en Zonas y lógica en el campo) | Hecho |
| 6 | Cambiar de formación sin mover a los jugadores: solo cambian las zonas fantasma | Hecho |
| 7 | Activar el rival sin mover a nuestros jugadores | Hecho |
| 8 | La exportación PNG/PDF incluye objetos, jugadores rivales y balón | Pendiente |
| 9 | Zonas táctiles de al menos 44 px: panel de objetos, panel de plantilla, balón y los dos enlaces del acceso (solo CSS) | Pendiente |
| 10 | Tipografía condensada (Barlow Condensed) en la exportación, en lugar de Arial | Pendiente |
| 11 | ESLint como dependencia de desarrollo y script `npm run lint` | Pendiente |
| 12 | Bundle: reducir la carga inicial (hoy 215 KB gzip, límite 250 KB) y corregir la cifra del README | Pendiente |
| 13 | Comprimir el PDF exportado para que pese poco (pensado para WhatsApp) | Pendiente |
| 14 | Exportación igual que la pantalla: iniciales o dorsal en la ficha según lo que se ve | Pendiente |
| 15 | Menor: quitar el temporizador sobrante de `PantallaPlantilla.tsx` (la renovación de enlaces ya la hace `plantillaStore` cada 30 s) | Pendiente |

## Fase 2 · Sincronización con Supabase

| Paso | Qué | Estado |
| --- | --- | --- |
| S1 | Planificar y llevar las alineaciones de IndexedDB a Supabase, para usarlas en computador y tablet | Pendiente |

## Fase 3 · Seguridad

| Paso | Qué | Estado |
| --- | --- | --- |
| Seg1 | Bloqueos falsos: `registrar_intento_login` confía en el cliente y cualquiera puede registrar 5 fallidos con el usuario de otro | Pendiente |
| Seg2 | Contadores separados: el bloqueo cuenta por el texto escrito, así que usuario y correo de la misma cuenta suman aparte | Pendiente |
