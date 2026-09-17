import type { TipoEasing } from '../types';

/** Milisegundos de una transición cuando el frame no dice otra cosa. */
export const DURACION_TRANSICION_MS = 1200;

/** Límites de la duración por fase que ofrece la interfaz. */
export const DURACION_MINIMA_MS = 200;
export const DURACION_MAXIMA_MS = 8000;

export function interpolar(desde: number, hasta: number, t: number): number {
  return desde + (hasta - desde) * t;
}

/**
 * Interpola ángulos en grados por el camino corto: de 350° a 10° son 20° hacia
 * adelante, no 340° hacia atrás. Sin esto, un maniquí al que se le cruza el
 * origen daría una vuelta completa en mitad de la jugada.
 */
export function interpolarAngulo(desde: number, hasta: number, t: number): number {
  const diferencia = (((hasta - desde) % 360) + 540) % 360 - 180;
  return desde + diferencia * t;
}

/**
 * Curvas de movimiento. Un desplazamiento lineal delata que es una animación;
 * con arranque y frenada suaves se lee como un jugador que acelera y llega a su
 * sitio, que es por lo que 'entrada-salida' es el valor por defecto.
 */
export const CURVAS_EASING: Record<TipoEasing, (t: number) => number> = {
  lineal: (t) => t,
  entrada: (t) => t * t * t,
  salida: (t) => 1 - Math.pow(1 - t, 3),
  'entrada-salida': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export const EASING_POR_DEFECTO: TipoEasing = 'entrada-salida';

export const ETIQUETAS_EASING: Record<TipoEasing, string> = {
  lineal: 'Lineal',
  entrada: 'Arranque suave',
  salida: 'Frenada suave',
  'entrada-salida': 'Suave',
};

/** Aplica la curva pedida; si no se indica ninguna, la de por defecto. */
export function suavizar(t: number, easing: TipoEasing = EASING_POR_DEFECTO): number {
  return (CURVAS_EASING[easing] ?? CURVAS_EASING[EASING_POR_DEFECTO])(t);
}

/**
 * Interpola dos listas emparejando por id: lo que no está en el destino se
 * queda quieto. La rotación, si el elemento la tiene, va por el camino corto.
 */
export function interpolarPorId<T extends { x: number; y: number; rotacion?: number }>(
  desde: T[],
  hasta: T[],
  claveDe: (elemento: T) => string,
  t: number,
): T[] {
  const destinoPorId = new Map(hasta.map((elemento) => [claveDe(elemento), elemento]));
  return desde.map((elemento) => {
    const destino = destinoPorId.get(claveDe(elemento));
    if (!destino) return elemento;
    const interpolado = {
      ...elemento,
      x: interpolar(elemento.x, destino.x, t),
      y: interpolar(elemento.y, destino.y, t),
    };
    if (typeof elemento.rotacion === 'number' && typeof destino.rotacion === 'number') {
      interpolado.rotacion = interpolarAngulo(elemento.rotacion, destino.rotacion, t);
    }
    return interpolado;
  });
}

/** Duración de la transición que arranca en este frame. */
export function duracionDeFrame(frame: { duracionMs?: number } | undefined): number {
  const valor = frame?.duracionMs;
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return DURACION_TRANSICION_MS;
  return Math.min(DURACION_MAXIMA_MS, Math.max(DURACION_MINIMA_MS, valor));
}

/**
 * Duración total de la jugada. El último frame no aporta: su duración sería la
 * de una transición que no existe.
 */
export function duracionTotal(frames: { duracionMs?: number }[]): number {
  return frames.slice(0, -1).reduce((total, frame) => total + duracionDeFrame(frame), 0);
}

/** Milisegundos desde el arranque de la jugada hasta el comienzo de ese frame. */
export function tiempoHastaFrame(frames: { duracionMs?: number }[], indice: number): number {
  return frames.slice(0, Math.max(0, indice)).reduce((total, frame) => total + duracionDeFrame(frame), 0);
}

/**
 * Traduce un instante de la jugada a "en qué fase estoy y por dónde voy dentro
 * de ella". Es lo que permite arrastrar la barra de progreso a cualquier punto
 * y no solo saltar de fase en fase.
 */
export function ubicacionEnTiempo(
  frames: { duracionMs?: number }[],
  tiempoMs: number,
): { indice: number; progreso: number } {
  if (frames.length === 0) return { indice: 0, progreso: 0 };
  const instante = Math.min(Math.max(0, tiempoMs), duracionTotal(frames));
  let acumulado = 0;
  for (let indice = 0; indice < frames.length - 1; indice += 1) {
    const duracion = duracionDeFrame(frames[indice]);
    if (instante < acumulado + duracion) return { indice, progreso: (instante - acumulado) / duracion };
    acumulado += duracion;
  }
  // Al final de la jugada se descansa en la última fase, sin transición pendiente.
  return { indice: frames.length - 1, progreso: 0 };
}

/** Formato de cronómetro `mm:ss.cc`, como en una mesa de edición de vídeo. */
export function formatearTiempo(ms: number): string {
  const totalCentesimas = Math.max(0, Math.round(ms / 10));
  const minutos = Math.floor(totalCentesimas / 6000);
  const segundos = Math.floor((totalCentesimas % 6000) / 100);
  const centesimas = totalCentesimas % 100;
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(minutos)}:${dos(segundos)}.${dos(centesimas)}`;
}
