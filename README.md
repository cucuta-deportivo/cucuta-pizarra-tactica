# Cúcuta Deportivo · Pizarra Táctica

Pizarra táctica digital para el cuerpo técnico del Cúcuta Deportivo: elegir formación, asignar jugadores desde el banquillo, moverlos libremente sobre el campo, dibujar jugadas y guardar múltiples alineaciones. Pensada para dos escenarios reales: escritorio en la oficina y tablet en modo apaisado en el banquillo.

## Decisiones de arquitectura

- **Stack**: React 18 + TypeScript estricto + Vite. Tailwind CSS para estilos con los tokens del club (`club.rojo`, `club.negro`, `club.cesped`, etc.) definidos en [tailwind.config.ts](tailwind.config.ts). Zustand para estado global, con una pila de deshacer/rehacer propia basada en Immer ([src/store/historial.ts](src/store/historial.ts)). `@dnd-kit/core` para arrastrar y soltar (soporte nativo de puntero/táctil y teclado).
- **Persistencia (Decisión 1)**: IndexedDB vía Dexie, aislada tras la interfaz `AlineacionRepository` ([src/data/repositorio](src/data/repositorio)). Si `indexedDB` no está disponible (por ejemplo, dentro de un artefacto de Claude), se usa automáticamente un repositorio en memoria (`MemoriaAlineacionRepository`) con el mismo contrato, y la exportación/importación JSON sirve de respaldo manual. El cambio de una implementación a otra no toca ningún componente de UI.
- **Fotos de jugadores (Decisión 3)**: iniciales sobre degradado rojinegro por defecto, con subida de archivo opcional (v2) desde ⋯ → "Gestionar plantilla". La imagen se recorta al cuadrado central en un `<canvas>` del propio navegador ([src/utils/imagen.ts](src/utils/imagen.ts)) y se guarda como JPEG en IndexedDB (`fotosRepository`, mismo patrón que `AlineacionRepository`), nunca se envía a terceros.
- **Coordenadas**: todo se guarda normalizado en porcentaje (0–100), nunca en píxeles. La única conversión a píxeles ocurre en `useCampoEscala()` ([src/hooks/useCampoEscala.ts](src/hooks/useCampoEscala.ts)), consumido por todos los componentes vía contexto.
- **Rendimiento del arrastre**: las tarjetas de jugador se mueven solo con `transform: translate3d()` (nunca `top`/`left`), el estado de arrastre vive en refs de dnd-kit (no en `useState` del árbol), y `TarjetaJugador` está memoizada. La capa de dibujo usa dos `<canvas>` superpuestos (uno estático con los trazos confirmados, otro temporal para el trazo en curso) actualizados dentro de `requestAnimationFrame`.

## Requisitos previos

- Node.js 20+ y npm.

## Instalación

```bash
npm install
```

## Ejecución en desarrollo

```bash
npm run dev
```

Abre la URL que imprime Vite (por defecto `http://localhost:5173`). Prueba especialmente en una ventana apaisada de ancho tablet (≥1024 px) y en modo vertical (<640 px) para ver los dos layouts.

## Pruebas

```bash
npm run typecheck   # cero errores de TypeScript, obligatorio
npm run lint        # ESLint: cero errores; las advertencias se revisan aparte
npm run test        # Vitest: conversiones de coordenadas, pila de deshacer/rehacer,
                     # y el flujo completo formación → asignación → arrastre → guardado → recarga
```

**Verificación manual en dispositivo táctil real** (no automatizable): en un iPad en modo apaisado, confirmar que arrastrar una tarjeta no hace scroll de la página ni activa el zoom de pellizco, que las áreas táctiles son cómodas (≥44×44 px) y que Safari no tiene errores de consola.

## Build de producción

```bash
npm run build      # tsc -b && vite build → genera dist/
npm run preview     # sirve dist/ localmente para verificarlo
```

La carga inicial (el chunk de entrada) pesa ~204 KB gzip, por debajo del presupuesto de 250 KB; lo más pesado es el cliente de Supabase (~59 KB), React (~46 KB) y Dexie (~33 KB). Las ventanas secundarias (alineaciones, historial, plantilla, comparar, zonas, rival, cancha, exportar y actividad de la cuenta) van en trozos aparte, ~20 KB gzip en total, que se descargan justo después de pintar la pizarra (el de actividad, al abrirla). jsPDF (~118 KB gzip) solo se descarga al exportar a PDF.

## Despliegue

El front-end sigue siendo un sitio 100% estático (el backend es Supabase, no un servidor propio). Cualquier hosting de archivos estáticos sirve:

- **Vercel / Netlify**: comando de build `npm run build`, directorio de salida `dist`. Definir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables de entorno del proyecto para habilitar FA6–FA8 (ver "Puesta en marcha de Supabase" más abajo); sin ellas, la app funciona igual pero sin pedir login.
- **Servidor propio**: copiar el contenido de `dist/` tras `npm run build` a cualquier servidor HTTP estático (Nginx, Caddy, etc.), sirviendo `index.html` para todas las rutas (SPA de una sola pantalla, no hay rutas adicionales que configurar). Las variables `VITE_SUPABASE_*` se resuelven en tiempo de build, no en tiempo de ejecución del servidor.

