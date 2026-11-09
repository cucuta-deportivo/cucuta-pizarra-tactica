import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearProgramador, crearSubidor, type Remoto } from '../data/sincronizacion/subirPendientes';
import { MemoriaAlineacionRepository } from '../data/repositorio/memoriaAlineacionRepository';
import {
  ErrorSinConexion,
  ErrorSupabase,
  type EstadoRemoto,
  type ResultadoAlta,
  type ResultadoSubida,
} from '../data/supabase/alineacionesApi';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import type { Alineacion } from '../types';

/**
 * S1.6: subir lo marcado "por subir" sin pisar nunca el trabajo de otro
 * dispositivo. El servidor falso aplica las mismas reglas que la tabla real
 * (comprobadas en S1.1): la versión la pone el servidor, un cambio solo se
 * escribe si el servidor sigue en la versión de la que parte, y un alta con un
 * id que ya existe no pisa nada.
 */
interface Fila {
  alineacion: Alineacion;
  version: number;
  ultimoCambio: string;
  eliminada: boolean;
}

class ServidorFalso implements Remoto {
  filas = new Map<string, Fila>();
  llamadas = 0;
  /** Se ejecuta al recibir un cambio, antes de aplicarlo: para editar "mientras se sube". */
  alRecibir: (() => Promise<void>) | null = null;
  private corte: 'antes' | 'despues' | null = null;
  private error: Error | null = null;

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
    fila.ultimoCambio = 'cambio-de-otro-dispositivo';
    fila.alineacion = { ...fila.alineacion, nombre };
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

