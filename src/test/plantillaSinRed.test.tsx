import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Jugador } from '../types';

/**
 * S1.12: la plantilla se guarda en el dispositivo cada vez que llega de
 * Supabase, sin fotos. Sin conexión se usa esa copia: los jugadores salen con
 * iniciales y dorsal, y se pueden poner y cambiar en el campo.
 */
const red = vi.hoisted(() => ({ caida: false, fotosCaidas: false }));
const { jugador } = vi.hoisted(() => ({
  jugador: (id: string, categoriaId: string, fotoPath: string | null = null): Jugador => ({
    id,
    categoriaId,
    nombre: 'Juan',
    apellido: `Apellido ${id}`,
    dorsal: 9,
    posicionNatural: 'DC',
    posicionesSecundarias: [],
    fotoUrl: null,
    fotoPath,
    piePreferido: 'derecho',
    activo: true,
  }),
}));

vi.mock('../data/supabase/plantillaApi', async (original) => ({
  ...(await original<typeof import('../data/supabase/plantillaApi')>()),
  listarCategorias: vi.fn(async () => {
    if (red.caida) throw new TypeError('Failed to fetch');
    return [
      { id: 'sub20', nombre: 'Sub-20', orden: 1 },
      { id: 'sub15', nombre: 'Sub-15', orden: 2 },
    ];
  }),
  listarJugadores: vi.fn(async (categoriaId: string) => {
    if (red.caida) throw new TypeError('Failed to fetch');
    return [jugador(`${categoriaId}-1`, categoriaId, `${categoriaId}/1.webp`)];
  }),
  firmarFotos: vi.fn(async (rutas: string[]) => {
    if (red.caida || red.fotosCaidas) throw new TypeError('Failed to fetch');
    return Object.fromEntries(rutas.map((r) => [r, { url: `https://x.supabase.co/storage/v1/object/sign/jugadores/${r}?token=t`, renovarEn: Date.now() + 3_600_000 }]));
  }),
}));

const { usePlantillaStore } = await import('../store/plantillaStore');
const { leerPlantillaGuardada } = await import('../data/plantillaLocal');
const { TarjetaJugador } = await import('../components/jugador/TarjetaJugador');
const plantilla = () => usePlantillaStore.getState();

describe('la plantilla, con y sin conexión', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(red, { caida: false, fotosCaidas: false });
    usePlantillaStore.setState({ categorias: [], categoriaActiva: null, jugadores: [], personalizados: [], enlaces: {}, error: null, copiaLocal: null });
  });

  it('con conexión, llega de Supabase con fotos y deja una copia en el dispositivo, sin enlaces', async () => {
    await plantilla().inicializar();

    expect(plantilla().jugadores[0]?.fotoUrl).toContain('token=');
    expect(plantilla().copiaLocal).toBeNull();
    const copia = leerPlantillaGuardada();
    expect(copia.categorias.map((c) => c.id)).toEqual(['sub20', 'sub15']);
    expect(copia.porCategoria['sub20']?.jugadores).toMatchObject([{ id: 'sub20-1', fotoUrl: null, fotoPath: 'sub20/1.webp' }]);
    expect(JSON.stringify(copia)).not.toContain('token=');
  });

  it('sin conexión, abre con la copia: sin fotos, con iniciales y dorsal, y dice desde cuándo es', async () => {
    await plantilla().inicializar();
    red.caida = true;

    await plantilla().inicializar();

    expect(plantilla()).toMatchObject({ error: null, categorias: [{ id: 'sub20' }, { id: 'sub15' }] });
    expect(plantilla().jugadores).toMatchObject([{ id: 'sub20-1', fotoUrl: null, dorsal: 9 }]);
    expect(plantilla().copiaLocal).toBe(leerPlantillaGuardada().porCategoria['sub20']?.guardadaEn);
  });

  it('los personalizados de la alineación abierta siguen también con la copia', async () => {
    await plantilla().inicializar();
    red.caida = true;
    plantilla().sincronizarPersonalizados([jugador('p1', 'personalizado')]);

    await plantilla().recargar();
    expect(plantilla().jugadores.map((j) => j.id)).toEqual(['sub20-1', 'p1']);
  });

  it('sin conexión y sin copia de esa categoría, avisa que no hay conexión, como antes', async () => {
    await plantilla().inicializar();
    red.caida = true;

    await plantilla().elegirCategoria('sub15');
    expect(plantilla().error).toMatch(/No se pudo conectar/);
    expect(plantilla().copiaLocal).toBeNull();
  });

  it('si solo fallan las fotos, se ven los jugadores sin foto en lugar de un error', async () => {
    red.fotosCaidas = true;
    await plantilla().inicializar();

    expect(plantilla()).toMatchObject({ error: null, copiaLocal: null });
    expect(plantilla().jugadores).toMatchObject([{ id: 'sub20-1', fotoUrl: null }]);
  });

  it('al volver la señal, se vuelve a cargar de Supabase, con fotos', async () => {
    await plantilla().inicializar();
    red.caida = true;
    await plantilla().inicializar();
    expect(plantilla().copiaLocal).not.toBeNull();

    red.caida = false;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(plantilla().copiaLocal).toBeNull());
    expect(plantilla().jugadores[0]?.fotoUrl).toContain('token=');
  });
});

describe('la ficha en el campo sin señal', () => {
  it('si la foto no carga, salen las iniciales y el dorsal', () => {
    const conFoto = { ...jugador('j1', 'sub20'), nombre: 'Andrés', apellido: 'Rangel', fotoUrl: 'https://x.supabase.co/foto.webp?token=t' };
    const { container } = render(<TarjetaJugador jugador={conFoto} />);

    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });
});
