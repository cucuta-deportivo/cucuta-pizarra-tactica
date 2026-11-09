import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Jugador } from '../types';

/**
 * S1.2b: los jugadores personalizados de la alineación abierta se mezclan con la
 * plantilla para que el campo, el panel y los selectores los encuentren. Recargar
 * la plantilla (al arrancar con Supabase o al cambiar de categoría) no debe
 * dejarlos fuera: antes desaparecían del campo al recargar la página.
 */
const { jugador } = vi.hoisted(() => ({
  jugador: (id: string, categoriaId = 'sub20'): Jugador => ({
    id,
    categoriaId,
    nombre: `Nombre ${id}`,
    apellido: `Apellido ${id}`,
    dorsal: null,
    posicionNatural: 'MC',
    posicionesSecundarias: [],
    fotoUrl: null,
    fotoPath: null,
    piePreferido: 'derecho',
    activo: true,
  }),
}));

vi.mock('../data/supabase/plantillaApi', async (original) => ({
  ...(await original<typeof import('../data/supabase/plantillaApi')>()),
  listarJugadores: vi.fn(async (categoriaId: string) => [jugador(`${categoriaId}-1`, categoriaId)]),
  firmarFotos: vi.fn(async () => ({})),
}));

const { usePlantillaStore } = await import('../store/plantillaStore');
const plantilla = () => usePlantillaStore.getState();
const ids = () => plantilla().jugadores.map((j) => j.id);

describe('los personalizados de la alineación abierta siguen al recargar la plantilla', () => {
  beforeEach(() => {
    usePlantillaStore.setState({ categoriaActiva: 'sub20', jugadores: [jugador('sub20-1')], personalizados: [] });
  });

  it('recargar la plantilla no los deja fuera', async () => {
    plantilla().sincronizarPersonalizados([jugador('p1', 'personalizado')]);

    await plantilla().recargar();

    expect(ids()).toEqual(['sub20-1', 'p1']);
    expect(plantilla().obtenerPorId('p1')?.nombre).toBe('Nombre p1');
  });

  it('cambiar de categoría tampoco, ni mientras se carga la nueva', async () => {
    plantilla().sincronizarPersonalizados([jugador('p1', 'personalizado')]);

    const cambio = plantilla().elegirCategoria('sub15');
    expect(ids()).toEqual(['p1']);
    await cambio;

    expect(ids()).toEqual(['sub15-1', 'p1']);
  });

  it('al abrir otra alineación se ofrecen sus personalizados y ya no los de la anterior', () => {
    plantilla().sincronizarPersonalizados([jugador('p1', 'personalizado')]);
    plantilla().sincronizarPersonalizados([jugador('p2', 'personalizado')]);

    expect(ids()).toEqual(['sub20-1', 'p2']);
  });

  it('editar un personalizado lo reemplaza, sin duplicarlo', () => {
    plantilla().sincronizarPersonalizados([jugador('p1', 'personalizado')]);
    plantilla().sincronizarPersonalizados([{ ...jugador('p1', 'personalizado'), nombre: 'Editado' }]);

    expect(ids()).toEqual(['sub20-1', 'p1']);
    expect(plantilla().obtenerPorId('p1')?.nombre).toBe('Editado');
  });
});
