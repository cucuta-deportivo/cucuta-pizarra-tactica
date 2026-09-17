import type {
  NodoRuta,
  PuntoNormalizado,
  TipoDestinoRuta,
  TipoInterpolacionRuta,
  TrayectoriaMovimiento,
} from '../types';
import { ANCHO_CAMPO_M, LARGO_CAMPO_M } from './constantes';

/**
 * Muestras por tramo entre nodos. 24 es suficiente para que la curva se lea
 * lisa a tamaño de pantalla sin llenar de puntos la tabla de longitudes.
 */
const MUESTRAS_POR_TRAMO = 24;

/** Exponente de la parametrización centrípeta (alfa = 0.5). */
const ALFA_CENTRIPETA = 0.5;

export interface RutaMuestreada {
  /** Polilínea densa que aproxima la curva. */
  puntos: PuntoNormalizado[];
  /** A qué tramo entre puntos de control pertenece cada muestra. */
  segmentos: number[];
  /** Distancia acumulada hasta cada punto; `acumulado[i]` corresponde a `puntos[i]`. */
  acumulado: number[];
  longitud: number;
}

/** Puntos de control completos: el inicio, los nodos intermedios y el final. */
export function puntosDeControl(
  inicio: PuntoNormalizado,
  nodos: NodoRuta[],
  fin: PuntoNormalizado,
): PuntoNormalizado[] {
  return [inicio, ...nodos.map((n) => ({ x: n.x, y: n.y })), fin];
}

function distancia(a: PuntoNormalizado, b: PuntoNormalizado): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Distancia en METROS reales. Las coordenadas van de 0 a 100 en los dos ejes,
 * pero la cancha no es cuadrada (105 × 68): un punto de avance a lo largo son
 * 1,05 m y a lo ancho solo 0,68. Repartir el tiempo con la distancia sin pesar
 * hacía que un jugador en diagonal cambiase de velocidad hasta un 10% sin
 * motivo. Con esto, "20 metros en 2 segundos" significa de verdad eso.
 *
 * El eje Y es el largo de la cancha (de portería a portería) y el X el ancho,
 * que es el mismo criterio que usan las formaciones y la conversión a píxeles.
 */
function distanciaEnMetros(a: PuntoNormalizado, b: PuntoNormalizado): number {
  const dx = ((b.x - a.x) / 100) * ANCHO_CAMPO_M;
  const dy = ((b.y - a.y) / 100) * LARGO_CAMPO_M;
  return Math.hypot(dx, dy);
}

/**
 * Catmull-Rom CENTRÍPETA (Barry-Goldman) sobre cuatro puntos de control.
 *
 * Centrípeta y no uniforme a propósito: con nodos muy juntos o muy separados, la
 * versión uniforme genera lazos y picos: la curva se sale del recorrido que el
 * entrenador dibujó. La centrípeta garantiza que eso no pase.
 */
function catmullRom(
  p0: PuntoNormalizado,
  p1: PuntoNormalizado,
  p2: PuntoNormalizado,
  p3: PuntoNormalizado,
  s: number,
): PuntoNormalizado {
  const t0 = 0;
  const t1 = t0 + Math.pow(distancia(p0, p1), ALFA_CENTRIPETA);
  const t2 = t1 + Math.pow(distancia(p1, p2), ALFA_CENTRIPETA);
  const t3 = t2 + Math.pow(distancia(p2, p3), ALFA_CENTRIPETA);

  // Nodos duplicados dejarían intervalos de longitud cero: se cae al segmento recto.
  if (t1 === t0 || t2 === t1 || t3 === t2) {
    return { x: p1.x + (p2.x - p1.x) * s, y: p1.y + (p2.y - p1.y) * s };
  }

  const t = t1 + (t2 - t1) * s;
  const mezcla = (a: PuntoNormalizado, b: PuntoNormalizado, ta: number, tb: number): PuntoNormalizado => {
    const k = (tb - t) / (tb - ta);
    const j = (t - ta) / (tb - ta);
    return { x: a.x * k + b.x * j, y: a.y * k + b.y * j };
  };

  const a1 = mezcla(p0, p1, t0, t1);
  const a2 = mezcla(p1, p2, t1, t2);
  const a3 = mezcla(p2, p3, t2, t3);
  const b1 = mezcla(a1, a2, t0, t2);
  const b2 = mezcla(a2, a3, t1, t3);
  return mezcla(b1, b2, t1, t2);
}

