# Pizarra Táctica · Cúcuta Deportivo

Aplicación web de pizarra táctica para el cuerpo técnico de las categorías formativas del Cúcuta Deportivo (sub-13, sub-15, sub-17, sub-17B, sub-20). Se usa en escritorio (oficina) y en tablet apaisada (vestuario y banquillo).

## Stack
- React 18 + TypeScript en modo estricto + Vite
- Tailwind CSS
- Zustand para el estado
- @dnd-kit para arrastrar y soltar
- Supabase (plan gratuito): login de entrenadores, base de datos y storage
- Despliegue en Vercel (equipo del club). Repositorio: `cucuta-pizarra-tactica` (organización del club)

## Reglas del producto (no romper)
- El campo es un SVG que ocupa al menos el 70 % del viewport.
- Al elegir una formación se muestran zonas fantasma. **Nunca** se colocan jugadores automáticamente.
- El arrastre es libre, sin imantación a la cuadrícula.
- Capa de dibujo vectorial (flechas, líneas, zonas) con deshacer y rehacer.
- Varias alineaciones guardadas, con autoguardado.
- Exportación a PNG, PDF y JSON. Las fotos de los jugadores deben salir en la imagen exportada.
- Coordenadas normalizadas de 0 a 100 en los dos ejes, nunca en píxeles.
- Presupuesto del bundle: menos de 250 KB gzip.

## Seguridad y datos
- Las fotos de los jugadores solo las ven los entrenadores con sesión iniciada. Se guardan en un bucket privado de Supabase y se sirven con URLs firmadas.
- Todas las tablas llevan Row Level Security activado.
- Nunca subir claves al repositorio. El cliente solo usa la `anon key`. La `service role key` no va en el frontend.

## Identidad visual
- Rojo #D4111E y negro #111111, interfaz oscura estilo FIFA / EA FC.
- Tipografía condensada: Barlow Condensed, Oswald o Archivo.
- Botones y zonas táctiles de al menos 44 px (uso en tablet).

## Forma de trabajar
1. Antes de escribir código, presenta un plan de 10 a 15 líneas y espera mi confirmación.
2. Cambios pequeños, un archivo o una función a la vez.
3. Después de cada cambio visual o de interacción, pruébalo en el navegador (Playwright) y revisa una captura.
4. Ejecuta `npm run build` y el linter antes de dar algo por terminado.
5. No agregues librerías nuevas sin preguntarme.
6. Mensajes de commit cortos y en español.
