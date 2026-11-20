import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Jugador } from '../types';

/**
 * F5.1: traspaso definitivo de un jugador a otra categoría. La MISMA fila cambia
 * de categoría (mismo id: las alineaciones guardadas lo siguen encontrando), el
 * dorsal se comprueba en la categoría de destino y la foto no se mueve.
 */
const { jugador } = vi.hoisted(() => ({
  jugador: (id: string, categoriaId: string, dorsal: number, fotoPath: string | null = null): Jugador => ({
    id,
    categoriaId,
    nombre: 'Juan',
    apellido: `Apellido ${id}`,
    dorsal,
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
  traspasarJugador: vi.fn(async () => undefined),
  actualizarJugador: vi.fn(async () => undefined),
  subirFoto: vi.fn(async () => undefined),
  guardarRutaFoto: vi.fn(async () => undefined),
  firmarFotos: vi.fn(async () => ({})),
}));

const { usePlantillaStore } = await import('../store/plantillaStore');
const api = await import('../data/supabase/plantillaApi');
const { leerPlantillaGuardada } = await import('../data/plantillaLocal');
const { FormularioJugador } = await import('../components/plantilla/FormularioJugador');
const plantilla = () => usePlantillaStore.getState();

const DATOS = { nombre: 'Juan', apellido: 'Apellido a', dorsal: 7, posicionPrincipal: 'DC' as const, posicionSecundaria: null };

describe('traspaso de un jugador a otra categoría (F5.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    usePlantillaStore.setState({
      categorias: [
        { id: 'sub15', nombre: 'Sub-15', orden: 3 },
        { id: 'sub17', nombre: 'Sub-17', orden: 2 },
      ],
      categoriaActiva: 'sub15',
      jugadores: [jugador('a', 'sub15', 7, 'sub15/a.webp'), jugador('b', 'sub15', 9)],
      personalizados: [],
      enlaces: {},
      error: null,
      copiaLocal: null,
    });
  });

  it('el jugador sale de la plantilla cargada y de su copia en el dispositivo', async () => {
    expect(await plantilla().traspasarJugador('a', 'sub17', DATOS)).toBe(true);
    expect(api.traspasarJugador).toHaveBeenCalledWith('a', 'sub17', DATOS);
    expect(plantilla().jugadores.map((j) => j.id)).toEqual(['b']);
    expect(leerPlantillaGuardada().porCategoria['sub15']!.jugadores.map((j) => j.id)).toEqual(['b']);
  });

  it('si el dorsal choca en la categoría de destino, vuelve a la lista y el aviso nombra esa categoría', async () => {
    vi.mocked(api.traspasarJugador).mockRejectedValueOnce(new Error('Ese dorsal ya lo lleva otro jugador activo de la categoría.'));
    expect(await plantilla().traspasarJugador('a', 'sub17', DATOS)).toBe(false);
    expect(plantilla().jugadores.map((j) => j.id)).toEqual(['a', 'b']);
    expect(plantilla().error).toBe('Ese dorsal ya lo lleva otro jugador activo de Sub-17. Cambia el dorsal o déjalo vacío.');
  });

  it('una foto nueva reutiliza la ruta que ya tiene, aunque su carpeta sea la categoría de antes', async () => {
    usePlantillaStore.setState({ categoriaActiva: 'sub17', jugadores: [jugador('a', 'sub17', 7, 'sub15/a.webp')] });
    await plantilla().establecerFoto('a', new Blob(['x'], { type: 'image/webp' }));
    expect(api.subirFoto).toHaveBeenCalledWith('sub15/a.webp', expect.any(Blob));
    expect(api.guardarRutaFoto).toHaveBeenCalledWith('a', 'sub15/a.webp');
  });

  it('sin foto, la primera va a la carpeta de su categoría, como siempre', async () => {
    await plantilla().establecerFoto('b', new Blob(['x'], { type: 'image/webp' }));
    expect(api.subirFoto).toHaveBeenCalledWith('sub15/b.webp', expect.any(Blob));
  });

  it('en la ventana de editar, otra categoría avisa, cambia el botón y no frena un dorsal que solo choca en esta', async () => {
    const onCerrar = vi.fn();
    render(<FormularioJugador abierto jugador={plantilla().jugadores[0]!} onCerrar={onCerrar} />);

    // El 9 lo lleva otro de la Sub-15: sin traspaso, no deja guardar.
    fireEvent.change(screen.getByPlaceholderText('Sin dorsal'), { target: { value: '9' } });
    expect(screen.getByText('Ese dorsal ya lo lleva otro jugador activo de la categoría.')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'sub17' } });
    expect(screen.queryByText('Ese dorsal ya lo lleva otro jugador activo de la categoría.')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('pasa a Sub-17 y deja de estar en Sub-15');

    fireEvent.click(screen.getByRole('button', { name: 'Traspasar y guardar' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(api.traspasarJugador).toHaveBeenCalledWith('a', 'sub17', expect.objectContaining({ dorsal: 9 }));
    expect(api.actualizarJugador).not.toHaveBeenCalled();
  });

  it('tras un dorsal ocupado en la otra categoría, se corrige y el segundo intento sí se envía', async () => {
    vi.mocked(api.traspasarJugador).mockRejectedValueOnce(new Error('Ese dorsal ya lo lleva otro jugador activo de la categoría.'));
    const onCerrar = vi.fn();
    render(<FormularioJugador abierto jugador={plantilla().jugadores[0]!} onCerrar={onCerrar} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'sub17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Traspasar y guardar' }));
    expect(await screen.findByText(/de Sub-17\. Cambia el dorsal/)).toBeInTheDocument();
    expect(onCerrar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Sin dorsal'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Traspasar y guardar' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(api.traspasarJugador).toHaveBeenCalledTimes(2);
    expect(api.traspasarJugador).toHaveBeenLastCalledWith('a', 'sub17', expect.objectContaining({ dorsal: 14 }));
  });

  it('sin cambiar la categoría se guarda como siempre, y al crear un jugador no aparece', async () => {
    const onCerrar = vi.fn();
    const { unmount } = render(<FormularioJugador abierto jugador={plantilla().jugadores[0]!} onCerrar={onCerrar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(api.actualizarJugador).toHaveBeenCalled();
    expect(api.traspasarJugador).not.toHaveBeenCalled();
    unmount();

    render(<FormularioJugador abierto jugador={null} onCerrar={() => undefined} />);
    expect(screen.queryByRole('combobox', { name: 'Categoría' })).not.toBeInTheDocument();
  });
});