  crear(alineacion: Alineacion, ultimoCambio: string): Promise<ResultadoAlta> {
    return this.llamada(() => {
      if (this.filas.has(alineacion.id)) return { tipo: 'ya-existe' as const };
      this.filas.set(alineacion.id, { alineacion, version: 1, ultimoCambio, eliminada: false });
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
      Object.assign(fila, { alineacion, version: fila.version + 1, ultimoCambio });
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

  estado(id: string): Promise<EstadoRemoto | null> {
    return this.llamada(() => {
      const fila = this.filas.get(id);
      return fila
        ? { id, version: fila.version, ultimoCambio: fila.ultimoCambio, eliminada: fila.eliminada, actualizadoEn: '2026-11-09T00:00:00Z' }
        : null;
    });
  }
}

function alineacion(id: string, nombre = 'Titular del sábado'): Alineacion {
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

function preparar() {
  const local = new MemoriaAlineacionRepository();
  const servidor = new ServidorFalso();
  let n = 0;
  const subidor = crearSubidor({ local, remoto: servidor, nuevoId: () => `cambio-${++n}` });
  return { local, servidor, subidor };
}

describe('subir lo pendiente', () => {
  it('una alineación nueva se sube con su mismo id y queda en la versión 1, sin nada pendiente', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));

    expect(await subidor.subir()).toEqual({ estado: 'al-dia', subidas: 1, conflictos: 0 });
    expect(servidor.filas.get('a')).toMatchObject({ version: 1, alineacion: { nombre: 'Titular del sábado' } });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('un cambio posterior se sube desde la versión de la que parte y pasa a la 2', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    await local.guardar(alineacion('a', 'Con cambios'));

    expect(await subidor.subir()).toMatchObject({ estado: 'al-dia', subidas: 1 });
    expect(servidor.filas.get('a')).toMatchObject({ version: 2, alineacion: { nombre: 'Con cambios' } });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('si se pierde la respuesta de un alta, el reintento la reconoce: no se duplica ni da conflicto', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    servidor.cortarRed('despues');

    expect(await subidor.subir()).toMatchObject({ estado: 'sin-conexion' });
    expect(servidor.filas.get('a')?.version).toBe(1);

    expect(await subidor.subir()).toEqual({ estado: 'al-dia', subidas: 1, conflictos: 0 });
    expect(servidor.filas.size).toBe(1);
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('si se pierde la respuesta de un cambio, el reintento lo reconoce: ni copia ni conflicto', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    await local.guardar(alineacion('a', 'Con cambios'));
    servidor.cortarRed('despues');

    expect(await subidor.subir()).toMatchObject({ estado: 'sin-conexion' });
    expect(await subidor.subir()).toEqual({ estado: 'al-dia', subidas: 1, conflictos: 0 });
    expect(servidor.filas.get('a')).toMatchObject({ version: 2, alineacion: { nombre: 'Con cambios' } });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('si se pierde la respuesta y después se edita, el reintento sube también lo nuevo: no lo da por subido', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    await local.guardar(alineacion('a', 'Primer cambio'));
    servidor.cortarRed('despues');
    expect(await subidor.subir()).toMatchObject({ estado: 'sin-conexion' });
    await local.guardar(alineacion('a', 'Segundo cambio'));

    await subidor.subir();
    await subidor.subir();
    expect(servidor.filas.get('a')).toMatchObject({ version: 3, alineacion: { nombre: 'Segundo cambio' } });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('sin red, todo sigue por subir y se reintenta en la siguiente vuelta', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    servidor.cortarRed('antes');

    expect(await subidor.subir()).toMatchObject({ estado: 'sin-conexion', subidas: 0 });
    expect(await local.pendientesDeSubir()).toHaveLength(1);
    expect(await subidor.subir()).toMatchObject({ estado: 'al-dia', subidas: 1 });
  });

  it('si se edita mientras se sube, al terminar sigue por subir y la siguiente vuelta sube lo nuevo', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    await local.guardar(alineacion('a', 'Primer cambio'));
    servidor.alRecibir = () => local.guardar(alineacion('a', 'Segundo cambio'));

    await subidor.subir();
    expect(servidor.filas.get('a')).toMatchObject({ version: 2, alineacion: { nombre: 'Primer cambio' } });
    expect(await local.pendientesDeSubir()).toMatchObject([{ id: 'a', versionServidor: 2, pendiente: true }]);

    await subidor.subir();
    expect(servidor.filas.get('a')).toMatchObject({ version: 3, alineacion: { nombre: 'Segundo cambio' } });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('si otro dispositivo la cambió, no se pisa: queda en conflicto, no se reintenta y no bloquea a las demás', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    servidor.cambiarDesdeOtroDispositivo('a');
    await local.guardar(alineacion('a', 'Cambio de este dispositivo'));
    await local.guardar(alineacion('b'));

    expect(await subidor.subir()).toEqual({ estado: 'al-dia', subidas: 1, conflictos: 1 });
    expect(servidor.filas.get('a')).toMatchObject({ version: 2, alineacion: { nombre: 'Cambiada en otro dispositivo' } });
    expect(servidor.filas.get('b')?.version).toBe(1);
    expect(await local.pendientesDeSubir()).toMatchObject([{ id: 'a', conflicto: true, pendiente: true }]);

    const llamadas = servidor.llamadas;
    expect(await subidor.subir()).toEqual({ estado: 'al-dia', subidas: 0, conflictos: 1 });
    expect(servidor.llamadas).toBe(llamadas);
  });

  it('borrar una que nunca se subió no usa la red', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await local.eliminar('a');

    await subidor.subir();
    expect(servidor.llamadas).toBe(0);
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('borrar una ya subida la marca como borrada en el servidor y quita la marca', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    await local.eliminar('a');

    expect(await subidor.subir()).toMatchObject({ estado: 'al-dia', subidas: 1 });
    expect(servidor.filas.get('a')).toMatchObject({ eliminada: true, version: 2 });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('borrar contra editar: si otro dispositivo la cambió, gana la edición y se descarta el borrado', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    servidor.cambiarDesdeOtroDispositivo('a');
    await local.eliminar('a');

    expect(await subidor.subir()).toMatchObject({ estado: 'al-dia', conflictos: 0 });
    expect(servidor.filas.get('a')).toMatchObject({ eliminada: false, version: 2 });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('si el servidor ya no la tiene, se vuelve a subir como nueva', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await subidor.subir();
    servidor.filas.delete('a');
    await local.guardar(alineacion('a', 'Sigue aquí'));

    await subidor.subir();
    await subidor.subir();
    expect(servidor.filas.get('a')).toMatchObject({ version: 1, alineacion: { nombre: 'Sigue aquí' } });
    expect(await local.pendientesDeSubir()).toEqual([]);
  });

  it('un error del servidor (por ejemplo, de permisos) detiene la vuelta y deja todo por subir', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));
    await local.guardar(alineacion('b'));
    servidor.fallarCon(new ErrorSupabase('new row violates row-level security policy', '42501', 403));

    expect(await subidor.subir()).toMatchObject({ estado: 'error', subidas: 0, mensaje: 'new row violates row-level security policy' });
    expect(servidor.filas.size).toBe(0);
    expect(await local.pendientesDeSubir()).toHaveLength(2);
  });

  it('dos vueltas a la vez no suben dos veces', async () => {
    const { local, servidor, subidor } = preparar();
    await local.guardar(alineacion('a'));

    await Promise.all([subidor.subir(), subidor.subir()]);
    expect(servidor.filas.get('a')?.version).toBe(1);
    expect(await local.pendientesDeSubir()).toEqual([]);
  });
});

describe('disparador: a los 5 s del último guardado', () => {
  afterEach(() => vi.useRealTimers());

  it('varios guardados seguidos son una sola subida, 5 s después del último', () => {
    vi.useFakeTimers();
    const subir = vi.fn();
    const programar = crearProgramador(subir, 5000);

    programar();
    vi.advanceTimersByTime(3000);
    programar();
    vi.advanceTimersByTime(4999);
    expect(subir).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(subir).toHaveBeenCalledTimes(1);
  });
});