## Estructura del proyecto

Ver [src/](src/), organizada como se describe en el pliego: `components/{campo,jugador,pizarra,ui}`, `hooks/`, `store/`, `data/{repositorio,formaciones,plantillaSemilla}`, `types/`, `utils/`.

## Funciones de v2 ya incluidas

- **Fotos de jugador**: ⋯ → "Gestionar plantilla", subir/cambiar/quitar foto por jugador (recorte automático, guardado local).
- **Notas por jugador**: clic derecho (o pulsación larga) sobre un jugador en el campo → "Añadir nota…"; se ve un indicador 📝 en su tarjeta con la nota al pasar el cursor.
- **Historial visual con etiquetas**: cada cambio (asignar, mover, intercambiar, dibujar…) queda etiquetado en `historial.etiquetaPresente`; el botón 🕐 en la barra superior abre la línea de tiempo completa y permite saltar directo a cualquier paso, no solo deshacer de uno en uno. Deshacer/rehacer (↶ ↷) ahora están siempre visibles en la barra superior, no solo en modo dibujo.
- **Modo comparación**: ⋯ → "Comparar alineaciones" muestra dos alineaciones guardadas lado a lado (campo, jugadores y trazos, en modo solo lectura) para decidir entre planes antes de usarlos.

## Anexo A — funciones tácticas ya incluidas (FA1–FA5)

Todas viven en el mismo `DocumentoTactico`/`Alineacion` (se guardan, deshacen y exportan junto con la alineación) y son 100% cliente. Los tableros guardados antes de esta versión se migran solos al cargarlos (`documentoDesdeAlineacion` en [src/store/alineacionStore.ts](src/store/alineacionStore.ts) rellena los campos nuevos con valores por defecto).

- **FA1 — Objetos de entrenamiento**: botón ⬢ "Objetos" en la barra inferior abre el flyout (7 tipos, 5 colores, herramientas de distribución Fila/Slalom/Rejilla marcando dos puntos). Seleccionado, un objeto muestra botones de rotar (↻, solo maniquí/mini-portería) y duplicar (⧉). Soltar fuera del campo lo borra con un toast "Deshacer". Atajos: `C` cono, `Del`/`Backspace` borra el seleccionado, `Esc` sale del modo.
- **FA2 — Balón**: hasta 5, el primero ya está en el campo al crear una alineación. Arrastrarlo sobre un jugador lo ancla (se mueve con él); arrastrarlo fuera lo libera. Doble clic/toque lo devuelve al centro. Atajo `B` añade uno.
- **FA3 — Cuadrícula y zonas**: botón ▦ "Zonas" activa/desactiva (toque corto) o abre sus opciones (pulsación larga / clic derecho): 7 presets, opacidad, estilo de línea, etiquetas. Con la cuadrícula visible, tocar una celda la pinta (cicla rojo → ámbar → azul → vacío). Atajo `G` cicla un subconjunto rápido de presets.
- **FA4 — Equipo rival**: botón 🆚 "Rival" (mismo gesto corto/largo que Zonas). Formación independiente con zonas fantasma en gris, jugadores *ad hoc* (solo dorsal + apellido opcional), paleta propia, modos de vista (`Solo nosotros`/`Ambos`/`Solo rival`). "Marcar a…" en el menú contextual de un jugador propio traza una línea de marcaje hasta un rival (tocarla la borra). Atajos: `R` muestra/oculta, `Shift+R` gira la pizarra 180°.
- **FA5 — Identidad de cancha**: ⋯ → "🏟️ Cancha": 4 temas (Estadio con escudo/vallas/franjas rojinegras sutiles, Neutro, Entrenamiento, Táctico) y 3 vistas (completo/medio campo/tercio ofensivo, recortando la relación de aspecto sin deformar nada — ver `VentanaRecorte` en [src/utils/coordenadas.ts](src/utils/coordenadas.ts)).

**Simplificaciones deliberadas frente al anexo original**, documentadas para una v3: la Rejilla de FA1 se define marcando dos esquinas en vez de arrastrar una viva; cambiar de formación rival vacía sus jugadores en vez de reubicarlos zona a zona; y combinar "vista" recortada con "girar 180°" a la vez puede mostrar un recorte poco intuitivo (son dos transformaciones de coordenadas independientes, cada una correcta por separado).

## Anexo A — cuentas de usuario ya incluidas (FA6–FA8)

Login, registro e historial de accesos, con **Supabase** como backend (Postgres + Auth). El cliente solo usa la clave pública `anon`; toda operación con privilegios (resolver usuario→correo, comprobar bloqueo por intentos fallidos, registrar un intento de acceso, aprobar una cuenta) pasa por funciones Postgres `SECURITY DEFINER` con `RLS` habilitado en las tres tablas — la clave `anon` nunca toca las tablas directamente salvo lo que las políticas permiten explícitamente.

