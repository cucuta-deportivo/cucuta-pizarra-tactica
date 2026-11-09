import type { Alineacion } from '../../types';
import type { RegistroSincronizacion } from '../repositorio/AlineacionRepository';
import { ErrorSinConexion, type EstadoRemoto, type ResultadoAlta, type ResultadoSubida } from '../supabase/alineacionesApi';

/**
 * Sube lo marcado "por subir" (S1.6) sin pisar nunca el trabajo de otro
 * dispositivo: cada cambio sale desde la versión de la que parte y, si el
 * servidor ya no está en ella, no se escribe nada. De una en una, en orden.
 */

/** Lo que necesita del servidor (en la app, `alineacionesApi`). */
export interface Remoto {
  crear(alineacion: Alineacion, ultimoCambio: string): Promise<ResultadoAlta>;
  actualizar(alineacion: Alineacion, versionBase: number, ultimoCambio: string): Promise<ResultadoSubida>;
  marcarEliminada(id: string, versionBase: number, ultimoCambio: string): Promise<ResultadoSubida>;
  estado(id: string): Promise<EstadoRemoto | null>;
}

/** Lo que necesita de este dispositivo (en la app, el repositorio de IndexedDB). */
export interface Local {
  pendientesDeSubir(): Promise<RegistroSincronizacion[]>;
  obtener(id: string): Promise<Alineacion | undefined>;
  actualizarMarca(
    id: string,
    cambio: (actual: RegistroSincronizacion | undefined) => RegistroSincronizacion | null,
  ): Promise<RegistroSincronizacion | null>;
}

export interface ResumenSubida {
  /** `sin-conexion` y `error` cortan la vuelta: lo que faltaba sigue por subir. */
  estado: 'al-dia' | 'sin-conexion' | 'error';
  subidas: number;
  conflictos: number;
  mensaje?: string;
}

type Resultado = 'subida' | 'conflicto' | 'nada';

// --- Cómo cambia la marca en cada caso (puro) ---

const SIN_INTENTO = { cambioEnCurso: null, revisionEnCurso: null } as const;

/**
 * Lista para subir, con el identificador de esta subida. Uno sin confirmar se
 * reutiliza (un reintento, u otra pestaña con lo mismo) y nunca se tira: si se
 * perdiera, una subida que sí llegó parecería de otro dispositivo.
 */
function conCambioEnCurso(marca: RegistroSincronizacion, nuevoId: () => string): RegistroSincronizacion {
  if (marca.cambioEnCurso) return marca;
  return { ...marca, cambioEnCurso: nuevoId(), revisionEnCurso: marca.revision };
}

/** El servidor aceptó la subida. Si hubo otro cambio aquí mientras tanto, sigue por subir. */
function subidaConfirmada(marca: RegistroSincronizacion, version: number, revisionSubida: number): RegistroSincronizacion {
  return { ...marca, ...SIN_INTENTO, versionServidor: version, conflicto: false, pendiente: marca.revision !== revisionSubida };
}

/** No queda nada que subir de esta marca, salvo que haya cambiado mientras tanto. */
function marcaCerrada(marca: RegistroSincronizacion, revisionSubida: number): RegistroSincronizacion | null {
  return marca.revision === revisionSubida ? null : { ...marca, ...SIN_INTENTO };
}

function enConflicto(marca: RegistroSincronizacion): RegistroSincronizacion {
  return { ...marca, ...SIN_INTENTO, conflicto: true };
}

/** El servidor no la tiene: en la siguiente vuelta se sube como nueva. */
function sinVersion(marca: RegistroSincronizacion): RegistroSincronizacion {
  return { ...marca, ...SIN_INTENTO, versionServidor: null };
}

