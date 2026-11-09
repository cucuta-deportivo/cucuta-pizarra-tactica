import { describe, expect, it } from 'vitest';
import { marcarEliminadaPorSubir, marcarPorSubir, type RegistroSincronizacion } from '../data/repositorio/AlineacionRepository';
import { MemoriaAlineacionRepository } from '../data/repositorio/memoriaAlineacionRepository';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import type { Alineacion } from '../types';

/**
 * S1.4: cada cambio hecho en este dispositivo deja una marca "por subir" junto a
 * la alineación. La sincronización (S1.6) sube lo marcado; una alineación sin
 * marca es anterior a la sincronización y la sube la migración (S1.8).
 */
function alineacion(id: string, nombre = 'Prueba'): Alineacion {
  const ahora = new Date().toISOString();
  return {
    id,
    nombre,
    formacionId: '4-3-3',
    titulares: [],
    banquillo: [],
    trazos: [],
    notas: '',
    creadaEn: ahora,
    modificadaEn: ahora,
    objetos: [],
    balones: [],
    cuadricula: cuadriculaVacia(),
    rival: null,
    marcajes: [],
    cancha: canchaVacia(),
  };
}

const subida = (id: string, cambios: Partial<RegistroSincronizacion> = {}): RegistroSincronizacion => ({
  id,
  versionServidor: 3,
  pendiente: false,
  eliminada: false,
  revision: 4,
  cambioEnCurso: null,
  revisionEnCurso: null,
  conflicto: false,
  ...cambios,
});

describe('marca "por subir"', () => {
  it('guardar marca por subir; si nunca se subió, no hay versión del servidor', () => {
    expect(marcarPorSubir(undefined, 'a')).toEqual({
      id: 'a',
      versionServidor: null,
      pendiente: true,
      eliminada: false,
      revision: 1,
      cambioEnCurso: null,
      revisionEnCurso: null,
      conflicto: false,
    });
  });

  it('guardar una ya subida la vuelve a marcar, conserva la versión de la que parte y cuenta un cambio más', () => {
    expect(marcarPorSubir(subida('a'), 'a')).toEqual(subida('a', { pendiente: true, revision: 5 }));
  });

  it('guardar durante una subida conserva su identificador y la revisión que llevaba, para reconocerla si se pierde la respuesta', () => {
    const marca = marcarPorSubir(subida('a', { pendiente: true, cambioEnCurso: 'cambio-7', revisionEnCurso: 4 }), 'a');
    expect(marca).toMatchObject({ cambioEnCurso: 'cambio-7', revisionEnCurso: 4, revision: 5 });
  });

  it('borrar deja una marca de borrado por subir, con la versión de la que parte', () => {
    expect(marcarEliminadaPorSubir(subida('a'), 'a')).toEqual(subida('a', { pendiente: true, eliminada: true, revision: 5 }));
    expect(marcarEliminadaPorSubir(undefined, 'b')).toMatchObject({ id: 'b', versionServidor: null, pendiente: true, eliminada: true });
  });

  it('borrar una en conflicto le quita el conflicto: se resuelve con las reglas del borrado', () => {
    expect(marcarEliminadaPorSubir(subida('a', { pendiente: true, conflicto: true }), 'a').conflicto).toBe(false);
  });
});

describe('repositorio: marca al guardar y al borrar', () => {
  it('lo guardado queda por subir', async () => {
    const repositorio = new MemoriaAlineacionRepository();
    await repositorio.guardar(alineacion('a'));
    await repositorio.guardar(alineacion('b'));

    expect(await repositorio.pendientesDeSubir()).toEqual([marcarPorSubir(undefined, 'a'), marcarPorSubir(undefined, 'b')]);
  });

  it('lo borrado desaparece de la lista pero queda su marca de borrado por subir', async () => {
    const repositorio = new MemoriaAlineacionRepository();
    await repositorio.guardar(alineacion('a'));
    await repositorio.guardar(alineacion('b'));
    await repositorio.eliminar('a');

    expect((await repositorio.listar()).map((r) => r.id)).toEqual(['b']);
    expect(await repositorio.obtener('a')).toBeUndefined();
    expect(await repositorio.pendientesDeSubir()).toContainEqual(marcarEliminadaPorSubir(marcarPorSubir(undefined, 'a'), 'a'));
  });

  it('una marca se cambia de un solo paso, o se quita', async () => {
    const repositorio = new MemoriaAlineacionRepository();
    await repositorio.guardar(alineacion('a'));

    const cambiada = await repositorio.actualizarMarca('a', (actual) => (actual ? { ...actual, versionServidor: 1, pendiente: false } : null));
    expect(cambiada).toMatchObject({ id: 'a', versionServidor: 1, pendiente: false });
    expect(await repositorio.pendientesDeSubir()).toEqual([]);

    expect(await repositorio.actualizarMarca('a', () => null)).toBeNull();
    await repositorio.guardar(alineacion('a'));
    expect((await repositorio.pendientesDeSubir())[0]).toMatchObject({ versionServidor: null, revision: 1 });
  });
});
