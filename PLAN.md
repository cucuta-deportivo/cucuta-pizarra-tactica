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
| 11 | ESLint como dependencia de desarrollo y script `npm run lint` (0 errores; queda 1 advertencia a propósito: el `any` de Google Picker en `selectorDrive.ts`) | Hecho |
| 12 | Bundle: reducir la carga inicial (218 → 204 KB gzip, límite 250 KB: las ventanas secundarias van en trozos aparte) y corregir la cifra del README | Hecho |
| 13 | Comprimir el PDF exportado para que pese poco (pensado para WhatsApp): de 11,3 MB a unos 150 KB, la imagen va en JPEG | Hecho |
| 14 | Exportación igual que la pantalla: iniciales o dorsal en la ficha según lo que se ve, y las líneas de marcaje (solo las que tienen sus dos jugadores en la imagen); también la insignia de capitán y el mismo orden de capas que en pantalla. En pantalla, los marcajes ya no se ven si su rival o su jugador están ocultos | Hecho |
| 15 | Menor: quitar el temporizador sobrante de `PantallaPlantilla.tsx` (la renovación de enlaces ya la hace `plantillaStore` cada 30 s) | Hecho |
| 16 | Actualizar jspdf (va en producción) para resolver sus avisos críticos de `npm audit`: de 2.5.2 a 4.2.1, también resuelve los de DOMPurify; PNG y PDF comprobados | Hecho |
| 16b | Herramientas de desarrollo por sus avisos de `npm audit`: vite 5 → 7.3.7, vitest 2 → 4.1.12, `@vitejs/plugin-react` 4.7.0 y `npm audit fix` (source-map-js, postcss-selector-parser). Quedan 11 avisos moderados de la cadena de ESLint (minimatch), solo de desarrollo y sin arreglo compatible | Hecho |

## Fase 2 · Sincronización con Supabase (S1, en curso)

Objetivo: que las alineaciones se vean igual en el computador de la oficina y en la tablet del banquillo, compartidas entre todos los entrenadores activos.

Cómo funciona: IndexedDB sigue siendo la copia de trabajo de cada dispositivo y Supabase es el punto de encuentro. Un sincronizador sube y baja en segundo plano. Cada alineación es una fila con todo su documento en `jsonb` y una versión que asigna el servidor; las tablas `alineacion_jugadores` y `alineacion_objetos` dejan de hacer falta.

Decisiones aprobadas el 2026-11-06:

- **Conflictos:** nada se pisa. El primero que sube se queda con la alineación y el otro conserva su trabajo como copia. Si un dispositivo borra y otro edita, gana la edición, que queda como copia.
- **Realtime:** no se usa en S1 y se queda en el paquete; quitarlo obligaría a reemplazar `createClient`. La app comprueba cambios al abrir, al volver a la pestaña, al volver la señal y cada 60 s mientras se ve.
- **Autenticación:** permiso para tocar `AuthGate.tsx` y `authStore.ts` solo para entrar sin red con una sesión ya abierta y aplicar la regla de 12 h solo con conexión.
- **Service worker:** `vite-plugin-pwa` como dependencia de desarrollo. Cuando hay versión nueva pregunta antes de recargar: nunca recarga sola durante un partido. No guarda fotos ni datos de Supabase.
- **Fotos:** no se guardan en el dispositivo. Sin señal salen iniciales y dorsal, también en lo exportado.
- **Tablet:** modelo sin confirmar; se asume que puede ser iPad. En iPad hay que instalar la app en la pantalla de inicio para que Safari no borre los datos locales.
- **Migración:** nada se borra de IndexedDB, se ofrece un respaldo JSON antes de subir y las "Alineación inicial" totalmente vacías no se suben.
- **Respaldo:** el plan gratuito no incluye backups; respaldo mensual a mano, guardado en un lugar privado del club (ver README).
- **Borrado:** los entrenadores activos pueden leer, crear y editar alineaciones, pero no borrarlas: no hay política DELETE y se retiró ese permiso. Borrar es marcar `eliminada_en`; el borrado real solo desde el SQL Editor. La función `tocar_actualizado_en()` se conserva porque la usa `jugadores`.

| Paso | Qué | Prueba principal | Estado |
| --- | --- | --- | --- |
| S1.0 | Consultas de solo lectura para conocer las tablas reales (las ejecuta el usuario): las tres tablas estaban vacías y el esquema era igual a `schema.sql` | Resultados revisados antes de S1.1 | Hecho |

### PR A · Sincronización con señal (rama `sincronizacion`)

