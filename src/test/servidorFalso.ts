import type { RemotoBajada } from '../data/sincronizacion/bajarCambios';
import type { Remoto } from '../data/sincronizacion/subirPendientes';
import {
  ErrorSinConexion,
  ErrorSupabase,
  type AlineacionRemota,
  type EstadoRemoto,
  type ResultadoAlta,
  type ResultadoSubida,
} from '../data/supabase/alineacionesApi';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import { formatoDe } from '../utils/formatoAlineacion';
import { pesoEnServidor, TOPE_SERVIDOR } from '../utils/pesoAlineacion';
import type { Alineacion } from '../types';

/**
 * Servidor falso para las pruebas de sincronización (S1.6 y S1.7). Aplica las
 * mismas reglas que la tabla real (comprobadas en S1.1): la versión la pone el
 * servidor, un cambio solo se escribe si el servidor sigue en la versión de la
 * que parte, un alta con un id que ya existe no pisa nada y borrar es marcar.
 * También rechaza lo mismo que la tabla: un documento de más de 1 MB (la
 * restricción alineaciones_documento_valido, código 23514) y guardar encima con
 * un formato menor (el trigger alineaciones_formato, código CDF01).
 * Guarda copias, no referencias: cada dispositivo de la prueba tiene las suyas.
 */
interface Fila {
  alineacion: Alineacion;
  version: number;
  ultimoCambio: string;
  eliminada: boolean;
}

const copiar = <T>(valor: T): T => JSON.parse(JSON.stringify(valor)) as T;

export class ServidorFalso implements Remoto, RemotoBajada {
  filas = new Map<string, Fila>();
  llamadas = 0;
  /** Se ejecuta al recibir un cambio, antes de aplicarlo: para editar "mientras se sube". */
  alRecibir: (() => Promise<unknown>) | null = null;
  private corte: 'antes' | 'despues' | null = null;
  private error: Error | null = null;
  private cambiosAjenos = 0;

  /** La próxima llamada se queda sin red: 'antes' no llega; 'despues' sí se aplica, pero se pierde la respuesta. */
  cortarRed(cuando: 'antes' | 'despues'): void {
    this.corte = cuando;
  }

  fallarCon(error: Error): void {
    this.error = error;
  }

  /** Otro dispositivo sube un cambio de esta alineación. */
  cambiarDesdeOtroDispositivo(id: string, nombre = 'Cambiada en otro dispositivo'): void {
    const fila = this.filas.get(id)!;
    fila.version += 1;
    fila.ultimoCambio = `cambio-ajeno-${++this.cambiosAjenos}`;
    fila.alineacion = { ...fila.alineacion, nombre };
  }

  /** Otro dispositivo la borra (la marca como borrada). */
  borrarDesdeOtroDispositivo(id: string): void {
    const fila = this.filas.get(id)!;
    fila.version += 1;
    fila.ultimoCambio = `cambio-ajeno-${++this.cambiosAjenos}`;
    fila.eliminada = true;
  }

  /** Otro dispositivo sube una alineación nueva. */
  crearDesdeOtroDispositivo(nueva: Alineacion): void {
    this.filas.set(nueva.id, { alineacion: copiar(nueva), version: 1, ultimoCambio: `cambio-ajeno-${++this.cambiosAjenos}`, eliminada: false });
  }

  private async llamada<T>(operacion: () => Promise<T> | T): Promise<T> {
    this.llamadas += 1;
    if (this.error) {
      const error = this.error;
      this.error = null;
      throw error;
    }
    if (this.corte === 'antes') {
      this.corte = null;
      throw new ErrorSinConexion();
    }
    const resultado = await operacion();
    if (this.corte === 'despues') {
      this.corte = null;
      throw new ErrorSinConexion();
    }
    return resultado;
  }

  /** Las reglas de la tabla real que rechazan un documento (schema.sql). */
  private comprobarDocumento(nueva: Alineacion, anterior?: Alineacion): void {
    if (pesoEnServidor(nueva) > TOPE_SERVIDOR) {
      throw new ErrorSupabase('new row for relation "alineaciones" violates check constraint "alineaciones_documento_valido"', '23514', 400);
    }
    if (anterior && formatoDe(nueva) < formatoDe(anterior)) {
      throw new ErrorSupabase('Esta alineacion se guardo con una version mas nueva de la app. Actualiza la app para guardarla.', 'CDF01', 400);
    }
  }

  crear(alineacion: Alineacion, ultimoCambio: string): Promise<ResultadoAlta> {
    return this.llamada(() => {
      if (this.filas.has(alineacion.id)) return { tipo: 'ya-existe' as const };
      this.comprobarDocumento(alineacion);
      this.filas.set(alineacion.id, { alineacion: copiar(alineacion), version: 1, ultimoCambio, eliminada: false });
      return { tipo: 'subida' as const, version: 1 };
    });
  }

  actualizar(alineacion: Alineacion, versionBase: number, ultimoCambio: string): Promise<ResultadoSubida> {
    return this.llamada(async () => {
      if (this.alRecibir) {
        const alRecibir = this.alRecibir;
        this.alRecibir = null;
        await alRecibir();
      }
      const fila = this.filas.get(alineacion.id);
      if (!fila || fila.version !== versionBase) return { tipo: 'sin-cambio' as const };
      this.comprobarDocumento(alineacion, fila.alineacion);
      Object.assign(fila, { alineacion: copiar(alineacion), version: fila.version + 1, ultimoCambio });
      return { tipo: 'subida' as const, version: fila.version };
    });
  }

  marcarEliminada(id: string, versionBase: number, ultimoCambio: string): Promise<ResultadoSubida> {
    return this.llamada(() => {
      const fila = this.filas.get(id);
      if (!fila || fila.version !== versionBase) return { tipo: 'sin-cambio' as const };
      Object.assign(fila, { eliminada: true, version: fila.version + 1, ultimoCambio });
      return { tipo: 'subida' as const, version: fila.version };
    });
  }

  private estadoDe(id: string, fila: Fila): EstadoRemoto {
    return { id, version: fila.version, ultimoCambio: fila.ultimoCambio, eliminada: fila.eliminada, actualizadoEn: '2026-11-09T00:00:00Z' };
  }

  estado(id: string): Promise<EstadoRemoto | null> {
    return this.llamada(() => {
      const fila = this.filas.get(id);
      return fila ? this.estadoDe(id, fila) : null;
    });
  }

  listarEstados(): Promise<EstadoRemoto[]> {
    return this.llamada(() => [...this.filas.entries()].map(([id, fila]) => this.estadoDe(id, fila)));
  }

  descargar(ids: string[]): Promise<AlineacionRemota[]> {
    return this.llamada(() =>
      ids
        .filter((id) => this.filas.has(id))
        .map((id) => {
          const fila = this.filas.get(id)!;
          return { alineacion: { ...copiar(fila.alineacion), id }, version: fila.version, eliminada: fila.eliminada, ultimoCambio: fila.ultimoCambio };
        }),
    );
  }
}

export function alineacion(id: string, nombre = 'Titular del sábado'): Alineacion {
  return {
    id,
    nombre,
    formacionId: '4-3-3',
    titulares: [],
    banquillo: [],
    trazos: [],
    notas: '',
    creadaEn: '2026-11-08T10:00:00.000Z',
    modificadaEn: '2026-11-08T10:00:00.000Z',
    objetos: [],
    balones: [],
    cuadricula: cuadriculaVacia(),
    rival: null,
    marcajes: [],
    cancha: canchaVacia(),
  };
}
