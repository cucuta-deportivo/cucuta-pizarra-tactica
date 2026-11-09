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

const subida = (id: string): RegistroSincronizacion => ({ id, versionServidor: 3, pendiente: false, eliminada: false });

describe('marca "por subir"', () => {
  it('guardar marca por subir; si nunca se subió, no hay versión del servidor', () => {
    expect(marcarPorSubir(undefined, 'a')).toEqual({ id: 'a', versionServidor: null, pendiente: true, eliminada: false });
  });

  it('guardar una ya subida la vuelve a marcar y conserva la versión de la que parte', () => {
    expect(marcarPorSubir(subida('a'), 'a')).toEqual({ id: 'a', versionServidor: 3, pendiente: true, eliminada: false });
  });

  it('borrar deja una marca de borrado por subir, con la versión de la que parte', () => {
    expect(marcarEliminadaPorSubir(subida('a'), 'a')).toEqual({ id: 'a', versionServidor: 3, pendiente: true, eliminada: true });
    expect(marcarEliminadaPorSubir(undefined, 'b')).toEqual({ id: 'b', versionServidor: null, pendiente: true, eliminada: true });
  });
});

describe('repositorio: marca al guardar y al borrar', () => {
  it('lo guardado queda por subir', async () => {
    const repositorio = new MemoriaAlineacionRepository();
    await repositorio.guardar(alineacion('a'));
    await repositorio.guardar(alineacion('b'));

    expect(await repositorio.pendientesDeSubir()).toEqual([
      { id: 'a', versionServidor: null, pendiente: true, eliminada: false },
      { id: 'b', versionServidor: null, pendiente: true, eliminada: false },
    ]);
  });

  it('lo borrado desaparece de la lista pero queda su marca de borrado por subir', async () => {
    const repositorio = new MemoriaAlineacionRepository();
    await repositorio.guardar(alineacion('a'));
    await repositorio.guardar(alineacion('b'));
    await repositorio.eliminar('a');

    expect((await repositorio.listar()).map((r) => r.id)).toEqual(['b']);
    expect(await repositorio.obtener('a')).toBeUndefined();
    expect(await repositorio.pendientesDeSubir()).toContainEqual({ id: 'a', versionServidor: null, pendiente: true, eliminada: true });
  });
});
