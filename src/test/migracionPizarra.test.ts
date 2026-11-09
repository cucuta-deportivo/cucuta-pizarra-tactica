import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alineacionRepository } from '../data/repositorio';
import { marcarParaSubir } from '../data/sincronizacion/migrar';
import { esAlineacionVaciaSinTocar, useAlineacionStore } from '../store/alineacionStore';
import { DEBOUNCE_AUTOGUARDADO_MS } from '../utils/constantes';
import { alineacion } from './servidorFalso';
import { sembrarPlantilla } from './fixturePlantilla';
import type { Alineacion } from '../types';

/** S1.8 en la pizarra: qué no se migra, la pizarra abierta durante la migración y el respaldo. */
const pizarra = () => useAlineacionStore.getState();

async function guardadaDesdeLaPizarra(): Promise<Alineacion> {
  await pizarra().guardarAhora();
  return (await alineacionRepository.obtener(pizarra().id))!;
}

describe('vacía sin tocar: se queda en el dispositivo, no se sube', () => {
  beforeEach(() => {
    sembrarPlantilla();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('la "Alineación inicial" recién creada, aunque el balón tenga otro id', async () => {
    pizarra().nuevaAlineacion('Alineación inicial');
    const vacia = await guardadaDesdeLaPizarra();

    expect(esAlineacionVaciaSinTocar(vacia)).toBe(true);
    expect(esAlineacionVaciaSinTocar({ ...vacia, balones: vacia.balones!.map((b) => ({ ...b, id: 'otro' })) })).toBe(true);
  });

  it('también con el nombre automático con fecha, que la versión anterior guardaba al borrar la última', async () => {
    pizarra().nuevaAlineacion();
    expect(pizarra().nombre).toMatch(/^Alineación \d{1,2}\/\d{1,2}\/\d{4}$/);
    expect(esAlineacionVaciaSinTocar(await guardadaDesdeLaPizarra())).toBe(true);
  });

  it('una de una versión antigua, sin los campos que se añadieron después, también', () => {
    const { objetos: _o, balones: _b, cuadricula: _c, rival: _r, marcajes: _m, cancha: _ca, ...antigua } = alineacion('vieja', 'Alineación inicial');
    expect(esAlineacionVaciaSinTocar(antigua as Alineacion)).toBe(true);
  });

  it('con cualquier cambio, o con un nombre puesto por el entrenador, ya no', async () => {
    pizarra().nuevaAlineacion('Alineación inicial');
    pizarra().seleccionarFormacion('4-4-2');
    expect(esAlineacionVaciaSinTocar(await guardadaDesdeLaPizarra())).toBe(false);

    pizarra().nuevaAlineacion('Sub-15 vs Patriotas');
    expect(esAlineacionVaciaSinTocar(await guardadaDesdeLaPizarra())).toBe(false);
  });
});

describe('la pizarra durante la migración', () => {
  beforeEach(() => {
    sembrarPlantilla();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('abierta en una alineación que se migra, sigue guardando en ella sin hacer copia', async () => {
    await alineacionRepository.reescribir('m1', () => ({ escrituras: [{ id: 'm1', alineacion: alineacion('m1', 'De antes de S1') }], resultado: null }));
    await pizarra().cargarAlineacion('m1');
    await marcarParaSubir(alineacionRepository, ['m1']);

    pizarra().renombrar('Editada tras migrar');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_AUTOGUARDADO_MS + 10);

    expect(pizarra().id).toBe('m1');
    expect((await alineacionRepository.obtener('m1'))?.nombre).toBe('Editada tras migrar');
  });

  it('importar un respaldo trae cada alineación como copia nueva, con su nombre', async () => {
    const antes = (await alineacionRepository.listar()).length;

    expect(await pizarra().importarRespaldo([alineacion('r1', 'Del respaldo 1'), alineacion('r2', 'Del respaldo 2')])).toBe(2);

    const lista = await alineacionRepository.listar();
    expect(lista).toHaveLength(antes + 2);
    const traidas = lista.filter((a) => a.nombre.startsWith('Del respaldo'));
    expect(traidas.map((a) => a.id)).not.toContain('r1');
    expect(pizarra().listado.map((a) => a.nombre)).toEqual(expect.arrayContaining(['Del respaldo 1', 'Del respaldo 2']));
  });
});