- **FA6 — Login**: [PantallaAcceso.tsx](src/components/auth/PantallaAcceso.tsx). Entrar con usuario o correo, mostrar/ocultar contraseña, "Recordar este dispositivo" (alterna `localStorage`/`sessionStorage` para la sesión de Supabase), recuperación de contraseña por enlace de correo (mensaje siempre genérico, no revela si el correo existe). Bloqueo tras 5 intentos fallidos en 15 minutos (`verificar_bloqueo_usuario`). Cierre de sesión automático tras 12 h de inactividad.
- **FA7 — Registro**: [FormularioRegistro.tsx](src/components/auth/FormularioRegistro.tsx). Nombre, usuario (con comprobación de disponibilidad en vivo), correo, contraseña con medidor de fortaleza ([MedidorFortaleza.tsx](src/components/auth/MedidorFortaleza.tsx)), rol y código de invitación opcional. Sin código válido, la cuenta queda `pendiente` hasta que un entrenador la aprueba (`aprobar_usuario`); **la primera cuenta creada en el proyecto se activa sola como entrenador** para evitar quedarse sin forma de aprobar a nadie.
- **FA8 — Historial de accesos**: [PanelActividad.tsx](src/components/auth/PanelActividad.tsx), desde ⋯ → "Actividad de la cuenta". Sesión actual + botón para cerrar todas las demás sesiones; lista paginada (20 por página, scroll infinito) de `intentos_login` agrupada por día con encabezados fijos; filtros por rango de fechas, solo fallidos y solo este dispositivo; IP enmascarada con botón para revelarla; exportar a CSV; hora relativa y absoluta (`America/Bogota` por defecto, con opción de usar la hora del dispositivo); aviso en pantalla si el último acceso viene de un dispositivo no visto antes.

**Simplificaciones deliberadas**: no hay envío de correo de alerta ante un dispositivo nuevo (solo el aviso dentro de la app — enviar correo requeriría credenciales de un servicio de email que no se proporcionaron); "cerrar sesión" en otros dispositivos revoca *todas* las demás sesiones a la vez (`signOut({scope:'others'})`), no una por una, porque el SDK de Supabase no expone un listado de sesiones activas individuales sin la `service_role key`; la IP/ciudad/país se resuelven con un servicio público de terceros (`ipapi.co`) de forma best-effort y no bloqueante — si el club prefiere no enviar la IP del usuario a un tercero, basta con no llamar a `obtenerDatosIp()` en [src/store/authStore.ts](src/store/authStore.ts).

### Puesta en marcha de Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Abrir el **SQL Editor** del proyecto y ejecutar el contenido completo de [supabase/schema.sql](supabase/schema.sql) una sola vez (crea las tablas `perfiles`, `codigos_invitacion`, `intentos_login`, las funciones `SECURITY DEFINER`, las políticas RLS y siembra el código de invitación `CUCUTA-2026`).
3. Copiar [.env.example](.env.example) a `.env.local` y completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los datos de **Project Settings → API** del proyecto (la clave pública/`anon`, nunca la `service_role`).
4. En hosting (Vercel/Netlify/etc.), definir esas mismas dos variables de entorno en la configuración del proyecto.

Si estas variables no están definidas, la app sigue funcionando con normalidad **sin pedir login** (`supabaseConfigurado` queda en `false` y `AuthGate` deja pasar directo a la pizarra) — útil para desarrollar FA1–FA5 sin depender de Supabase.

**Límite de correos del SMTP por defecto**: mientras no se configure un proveedor SMTP propio, Supabase usa su servicio de correo compartido, limitado a ~2 correos de confirmación por hora por proyecto. Registrar varias cuentas seguidas (por ejemplo, dar de alta a todo el cuerpo técnico el mismo día) agota ese límite y las siguientes altas devuelven `429` en `/auth/v1/signup` hasta que se resetea (más o menos una hora) — no es un error de la app. Antes de un uso real con varias personas, configurar un proveedor SMTP propio (Resend, SendGrid, Postmark…) en **Authentication → Settings → SMTP Settings** del dashboard de Supabase quita ese límite.

## Fuera de alcance

- Estadísticas avanzadas, heatmaps o análisis de datos de partido.
- Simulación o animación de jugadas en movimiento (la pizarra es de dibujo estático).
- Multiusuario en tiempo real.
- App móvil nativa.

## Recomendaciones para una v3

1. **Notas por trazo**: hoy las notas viven ancladas al jugador; podría añadirse una nota corta anclada a un trazo individual de la pizarra (además de la herramienta de texto ya existente).
2. **Exportar la comparación**: permitir exportar a PNG la vista de comparación de dos alineaciones, no solo la pizarra activa.
3. **Miniaturas en "Alineaciones guardadas"**: mostrar un mini-campo (como en el selector de formación) junto a cada fila de la lista, para reconocer una alineación de un vistazo sin abrirla.
4. **Rejilla FA1 con arrastre en vivo**: sustituir el "marcar dos esquinas" por arrastrar una esquina con vista previa en tiempo real, tal como describe el anexo.
5. **Revocación de sesión por dispositivo**: si más adelante se añade una función Edge con la `service_role key`, se podría listar y revocar sesiones activas una por una en vez de "todas las demás a la vez" (ver simplificación de FA8 arriba).