export function crearSubidor({ local, remoto, nuevoId }: { local: Local; remoto: Remoto; nuevoId: () => string }) {
  const cambiar = (id: string, cambio: (marca: RegistroSincronizacion) => RegistroSincronizacion | null) =>
    local.actualizarMarca(id, (actual) => (actual ? cambio(actual) : null));

  async function subirBorrado(id: string, versionServidor: number | null, cambio: string, revision: number): Promise<Resultado> {
    // Nunca llegó al servidor: no hay nada que avisar.
    if (versionServidor === null) {
      await cambiar(id, (m) => marcaCerrada(m, revision));
      return 'nada';
    }
    const respuesta = await remoto.marcarEliminada(id, versionServidor, cambio);
    const reconocida = respuesta.tipo === 'subida' || (await remoto.estado(id))?.ultimoCambio === cambio;
    // Si no se aplicó es porque otro dispositivo la cambió (gana su edición), ya
    // estaba borrada o ya no existe. En todos esos casos el borrado de aquí se
    // da por cerrado; la versión del servidor, si la hay, se baja en S1.7.
    await cambiar(id, (m) => marcaCerrada(m, revision));
    return reconocida ? 'subida' : 'nada';
  }

  async function subirCambios(alineacion: Alineacion, versionServidor: number | null, cambio: string, revision: number): Promise<Resultado> {
    const { id } = alineacion;
    const respuesta = versionServidor === null ? await remoto.crear(alineacion, cambio) : await remoto.actualizar(alineacion, versionServidor, cambio);
    if (respuesta.tipo === 'subida') {
      await cambiar(id, (m) => subidaConfirmada(m, respuesta.version, revision));
      return 'subida';
    }
    const estado = await remoto.estado(id);
    // Llegó, pero se perdió la respuesta: el servidor tiene nuestro identificador.
    if (estado?.ultimoCambio === cambio) {
      await cambiar(id, (m) => subidaConfirmada(m, estado.version, revision));
      return 'subida';
    }
    if (!estado) {
      await cambiar(id, sinVersion);
      return 'nada';
    }
    await cambiar(id, enConflicto);
    return 'conflicto';
  }

  /**
   * Hay una subida sin confirmar de un contenido que ya se editó: antes de subir
   * lo nuevo se averigua si llegó. Si llegó, el servidor tiene aquel contenido y
   * lo nuevo sale desde esa versión; si no, se descarta. Nunca se da por subido
   * lo editado después.
   */
  async function resolverIntentoAnterior(marca: RegistroSincronizacion): Promise<void> {
    if (!marca.cambioEnCurso || marca.revisionEnCurso === marca.revision) return;
    const estado = await remoto.estado(marca.id);
    const llego = estado?.ultimoCambio === marca.cambioEnCurso;
    await cambiar(marca.id, (m) => ({ ...m, ...SIN_INTENTO, versionServidor: llego && estado ? estado.version : m.versionServidor }));
  }

  async function subirUna(id: string): Promise<Resultado> {
    // Se lee de nuevo: pudo editarse desde que se listó lo pendiente.
    const actual = await cambiar(id, (m) => m);
    if (!actual?.pendiente) return 'nada';
    await resolverIntentoAnterior(actual);
    const marca = await cambiar(id, (m) => conCambioEnCurso(m, nuevoId));
    if (!marca?.pendiente || !marca.cambioEnCurso || marca.revisionEnCurso === null) return 'nada';
    const { versionServidor, cambioEnCurso, revisionEnCurso: revision } = marca;
    if (marca.eliminada) return subirBorrado(id, versionServidor, cambioEnCurso, revision);
    const alineacion = await local.obtener(id);
    if (!alineacion) {
      await cambiar(id, (m) => marcaCerrada(m, revision));
      return 'nada';
    }
    return subirCambios(alineacion, versionServidor, cambioEnCurso, revision);
  }

  async function vuelta(): Promise<ResumenSubida> {
    const resumen: ResumenSubida = { estado: 'al-dia', subidas: 0, conflictos: 0 };
    for (const marca of await local.pendientesDeSubir()) {
      if (marca.conflicto) {
        resumen.conflictos += 1;
        continue;
      }
      try {
        const resultado = await subirUna(marca.id);
        if (resultado === 'subida') resumen.subidas += 1;
        if (resultado === 'conflicto') resumen.conflictos += 1;
      } catch (error) {
        if (error instanceof ErrorSinConexion) return { ...resumen, estado: 'sin-conexion' };
        return { ...resumen, estado: 'error', mensaje: error instanceof Error ? error.message : String(error) };
      }
    }
    return resumen;
  }

  let enCurso: Promise<ResumenSubida> | null = null;
  let otraVuelta = false;

  return {
    /** Una sola vuelta a la vez: si se pide otra mientras hay una en curso, se hace al terminar. */
    subir(): Promise<ResumenSubida> {
      if (enCurso) {
        otraVuelta = true;
        return enCurso;
      }
      enCurso = (async () => {
        // `finally` dentro y no encadenado: así se libera en el mismo paso en que
        // termina el bucle, sin un hueco en el que una petición se perdería.
        try {
          let resumen: ResumenSubida;
          do {
            otraVuelta = false;
            resumen = await vuelta();
          } while (otraVuelta && resumen.estado === 'al-dia');
          return resumen;
        } finally {
          enCurso = null;
        }
      })();
      return enCurso;
    },
  };
}

/** Llama a `accion` una sola vez, `esperaMs` después de la última petición. */
export function crearProgramador(accion: () => void, esperaMs: number): () => void {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      temporizador = null;
      accion();
    }, esperaMs);
  };
}
