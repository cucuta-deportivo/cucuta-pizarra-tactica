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

| Paso | Qué | Prueba principal | Estado |
| --- | --- | --- | --- |
| S1.0 | Consultas de solo lectura para conocer las tablas reales (las ejecuta el usuario) | Resultados revisados antes de S1.1 | En curso |

### PR A · Sincronización con señal (rama `sincronizacion`)

| Paso | Qué | Prueba principal | Estado |
| --- | --- | --- | --- |
| S1.1 | SQL de `alineaciones` y `schema.sql` (lo ejecuta el usuario) | `pg_policies` y columnas | Pendiente |
| S1.2 | Copia de las fichas y categoría dentro del documento | Abrir una alineación de otra categoría: no falta ninguna ficha | Pendiente |
| S1.3 | No guardar la alineación vacía inicial | Test | Pendiente |
| S1.4 | Dexie v4: marca "por subir" | Los datos antiguos siguen intactos | Pendiente |
| S1.5 | `alineacionesApi.ts`, único archivo que conoce las columnas | Tests | Pendiente |
| S1.6 | Subir pendientes con control de versión | Respuesta perdida sin copia falsa | Pendiente |
| S1.7 | Bajar cambios y resolver conflictos | Dos ventanas, misma alineación | Pendiente |
| S1.8 | Migración con respaldo y resumen | Repetirla no duplica | Pendiente |
| S1.9 | Indicador de estado | Captura con y sin red | Pendiente |
| S1.10 | Disparadores: abrir, señal, pestaña y 60 s | La tablet ve el cambio en menos de 1 min | Pendiente |
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
