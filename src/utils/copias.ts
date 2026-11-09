import type { Alineacion } from '../types';
import { generarId } from './id';

/**
 * Copias por conflicto (S1.7): cuando otro dispositivo cambió una alineación
 * antes de que subieran los cambios de aquí, lo de aquí se conserva como otra
 * alineación. El nombre dice de dónde y de cuándo es, por ejemplo
 * "Sub-20 vs Rival (copia tablet 6 nov 18:40)".
 */

export type Dispositivo = 'tablet' | 'computador';

// Fijos, sin Intl: el nombre no debe cambiar según el navegador.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const dosCifras = (n: number) => String(n).padStart(2, '0');

export function nombreDeCopia(nombre: string, dispositivo: Dispositivo, fecha: Date): string {
  const cuando = `${fecha.getDate()} ${MESES[fecha.getMonth()]} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`;
  return `${nombre} (copia ${dispositivo} ${cuando})`;
}

/** Una pantalla táctil sin ratón (iPad, tablet Android) es una tablet; lo demás, un computador. */
export function tipoDeDispositivo(): Dispositivo {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'tablet' : 'computador';
  } catch {
    return 'computador';
  }
}

/** Otra alineación con el mismo contenido, su propio id y la fecha en que se hizo la copia. */
export function copiaPorConflicto(alineacion: Alineacion, fecha = new Date()): Alineacion {
  const ahora = fecha.toISOString();
  return {
    ...alineacion,
    id: generarId(),
    nombre: nombreDeCopia(alineacion.nombre, tipoDeDispositivo(), fecha),
    creadaEn: ahora,
    modificadaEn: ahora,
  };
}
