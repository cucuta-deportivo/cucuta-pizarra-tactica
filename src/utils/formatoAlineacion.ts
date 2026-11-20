import type { Alineacion } from '../types';

/**
 * Versión del formato con que ESTA app guarda una alineación. Cada alineación
 * lleva la versión con que se guardó (`formato`). Una versión de la app que
 * abre una de formato más nuevo no la deja editar y nunca la sobrescribe: al
 * guardarla perdería lo que no conoce (así se perdería, por ejemplo, la jugada
 * cerrada en una versión de antes de F5.4a).
 *
 * Hay que subirla cada vez que un cambio añada a la alineación datos que una
 * versión anterior de la app perdería al guardarla.
 *
 *  1 · Todo lo anterior a la Fase 5 (esas alineaciones no tienen `formato`).
 *  2 · Fase 5: jugada cerrada (F5.4a), pizarra guardada de la jugada abierta
 *      (F5.4a) y marca de equipo acomodado en el rival (F5.3).
 */
export const FORMATO_ALINEACION = 2;

/** La versión de formato con que se guardó; las de antes de existir el campo son la 1. */
export function formatoDe(alineacion: Pick<Alineacion, 'formato'>): number {
  return typeof alineacion.formato === 'number' && Number.isFinite(alineacion.formato) ? alineacion.formato : 1;
}

/** Se guardó con una versión de la app más nueva que esta: aquí no se edita ni se sobrescribe. */
export function esDeUnaVersionMasNueva(alineacion: Pick<Alineacion, 'formato'>): boolean {
  return formatoDe(alineacion) > FORMATO_ALINEACION;
}

export const AVISO_ACTUALIZAR_APP = 'Actualiza la app para editar esta alineación: se guardó con una versión más nueva.';
