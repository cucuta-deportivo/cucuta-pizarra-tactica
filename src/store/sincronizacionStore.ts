import { create } from 'zustand';

/**
 * Estado de la sincronización con Supabase (S1.9), para el indicador de la
 * barra superior. Lo actualiza `data/sincronizacion` en cada vuelta y después de
 * cada guardado; nadie más lo escribe.
 */
export type EstadoSincronizacion = 'inactiva' | 'sincronizando' | 'al-dia' | 'sin-conexion' | 'error';

export interface SincronizacionState {
  /** `inactiva`: esta cuenta no sincroniza (sin Supabase, o sin cuenta de entrenador activo). */
  estado: EstadoSincronizacion;
  /** Alineaciones con cambios de este dispositivo que todavía no están en Supabase. */
  pendientes: number;
  /** El error del servidor, si la última vuelta falló por algo distinto de la red. */
  mensaje: string | null;
  /** Cuándo terminó la última vuelta sin problemas. */
  ultimaVez: string | null;
  /** F5.4b: nombres de las alineaciones que no caben en el servidor (más de 1 MB): siguen solo en este dispositivo. */
  demasiadoGrandes: string[];
}

export const useSincronizacionStore = create<SincronizacionState>(() => ({
  estado: 'inactiva',
  pendientes: 0,
  mensaje: null,
  ultimaVez: null,
  demasiadoGrandes: [],
}));

/** El estado después de una vuelta: si fue bien, guarda la hora; si no, conserva la de la última buena. */
export function estadoTrasVuelta(
  resumen: { estado: 'al-dia' | 'sin-conexion' | 'error'; mensaje?: string; demasiadoGrandes?: string[] },
  pendientes: number,
  ahora: Date,
): Partial<SincronizacionState> {
  const demasiadoGrandes = resumen.demasiadoGrandes ?? [];
  if (resumen.estado === 'al-dia') return { estado: 'al-dia', pendientes, mensaje: null, ultimaVez: ahora.toISOString(), demasiadoGrandes };
  return { estado: resumen.estado, pendientes, mensaje: resumen.estado === 'error' ? (resumen.mensaje ?? null) : null, demasiadoGrandes };
}