/**
 * Convierte los puntos de control en una polilínea densa con su tabla de
 * distancias acumuladas. Esa tabla es lo que permite avanzar por DISTANCIA
 * recorrida y no por parámetro de curva: sin ella el jugador aceleraría y
 * frenaría entre nodos sin motivo, que es justo lo que se quiere evitar.
 */
export function muestrearRuta(
  control: PuntoNormalizado[],
  interpolacion: TipoInterpolacionRuta = 'catmull-rom',
): RutaMuestreada {
  const puntos: PuntoNormalizado[] = [];
  const segmentos: number[] = [];

  if (control.length <= 2 || interpolacion === 'lineal') {
    control.forEach((p, i) => {
      puntos.push({ x: p.x, y: p.y });
      segmentos.push(Math.min(i, control.length - 2));
    });
  } else {
    // Puntos fantasma por REFLEXIÓN, no por duplicado. Duplicando, la distancia
    // entre el fantasma y su vecino es cero, la parametrización centrípeta se
    // degenera y el primer y el último tramo salían rectos — justo donde más se
    // nota, al arrancar desde la ficha y al llegar al destino.
    const reflejar = (a: PuntoNormalizado, b: PuntoNormalizado): PuntoNormalizado => ({
      x: 2 * a.x - b.x,
      y: 2 * a.y - b.y,
    });
    const primero = control[0]!;
    const ultimo = control[control.length - 1]!;
    const extendido = [reflejar(primero, control[1]!), ...control, reflejar(ultimo, control[control.length - 2]!)];
    for (let i = 1; i < extendido.length - 2; i += 1) {
      const p0 = extendido[i - 1]!;
      const p1 = extendido[i]!;
      const p2 = extendido[i + 1]!;
      const p3 = extendido[i + 2]!;
      for (let m = 0; m < MUESTRAS_POR_TRAMO; m += 1) {
        puntos.push(catmullRom(p0, p1, p2, p3, m / MUESTRAS_POR_TRAMO));
        segmentos.push(i - 1);
      }
    }
    puntos.push({ ...control[control.length - 1]! });
    segmentos.push(control.length - 2);
  }

  // La tabla de longitudes va en metros, no en unidades normalizadas: es lo que
  // reparte el tiempo, y el tiempo tiene que corresponderse con la distancia
  // real que el jugador recorre sobre el césped.
  const acumulado: number[] = [0];
  let longitud = 0;
  for (let i = 1; i < puntos.length; i += 1) {
    longitud += distanciaEnMetros(puntos[i - 1]!, puntos[i]!);
    acumulado.push(longitud);
  }
  return { puntos, segmentos, acumulado, longitud };
}

/**
 * Posición a lo largo de la ruta, con `t` de 0 a 1 medido en distancia
 * recorrida: a `t = 0.5` se ha recorrido la mitad del camino, no se ha llegado
 * al nodo del medio.
 */
export function posicionEnRuta(ruta: RutaMuestreada, t: number): PuntoNormalizado {
  const { puntos, acumulado, longitud } = ruta;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (!primero || !ultimo) return { x: 0, y: 0 };
  if (longitud === 0) return { ...primero };
  if (t <= 0) return { ...primero };
  if (t >= 1) return { ...ultimo };

  const objetivo = t * longitud;
  // Búsqueda binaria: la tabla puede tener cientos de entradas y esto se
  // ejecuta una vez por ficha y por fotograma.
  let bajo = 0;
  let alto = acumulado.length - 1;
  while (alto - bajo > 1) {
    const medio = (bajo + alto) >> 1;
    if (acumulado[medio]! <= objetivo) bajo = medio;
    else alto = medio;
  }
  const desde = puntos[bajo]!;
  const hasta = puntos[alto]!;
  const tramo = acumulado[alto]! - acumulado[bajo]!;
  const local = tramo === 0 ? 0 : (objetivo - acumulado[bajo]!) / tramo;
  return { x: desde.x + (hasta.x - desde.x) * local, y: desde.y + (hasta.y - desde.y) * local };
}

