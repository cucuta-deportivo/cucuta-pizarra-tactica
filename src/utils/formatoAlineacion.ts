import type { Alineacion, SecuenciaTactica } from '../types';

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
 *  3 · F5.4b: varias jugadas por alineación (`jugadas`), cada una con su id,
 *      descripción y vista; la abierta recuerda su sitio en la lista.
 */
export const FORMATO_ALINEACION = 3;

/** La versión de formato con que se guardó; las de antes de existir el campo son la 1. */
export function formatoDe(alineacion: Pick<Alineacion, 'formato'>): number {
  return typeof alineacion.formato === 'number' && Number.isFinite(alineacion.formato) ? alineacion.formato : 1;
}

/** Se guardó con una versión de la app más nueva que esta: aquí no se edita ni se sobrescribe. */
export function esDeUnaVersionMasNueva(alineacion: Pick<Alineacion, 'formato'>): boolean {
  return formatoDe(alineacion) > FORMATO_ALINEACION;
}

export const AVISO_ACTUALIZAR_APP = 'Actualiza la app para editar esta alineación: se guardó con una versión más nueva.';

/**
 * Lleva una alineación guardada con un formato anterior al 3 a la forma de ahora
 * (F5.4b): la jugada cerrada de F5.4a pasa a ser la primera de la lista `jugadas`,
 * cada jugada lleva su `id` y un nombre («Jugada 1» si no tenía), y la abierta
 * sabe a qué sitio de la lista vuelve. Vale igual para lo que llega de Supabase,
 * de un JSON o de un respaldo, porque todo pasa por aquí al abrirse.
 *
 * Los ids se sacan del de la alineación, así leer dos veces da lo mismo. No toca
 * `formato`: lo pone el guardado. Lo que ya está en el formato 3 sale tal cual.
 */
export function conJugadasEnLista(alineacion: Alineacion): Alineacion {
  const abierta = alineacion.secuencia ?? null;
  if (Array.isArray(alineacion.jugadas) && !alineacion.jugadaCerrada && (!abierta || abierta.id)) return alineacion;

  const deAntes = [...(alineacion.jugadas ?? []), ...(alineacion.jugadaCerrada ? [alineacion.jugadaCerrada] : [])];
  const jugadas = deAntes.map((jugada, i) => conIdYNombre(jugada, `${alineacion.id}-jugada-${i + 1}`, i + 1));
  const convertida: Alineacion = { ...alineacion, jugadas, jugadaCerrada: undefined };
  delete convertida.jugadaCerrada;
  if (abierta) {
    const n = jugadas.length + 1;
    convertida.secuencia = { ...conIdYNombre(abierta, `${alineacion.id}-jugada-${n}`, n), posicion: abierta.posicion ?? jugadas.length };
  }
  return convertida;
}

function conIdYNombre(jugada: SecuenciaTactica, id: string, numero: number): SecuenciaTactica {
  return { ...jugada, id: jugada.id ?? id, nombre: jugada.nombre?.trim() ? jugada.nombre : `Jugada ${numero}` };
}
