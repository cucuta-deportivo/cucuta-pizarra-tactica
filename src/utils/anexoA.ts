import type { ColorCelda, CuadriculaCampo, EquipoRival, IdentidadCancha, JugadorEnCampo, PuntoNormalizado, ZonaFormacion } from '../types';
import { OPACIDAD_CUADRICULA_DEFECTO } from './constantes';

interface OpcionesLadoZona {
  /** Giro de 180° (x→100-x, y→100-y): cómo se enfrentan de verdad dos equipos (FA4). */
  espejo: boolean;
  /** Comprime la formación dentro de su propia mitad, para que los 22 quepan sin pisarse en el modo "Ambos". */
  mediaCancha: boolean;
}

/**
 * Coloca una zona de formación en el lado del campo que le corresponde.
 * Las formaciones se definen sobre el campo completo (en 4-3-3 el POR está en
 * y=6 pero el DC en y=84, ya dentro de la mitad rival), así que sin esto el
 * rival caería encima de nosotros y en "Ambos" ambos equipos chocarían en el
 * mediocampo.
 */
export function ubicarZonaEnLado(zona: ZonaFormacion, { espejo, mediaCancha }: OpcionesLadoZona): ZonaFormacion {
  const y = mediaCancha ? zona.y / 2 : zona.y;
  return espejo ? { ...zona, x: 100 - zona.x, y: 100 - y } : { ...zona, y };
}

/** Margen alrededor del mediocampo para que nadie quede justo sobre la línea. */
const LIMITE_MITAD = 48;

/**
 * Empuja a su mitad a un jugador que no tiene zona de origen (entró arrastrado
 * desde el banquillo), sin escalar su posición: recortar es idempotente, así que
 * alternar de modo varias veces no lo va desplazando poco a poco.
 */
export function recortarAMitad(y: number, espejo: boolean): number {
  return espejo ? Math.max(y, 100 - LIMITE_MITAD) : Math.min(y, LIMITE_MITAD);
}

/** Con los dos equipos en pantalla a la vez, cada uno juega en su mitad (FA4). */
export function seVenAmbosEquipos(rival: EquipoRival | null): boolean {
  return Boolean(rival?.visible) && rival?.modoVista === 'ambos';
}

/** Solo se ve nuestro equipo: sin rival, rival oculto o modo "Solo nosotros". */
export function seVeSoloNuestroEquipo(rival: EquipoRival | null): boolean {
  return !seVenAmbosEquipos(rival) && rival?.modoVista !== 'solo_rival';
}

/** Zonas de la formación que ningún titular ocupa: son las que el campo dibuja como zonas fantasma. */
export function zonasSinJugador(zonas: ZonaFormacion[], titulares: JugadorEnCampo[]): ZonaFormacion[] {
  return zonas.filter((z) => !titulares.some((t) => t.zonaOrigenId === z.id));
}

/**
 * La zona fantasma sobre la que se suelta algo: aquella cuyo círculo en
 * pantalla contiene el punto (la más cercana si hay varias), o ninguna.
 */
export function zonaBajoPunto<Z extends ZonaFormacion>(
  zonas: Z[],
  puntoPx: { x: number; y: number },
  aPixeles: (punto: PuntoNormalizado) => { x: number; y: number },
  radioPx: number,
): Z | undefined {
  let mejor: { zona: Z; distancia: number } | undefined;
  for (const zona of zonas) {
    const centro = aPixeles({ x: zona.x, y: zona.y });
    const distancia = Math.hypot(centro.x - puntoPx.x, centro.y - puntoPx.y);
    if (distancia <= radioPx && (!mejor || distancia < mejor.distancia)) mejor = { zona, distancia };
  }
  return mejor?.zona;
}

/** Nuestra mitad va de nuestra portería (y=0) al mediocampo (y=50). */
export function hayJugadoresEnCampoRival(titulares: JugadorEnCampo[]): boolean {
  return titulares.some((t) => t.y > 50);
}

export function equipoEnSuMitad(titulares: JugadorEnCampo[]): boolean {
  return titulares.length > 0 && !hayJugadoresEnCampoRival(titulares);
}

export function cuadriculaVacia(): CuadriculaCampo {
  return {
    preset: 'off',
    columnas: 0,
    filas: 0,
    opacidad: OPACIDAD_CUADRICULA_DEFECTO,
    estiloLinea: 'solida',
    mostrarEtiquetas: false,
    celdasPintadas: {},
  };
}

export function canchaVacia(): IdentidadCancha {
  return {
    tema: 'estadio',
    vista: 'completo',
    mostrarEscudo: true,
    mostrarValla: true,
    rotado180: false,
  };
}

export function claveCelda(columna: number, fila: number): string {
  return `${columna}-${fila}`;
}

const CICLO_COLOR_CELDA: (ColorCelda | null)[] = ['rojo', 'ambar', 'azul', null];

/** Cicla rojo → ámbar → azul → (limpia la celda), como pide FA3. */
export function siguienteColorCelda(actual: ColorCelda | undefined): ColorCelda | null {
  const indice = actual ? CICLO_COLOR_CELDA.indexOf(actual) : -1;
  return CICLO_COLOR_CELDA[(indice + 1) % CICLO_COLOR_CELDA.length]!;
}

/** N puntos equidistantes entre A y B, ambos extremos incluidos (para la herramienta "Fila"). */
export function generarPuntosFila(a: PuntoNormalizado, b: PuntoNormalizado, n: number): PuntoNormalizado[] {
  const cantidad = Math.max(2, Math.min(12, Math.round(n)));
  const puntos: PuntoNormalizado[] = [];
  for (let i = 0; i < cantidad; i++) {
    const t = cantidad === 1 ? 0 : i / (cantidad - 1);
    puntos.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return puntos;
}

/** Como "Fila" pero desplazando alternadamente ±1,5 m en perpendicular (para "Slalom"). */
export function generarPuntosSlalom(
  a: PuntoNormalizado,
  b: PuntoNormalizado,
  n: number,
  anchoCampoM: number,
): PuntoNormalizado[] {
  const base = generarPuntosFila(a, b, n);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const longitud = Math.hypot(dx, dy) || 1;
  // Perpendicular unitario, en el mismo sistema de porcentaje que a/b.
  const perpX = -dy / longitud;
  const perpY = dx / longitud;
  const desplazamientoPct = (1.5 / anchoCampoM) * 100;
  return base.map((punto, indice) => {
    const signo = indice % 2 === 0 ? 1 : -1;
    return { x: punto.x + perpX * desplazamientoPct * signo, y: punto.y + perpY * desplazamientoPct * signo };
  });
}

/** Los 4 conos de un rectángulo definido por dos esquinas opuestas (para "Rejilla"). */
export function generarPuntosRejilla(a: PuntoNormalizado, b: PuntoNormalizado): PuntoNormalizado[] {
  return [
    { x: a.x, y: a.y },
    { x: b.x, y: a.y },
    { x: b.x, y: b.y },
    { x: a.x, y: b.y },
  ];
}