/** Busca la trayectoria de un elemento concreto dentro de un frame. */
export function trayectoriaDe(
  trayectorias: TrayectoriaMovimiento[] | undefined,
  tipo: TipoDestinoRuta,
  id: string,
): TrayectoriaMovimiento | undefined {
  if (!trayectorias) return undefined;
  return trayectorias.find((t) => identificadorDe(t, tipo) === id);
}

/** El identificador que lleva una ruta según a qué tipo de actor pertenece. */
export function identificadorDe(ruta: TrayectoriaMovimiento, tipo: TipoDestinoRuta): string | undefined {
  if (tipo === 'titular') return ruta.jugadorId;
  if (tipo === 'rival') return ruta.jugadorRivalId;
  if (tipo === 'balon') return ruta.balonId;
  return ruta.objetoId;
}

/** A qué tipo de actor pertenece una ruta, deducido de qué identificador trae. */
export function tipoDeTrayectoria(ruta: TrayectoriaMovimiento): TipoDestinoRuta | undefined {
  if (ruta.jugadorId) return 'titular';
  if (ruta.jugadorRivalId) return 'rival';
  if (ruta.balonId) return 'balon';
  if (ruta.objetoId) return 'objeto';
  return undefined;
}

/** Deja el identificador en el campo que corresponde al tipo de elemento. */
export function destinoDeTrayectoria(tipo: TipoDestinoRuta, id: string): Partial<TrayectoriaMovimiento> {
  if (tipo === 'titular') return { jugadorId: id };
  if (tipo === 'rival') return { jugadorRivalId: id };
  if (tipo === 'balon') return { balonId: id };
  return { objetoId: id };
}

/** Lo que tarda una ruta, sin poder pasarse de lo que dura el tramo entre fases. */
export function duracionDeRuta(ruta: TrayectoriaMovimiento, duracionTramoMs: number): number {
  const propia = ruta.duracionMs;
  if (typeof propia !== 'number' || !Number.isFinite(propia) || propia <= 0) return duracionTramoMs;
  // Pasarse del tramo haría que el actor no llegara a su destino antes de la
  // fase siguiente y diera un salto al cruzarla.
  return Math.min(propia, duracionTramoMs);
}

export interface ContextoAvance {
  /** Avance dentro del tramo, de 0 a 1, SIN curva de easing aplicada. */
  progresoLineal: number;
  /** Lo que dura el tramo entre las dos fases. */
  duracionTramoMs: number;
  /** Curva de la jugada; se aplica al avance propio de cada ruta, no al del tramo. */
  curva: (t: number) => number;
}

/**
 * Avance de un actor dentro de SU trayectoria. Con una duración propia más
 * corta que el tramo, el actor llega antes y se queda esperando en su destino:
 * es lo que permite que un jugador tarde 2 s y otro 3 s en el mismo paso.
 */
export function avanceDeRuta(ruta: TrayectoriaMovimiento, contexto: ContextoAvance): number {
  const duracion = duracionDeRuta(ruta, contexto.duracionTramoMs);
  if (duracion <= 0) return contexto.curva(1);
  const transcurrido = contexto.progresoLineal * contexto.duracionTramoMs;
  return contexto.curva(Math.min(1, transcurrido / duracion));
}

/**
 * Sustituye la posición interpolada en línea recta por la de la ruta, en los
 * elementos que tengan una. Los demás se quedan como estaban.
 */
