import { ErrorSinConexion } from '../supabase/alineacionesApi';
import type { CambioBajado } from './bajarCambios';
import type { ResumenSubida } from './subirPendientes';

/**
 * Una vuelta de sincronización (S1.7): sube lo pendiente, baja lo que cambió en
 * otros dispositivos y, si al bajar quedaron copias por un conflicto, las sube.
 * Sin red no se baja. Si alguna alineación no subió por otro error, sí (F5.4b):
 * bajar nunca pisa lo de aquí (lo que no subió pasa a copia si hace falta), y
 * antes un solo documento rechazado dejaba sin bajar lo de todos los demás.
 */
export interface ResumenSincronizacion extends ResumenSubida {
  cambios: CambioBajado[];
}

interface Subidor {
  subir(): Promise<ResumenSubida>;
}

interface Bajador {
  bajar(): Promise<CambioBajado[]>;
}

export function crearSincronizador({ subidor, bajador, alBajar }: { subidor: Subidor; bajador: Bajador; alBajar: (cambios: CambioBajado[]) => void }) {
  async function vuelta(): Promise<ResumenSincronizacion> {
    const subida = await subidor.subir();
    if (subida.estado === 'sin-conexion') return { ...subida, cambios: [] };
    let cambios: CambioBajado[];
    try {
      cambios = await bajador.bajar();
    } catch (error) {
      if (error instanceof ErrorSinConexion) return { ...subida, estado: 'sin-conexion', cambios: [] };
      return { ...subida, estado: 'error', mensaje: subida.mensaje ?? (error instanceof Error ? error.message : String(error)), cambios: [] };
    }
    if (cambios.length > 0) alBajar(cambios);
    if (!cambios.some((c) => c.tipo === 'copia')) return { ...subida, cambios };
    const copias = await subidor.subir();
    // Un error de la primera subida no lo tapa que las copias suban bien.
    const conError = subida.estado === 'error' ? { estado: 'error' as const, mensaje: subida.mensaje } : {};
    return { ...copias, ...conError, subidas: subida.subidas + copias.subidas, cambios };
  }

  let enCurso: Promise<ResumenSincronizacion> | null = null;
  let otraVuelta = false;

  return {
    /** Una sola vuelta a la vez: si se pide otra mientras hay una en curso, se hace al terminar. */
    sincronizar(): Promise<ResumenSincronizacion> {
      if (enCurso) {
        otraVuelta = true;
        return enCurso;
      }
      enCurso = (async () => {
        try {
          let resumen: ResumenSincronizacion;
          const cambios: CambioBajado[] = [];
          do {
            otraVuelta = false;
            resumen = await vuelta();
            cambios.push(...resumen.cambios);
          } while (otraVuelta && resumen.estado === 'al-dia');
          return { ...resumen, cambios };
        } finally {
          enCurso = null;
        }
      })();
      return enCurso;
    },
  };
}
