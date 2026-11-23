import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { sembrarPlantilla } from './fixturePlantilla';
import { TimelineTactica } from '../components/pizarra/TimelineTactica';
import { useAlineacionStore } from '../store/alineacionStore';
import { useReproduccionStore } from '../store/reproduccionStore';

/**
 * Los botones de reordenar fases no pueden parecer de navegar: con ◀ ▶ se usaban
 * para ir a otra fase y cambiaban el orden de la jugada sin que se notara. Ahora
 * dicen qué fase mueven y que eso cambia el orden.
 */
describe('reordenar fases: los botones dicen lo que hacen', () => {
  const estado = () => useAlineacionStore.getState();
  const nombres = () => estado().historial.presente.secuencia!.frames.map((f) => f.nombre);

  beforeEach(() => {
    // jsdom no implementa scrollIntoView, que la línea de tiempo usa para tener a la vista la pestaña activa.
    Element.prototype.scrollIntoView = vi.fn();
    sembrarPlantilla();
    estado().nuevaAlineacion();
    estado().iniciarSecuencia();
    estado().renombrarFrame(0, 'Salida');
    estado().agregarFrame();
    estado().renombrarFrame(1, 'Pase');
    estado().agregarFrame();
    estado().renombrarFrame(2, 'Remate');
    estado().irAFrame(1);
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 1, tiempoMs: 0 });
  });

  it('nombran la fase que mueven, avisan de que cambia el orden y no usan ◀ ▶', () => {
    render(<TimelineTactica />);
    const antes = screen.getByRole('button', { name: 'Mover la fase 2 una posición antes' });
    const despues = screen.getByRole('button', { name: 'Mover la fase 2 una posición después' });
    expect(antes).toHaveAttribute('title', expect.stringContaining('Mover la fase 2 («Pase») una posición antes. Cambia el orden de la jugada'));
    expect(despues).toHaveAttribute('title', expect.stringContaining('una posición después'));
    expect(antes.textContent).not.toMatch(/[◀▶]/);
    expect(despues.textContent).not.toMatch(/[◀▶]/);
  });

  it('mueven la fase activa, que se va con ella', () => {
    render(<TimelineTactica />);
    fireEvent.click(screen.getByRole('button', { name: 'Mover la fase 2 una posición después' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase']);
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(2);
  });
});
