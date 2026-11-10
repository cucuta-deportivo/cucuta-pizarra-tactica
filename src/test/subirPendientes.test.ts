import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearProgramador, crearSubidor } from '../data/sincronizacion/subirPendientes';
import { MemoriaAlineacionRepository } from '../data/repositorio/memoriaAlineacionRepository';
import { ErrorSupabase } from '../data/supabase/alineacionesApi';
import { alineacion, ServidorFalso } from './servidorFalso';

/**
 * S1.6: subir lo marcado "por subir" sin pisar nunca el trabajo de otro
 * dispositivo, contra un servidor falso con las reglas de la tabla real.
 */
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