export function aplicarRutas<T extends { x: number; y: number }>(
  interpolados: T[],
  desde: T[],
  hasta: T[],
  claveDe: (elemento: T) => string,
  trayectorias: TrayectoriaMovimiento[] | undefined,
  tipo: TipoDestinoRuta,
  contexto: ContextoAvance,
): T[] {
  if (!trayectorias || trayectorias.length === 0) return interpolados;
  const origenPorId = new Map(desde.map((e) => [claveDe(e), e]));
  const destinoPorId = new Map(hasta.map((e) => [claveDe(e), e]));

  return interpolados.map((elemento) => {
    const clave = claveDe(elemento);
    const ruta = trayectoriaDe(trayectorias, tipo, clave);
    if (!ruta || ruta.nodos.length === 0) return elemento;
    const origen = origenPorId.get(clave);
    const destino = destinoPorId.get(clave);
    if (!origen || !destino) return elemento;
    const muestreada = muestrearRuta(puntosDeControl(origen, ruta.nodos, destino), ruta.interpolacion);
    const punto = posicionEnRuta(muestreada, avanceDeRuta(ruta, contexto));
    return { ...elemento, x: punto.x, y: punto.y };
  });
}

/**
 * Busca el punto de la ruta más cercano a uno dado y en qué tramo cae.
 *
 * Es lo que permite tocar la línea entre dos nodos e insertar uno ahí, en vez
 * de que todos los nodos se añadan siempre al final del recorrido.
 */
export function segmentoEnPunto(
  ruta: RutaMuestreada,
  punto: PuntoNormalizado,
): { indiceSegmento: number; distancia: number; puntoEnRuta: PuntoNormalizado } | null {
  if (ruta.puntos.length === 0) return null;
  let mejor = 0;
  let mejorDistancia = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ruta.puntos.length; i += 1) {
    const d = distancia(ruta.puntos[i]!, punto);
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejor = i;
    }
  }
  return {
    indiceSegmento: ruta.segmentos[mejor] ?? 0,
    distancia: mejorDistancia,
    puntoEnRuta: ruta.puntos[mejor]!,
  };
}

/**
 * Dos puntos de la ruta a uno y otro lado de `t`, para sacar de ellos hacia
 * dónde mira el actor. Se toman separados por una fracción fija del recorrido y
 * no por muestras contiguas: así el ángulo sale ya suavizado y no tiembla
 * cuando la curva tiene tramos casi rectos.
 *
 * Devuelve puntos en coordenadas de campo; el ángulo hay que calcularlo tras
 * convertirlos a píxeles, porque el campo intercambia ejes según su orientación.
 */
export function puntosTangente(ruta: RutaMuestreada, t: number): [PuntoNormalizado, PuntoNormalizado] {
  const VENTANA = 0.04;
  const antes = posicionEnRuta(ruta, Math.max(0, t - VENTANA));
  const despues = posicionEnRuta(ruta, Math.min(1, t + VENTANA));
  return [antes, despues];
}

/** Ángulo en grados de un desplazamiento ya expresado en píxeles de pantalla. */
export function anguloEnGrados(desde: PuntoNormalizado, hasta: PuntoNormalizado): number | null {
  const dx = hasta.x - desde.x;
  const dy = hasta.y - desde.y;
  // Un desplazamiento minúsculo no define una dirección: mejor no girar nada
  // que hacer girar al jugador sobre sí mismo por ruido de un par de píxeles.
  if (Math.hypot(dx, dy) < 1.5) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Trozo de la ruta ya recorrido hasta `t`, para pintar la estela. Se corta la
 * polilínea por distancia y se remata con el punto exacto, de modo que la
 * huella termina justo bajo el actor y no en la muestra anterior.
 */
export function recorridoHasta(ruta: RutaMuestreada, t: number): PuntoNormalizado[] {
  // Al arrancar todavía no se ha recorrido nada: no hay huella que dejar.
  if (ruta.puntos.length === 0 || ruta.longitud === 0 || t <= 0) return [];
  const recorrido = Math.min(1, t) * ruta.longitud;
  const trozo: PuntoNormalizado[] = [];
  for (let i = 0; i < ruta.puntos.length; i += 1) {
    if (ruta.acumulado[i]! > recorrido) break;
    trozo.push(ruta.puntos[i]!);
  }
  const final = posicionEnRuta(ruta, t);
  const ultimo = trozo[trozo.length - 1];
  // El remate solo se añade si aporta algo: justo sobre una muestra, repetir el
  // punto dejaría un segmento de longitud cero.
  if (!ultimo || ultimo.x !== final.x || ultimo.y !== final.y) trozo.push(final);
  return trozo;
}
