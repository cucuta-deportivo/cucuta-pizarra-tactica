import type { Alineacion } from '../../types';

export interface ResumenAlineacion {
  id: string;
  nombre: string;
  formacionId: string;
  modificadaEn: string;
}

/**
 * Estado de sincronización de una alineación en este dispositivo. Una alineación
 * sin registro nunca se marcó: es anterior a la sincronización y la sube la
 * migración (S1.8).
 */
export interface RegistroSincronizacion {
  /** Id de la alineación. */
  id: string;
  /** Versión del servidor de la que parte la copia local; `null` si nunca se subió. */
  versionServidor: number | null;
  /** Tiene cambios hechos en este dispositivo que todavía no están en Supabase. */
  pendiente: boolean;
  /** Se borró en este dispositivo; falta marcarla como borrada en Supabase. */
  eliminada: boolean;
}

/** El registro tras guardar en este dispositivo: queda por subir, desde la versión que tuviera. */
export function marcarPorSubir(previo: RegistroSincronizacion | undefined, id: string): RegistroSincronizacion {
  return { id, versionServidor: previo?.versionServidor ?? null, pendiente: true, eliminada: false };
}

/**
 * El registro tras borrar en este dispositivo: una marca de borrado por subir. Se
 * deja aunque nunca se haya subido; la sincronización la descarta sin red en ese
 * caso, y así no se pierde el borrado si había una subida a medias.
 */
export function marcarEliminadaPorSubir(previo: RegistroSincronizacion | undefined, id: string): RegistroSincronizacion {
  return { id, versionServidor: previo?.versionServidor ?? null, pendiente: true, eliminada: true };
}

/**
 * Puerto de persistencia. Cualquier componente depende solo de esta interfaz,
 * nunca de Dexie/IndexedDB directamente, para poder cambiar de IndexedDB a un
 * backend (p. ej. Supabase) sin tocar la UI.
 */
export interface AlineacionRepository {
  listar(): Promise<ResumenAlineacion[]>;
  obtener(id: string): Promise<Alineacion | undefined>;
  /** Guarda y la marca por subir, en un solo paso. */
  guardar(alineacion: Alineacion): Promise<void>;
  /** La borra de este dispositivo y deja su marca de borrado por subir, en un solo paso. */
  eliminar(id: string): Promise<void>;
  /** Lo cambiado o borrado en este dispositivo que falta subir a Supabase. */
  pendientesDeSubir(): Promise<RegistroSincronizacion[]>;
}
