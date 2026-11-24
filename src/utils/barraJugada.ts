/**
 * Qué cabe en la barra de la jugada. La fila de abajo enseña la edición de la
 * fase que se ve mientras quepa y manda el resto a «Más ▾»; la de arriba lleva
 * las pestañas y, si sobra sitio, el nombre y la curva de la jugada.
 *
 * Los anchos son fijos (los botones y campos los llevan puestos) para que la
 * cuenta no dependa de la fuente ni del texto del momento («Grabar» o
 * «Grabando»): con anchos medidos al vuelo los controles saltaban al cambiar.
 */

/** Separación entre controles de la fila (gap-1.5). */
export const HUECO = 6;

/** Ancho de cada control de edición que puede esconderse. «＋ Fase» no está: siempre se ve. */
export const ANCHOS_EDICION = {
  nombreFase: 180,
  duracion: 110,
  mover: 94, // dos botones de 44 y su hueco
  duplicar: 64,
  borrar: 60,
} as const;

export type ControlEdicion = keyof typeof ANCHOS_EDICION;

/** Grabar y Movimiento: con texto al lado o con la palabra debajo del icono. */
export const ANCHOS_GRABAR = { normal: 112, compacto: 64 } as const;
export const ANCHOS_MOVIMIENTO = { normal: 122, compacto: 80 } as const;
const AHORRO_COMPACTAR =
  ANCHOS_GRABAR.normal - ANCHOS_GRABAR.compacto + (ANCHOS_MOVIMIENTO.normal - ANCHOS_MOVIMIENTO.compacto);

/**
 * Orden en que se va quitando sitio, de lo que menos importa a lo que más (el
 * usuario fijó la prioridad: ＋ Fase, duración, nombre de la fase, mover,
 * duplicar, borrar). Antes de esconder la duración, Grabar y Movimiento pasan a
 * icono con la palabra debajo.
 */
export const PASOS = ['borrar', 'duplicar', 'mover', 'nombreFase', 'compactar', 'duracion'] as const;
export type Paso = (typeof PASOS)[number];

/**
 * Lo mínimo que necesita el bloque «FASE x/y» con el tiempo. Si el campo del
 * nombre de la fase está escondido, el nombre va escrito junto a «FASE x/y» y
 * necesita más (180 px: caben enteros los 74 nombres del repertorio).
 */
export const MINIMO_FASE = 120;
export const MINIMO_FASE_CON_NOMBRE = 180;

/** Pasos aplicados con un nivel dado: el nivel 2 ha escondido borrar y duplicar. */
export function pasosAplicados(nivel: number): Set<Paso> {
  return new Set(PASOS.slice(0, Math.max(0, Math.min(nivel, PASOS.length))));
}

/** Ancho que ocupan, con un nivel dado, los controles que pueden esconderse o encogerse. */
export function anchoOcupado(nivel: number): number {
  const aplicados = pasosAplicados(nivel);
  let total = aplicados.has('compactar') ? 0 : AHORRO_COMPACTAR;
  for (const control of Object.keys(ANCHOS_EDICION) as ControlEdicion[]) {
    if (!aplicados.has(control)) total += ANCHOS_EDICION[control] + HUECO;
  }
  return total;
}

function minimoFase(nivel: number): number {
  return pasosAplicados(nivel).has('nombreFase') ? MINIMO_FASE_CON_NOMBRE : MINIMO_FASE;
}

/**
 * El nivel con menos cosas escondidas que cabe en `espacio`: el ancho que se
 * reparten el bloque «FASE x/y» y los controles que pueden esconderse.
 */
export function elegirNivel(espacio: number): number {
  for (let nivel = 0; nivel < PASOS.length; nivel++) {
    if (anchoOcupado(nivel) + minimoFase(nivel) <= espacio) return nivel;
  }
  return PASOS.length;
}

/**
 * El espacio a repartir se deduce de lo medido: el ancho que tenía el bloque
 * «FASE x/y» más lo que ocupaban los controles con el nivel de ese momento. Así
 * no hay que medir los controles escondidos y el resultado no oscila: al cambiar
 * de nivel cambia el bloque, pero la suma es la misma.
 */
export function espacioDisponible(anchoBloqueFase: number, nivelAlMedir: number): number {
  return anchoBloqueFase + anchoOcupado(nivelAlMedir);
}

/** Nombre y curva de la jugada en la fila de arriba: campo de 200, selector de 130, sus huecos. */
export const ANCHO_JUGADA_ARRIBA = 200 + HUECO + 130 + 8;
/** Lo que se deja como mínimo a las pestañas antes de subir el nombre y la curva (unas 7 pestañas con nombre). */
export const MINIMO_PESTANAS = 720;

/**
 * ¿Caben el nombre y la curva de la jugada en la fila de las pestañas? Solo en
 * pantallas anchas: las pestañas mandan en esa fila.
 */
export function jugadaArriba(anchoPestanas: number, estabaArriba: boolean): boolean {
  const espacio = anchoPestanas + (estabaArriba ? ANCHO_JUGADA_ARRIBA : 0);
  return espacio - ANCHO_JUGADA_ARRIBA >= MINIMO_PESTANAS;
}
