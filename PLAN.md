# Plan pendiente · Pizarra Táctica

Lo que queda por hacer, en orden. Estados: **Pendiente**, **En curso**, **Hecho**.
Lo ya terminado está en los PR #1 y #2 (fotos en la exportación, renovación de fotos, RLS solo para entrenadores activos, acceso con usuario sin exponer correos).

## Fase 1 · Mejoras de la pizarra (un commit por paso; pasos 5–10 en `mejoras-pizarra`, PR #3; pasos 11–15 en `calidad-pizarra`, un solo PR)

| Paso | Qué | Estado |
| --- | --- | --- |
| 5 | Quitar por completo la imantación a la cuadrícula (opción en Zonas y lógica en el campo) | Hecho |
| 6 | Cambiar de formación sin mover a los jugadores: solo cambian las zonas fantasma | Hecho |
| 7 | Activar el rival sin mover a nuestros jugadores | Hecho |
| 7b | Al activar el rival, acción "Acomodar mi equipo en mi mitad" (y/2) y, al quitarlo, "Extender mi equipo por todo el campo" (y×2): un toque, nadie se mueve solo, se puede deshacer | Hecho |
| 8 | La exportación PNG/PDF incluye objetos, jugadores rivales y balón | Hecho |
| 8b | En la ventana de exportar, casillas para elegir qué sale en PNG/PDF: rival, balón, objetos y dibujos (solo las de lo que hay en el campo, todas marcadas por defecto, 44 px; el JSON siempre lleva todo) | Hecho |
| 9 | Zonas táctiles de al menos 44 px: panel de objetos, panel de plantilla, balón, los controles de las pantallas de acceso y registro, "Vista" del rival y "Orientación del campo" (solo CSS) | Hecho |
| 10 | Tipografía condensada (Barlow Condensed) en la exportación, en lugar de Arial | Hecho |
| 11 | ESLint como dependencia de desarrollo y script `npm run lint` (0 errores; quedan 7 advertencias por revisar) | Hecho |
| 12 | Bundle: reducir la carga inicial (218 → 204 KB gzip, límite 250 KB: las ventanas secundarias van en trozos aparte) y corregir la cifra del README | Hecho |
| 13 | Comprimir el PDF exportado para que pese poco (pensado para WhatsApp): de 11,3 MB a unos 150 KB, la imagen va en JPEG | Hecho |
| 14 | Exportación igual que la pantalla: iniciales o dorsal en la ficha según lo que se ve, y las líneas de marcaje (solo las que tienen sus dos jugadores en la imagen) | Hecho |
| 15 | Menor: quitar el temporizador sobrante de `PantallaPlantilla.tsx` (la renovación de enlaces ya la hace `plantillaStore` cada 30 s) | Hecho |
| 16 | Actualizar jspdf (va en producción) para resolver sus avisos críticos de `npm audit`: de 2.5.2 a 4.2.1, también resuelve los de DOMPurify; PNG y PDF comprobados | Hecho |

## Fase 2 · Sincronización con Supabase

| Paso | Qué | Estado |
| --- | --- | --- |
| S1 | Planificar y llevar las alineaciones de IndexedDB a Supabase, para usarlas en computador y tablet. Decidir aquí si se quita realtime del cliente de Supabase (hoy sin uso, ~17 KB gzip de la carga inicial) o si la sincronización lo aprovecha | Pendiente |

## Fase 3 · Seguridad

| Paso | Qué | Estado |
| --- | --- | --- |
| Seg1 | Bloqueos falsos: `registrar_intento_login` confía en el cliente y cualquiera puede registrar 5 fallidos con el usuario de otro | Pendiente |
| Seg2 | Contadores separados: el bloqueo cuenta por el texto escrito, así que usuario y correo de la misma cuenta suman aparte | Pendiente |