| Paso | Qué | Prueba principal | Estado |
| --- | --- | --- | --- |
| S1.1 | SQL de `alineaciones` y `schema.sql` (lo ejecuta el usuario): columnas `documento`, `version`, `ultimo_cambio`, `eliminada_en` y `actualizada_por`; versión, fecha y autores por trigger; leer, crear y editar sí, borrar no. Aplicado el 2026-11-08 | Columnas, políticas, triggers, restricciones y permisos comprobados; pasaron las dos pruebas de funcionamiento (alta en versión 1, edición a versión 2, conflicto sin cambios, borrado bloqueado y nada guardado sin cuenta activa) | Hecho |
| S1.2 | Copia de las fichas y categoría dentro del documento. Las fichas no incluyen a los personalizados, que ya viajan enteros, y no se ofrecen en las listas para elegir. La categoría es la activa al crear la alineación; las anteriores quedan sin ella | Abrir una alineación de otra categoría: no falta ninguna ficha (campo, banquillo, comparar y JSON) | Hecho |
| S1.2b | Que los jugadores personalizados de la alineación abierta no desaparezcan del campo al recargar la plantilla. La plantilla los guarda aparte y los vuelve a añadir al recargarse o al cambiar de categoría; al abrir otra alineación salen los de la anterior. Reproducido en la prueba de S1.6 (11 de 11 al importar, 0 de 11 tras recargar) | Tests de recarga, cambio de categoría y cambio de alineación; navegador con Supabase real: 11 de 11 tras recargar la página y tras cambiar de categoría | Hecho |
| S1.3 | No guardar la alineación vacía inicial: se guarda con el primer cambio | Test y navegador: al abrir sin alineaciones no se guarda nada; al renombrarla, sí | Hecho |
| S1.3b | Al borrar la última alineación, la vacía que se abre tampoco se guarda hasta el primer cambio: es la misma "Alineación inicial" del arranque. Antes se guardaba y, con la sincronización, se subía a la lista compartida | Test; navegador con Supabase real: al borrar la última no se guarda ni se sube nada; con el primer cambio, sí | Hecho |
| S1.4 | Dexie v4: marca "por subir" en la misma transacción que guarda; borrar deja una marca de borrado. Las alineaciones anteriores quedan sin marca (las sube S1.8) | Los datos antiguos siguen intactos: datos de la app de `main` (v3) abiertos con la v4, idénticos | Hecho |
| S1.5 | `alineacionesApi.ts`, único archivo que conoce las columnas: alta con el mismo id, cambios y borrado marcado solo desde la versión de la que parten, estado, lista paginada, descarga en tandas y última actualización. Nunca sube enlaces firmados | Tests de cómo se arma y se lee cada fila y de cómo se interpretan las respuestas (sin red); las llamadas reales se prueban contra Supabase en S1.6 | Hecho |
| S1.6 | Subir lo pendiente de una en una, cada cambio desde la versión de la que parte. Cada subida lleva un identificador guardado antes de enviarla: si se pierde la respuesta, el servidor la reconoce como propia; si después se editó, primero se averigua si llegó. Si otro dispositivo la cambió, no se escribe nada y queda en conflicto (lo resuelve S1.7). Borrar contra editar: gana la edición. Sube 5 s después del último guardado, solo con cuenta de entrenador activo | Tests con un servidor falso y prueba contra Supabase real: alta, edición, respuesta cortada y editada después (una sola fila, con lo último), conflicto sin tocar el servidor, borrar contra editar y borrado marcado | Hecho |
| S1.7 | Bajar lo que cambió en otros dispositivos: se lista el estado de todas y solo se descarga lo que cambió. Sin cambios aquí, la versión nueva reemplaza la local; si es la abierta, se carga sola con aviso y se reinicia el deshacer. Con cambios aquí sin subir, el primero se queda: lo de aquí pasa a "Nombre (copia tablet 9 nov 18:40)", se sube como nueva y la pizarra sigue en ella con un aviso fijo. Borrada en otro dispositivo: se borra aquí, y si había cambios, quedan como copia. Lo que no aparece en el servidor no se toca. La pizarra guarda desde la revisión que abrió: si la copia local cambió por debajo, lo suyo pasa a copia en vez de pisarla. Se sincroniza al abrir la app y tras cada guardado | Tests con dos dispositivos falsos y prueba contra Supabase real con dos perfiles (oficina y tablet táctil): alta recibida al abrir, versión nueva cargada con aviso, conflicto con copia de la tablet y la copia borrada en la oficina mientras la tablet la tenía abierta; los dos terminan iguales | Hecho |
| S1.8 | Migración con respaldo y resumen | Repetirla no duplica | Pendiente |
| S1.9 | Indicador de estado | Captura con y sin red | Pendiente |
| S1.10 | Disparadores: volver la señal, volver a la pestaña y cada 60 s (al abrir ya sincroniza desde S1.7) | La tablet ve el cambio en menos de 1 min | Pendiente |
| S1.14a | Prueba final con señal en dos dispositivos, borrar las tablas hijas si siguen vacías, README y PLAN.md | Dos dispositivos reales | Pendiente |

### PR B · Sin señal (rama propia desde `main`, cuando se fusione el PR A)

| Paso | Qué | Prueba principal | Estado |
| --- | --- | --- | --- |
| S1.11 | Service worker con `vite-plugin-pwa`: archivos de la app y fuentes, actualización que pregunta | Recargar sin red; una versión nueva pregunta y no recarga sola | Pendiente |
| S1.12 | Plantilla guardada localmente, sin fotos | Cambiar un jugador sin red | Pendiente |
| S1.13 | Entrar sin red con sesión ya abierta y regla de 12 h solo con conexión (autenticación) | Sesión caducada, 12 h y cuenta bloqueada | Pendiente |
| S1.14b | Prueba final en la tablet real en modo avión, README y PLAN.md | Tablet real en modo avión | Pendiente |

Fuera de S1: filtro por categoría en la lista, papelera, unir cambios de dos versiones y editar la plantilla sin red.

## Fase 3 · Seguridad

| Paso | Qué | Estado |
| --- | --- | --- |
| Seg1 | Bloqueos falsos: `registrar_intento_login` confía en el cliente y cualquiera puede registrar 5 fallidos con el usuario de otro | Pendiente |
| Seg2 | Contadores separados: el bloqueo cuenta por el texto escrito, así que usuario y correo de la misma cuenta suman aparte | Pendiente |
