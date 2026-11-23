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

  it('avisan de que cambian el orden y no usan ◀ ▶', () => {
    render(<TimelineTactica />);
    const izquierda = screen.getByRole('button', { name: 'Mover la fase 2 a la izquierda' });
    const derecha = screen.getByRole('button', { name: 'Mover la fase 2 a la derecha' });
    expect(izquierda).toHaveAttribute('title', 'Mover esta fase a la izquierda. Cambia el orden de la jugada.');
    expect(derecha).toHaveAttribute('title', 'Mover esta fase a la derecha. Cambia el orden de la jugada.');
    expect(izquierda.textContent).not.toMatch(/[◀▶]/);
    expect(derecha.textContent).not.toMatch(/[◀▶]/);
  });

  it('mueven la fase activa, que se va con ella', () => {
    render(<TimelineTactica />);
    fireEvent.click(screen.getByRole('button', { name: 'Mover la fase 2 a la derecha' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase']);
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(2);
  });
});

/**
 * Con la barra de tiempo arrastrada (previsualizando) el campo enseña un instante
 * del reloj, no la fase que se edita. La línea de tiempo tiene que marcar la fase
 * que se VE y no dejar editar fases: antes marcaba la fase activa del documento, y
 * mover o borrar actuaba sobre una fase que no estaba en pantalla.
 */
describe('línea de tiempo con la barra arrastrada', () => {
  const estado = () => useAlineacionStore.getState();
  const nombres = () => estado().historial.presente.secuencia!.frames.map((f) => f.nombre);

  // Fase activa del documento: la 3 («Remate», como al terminar la reproducción); en pantalla, la 1.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    sembrarPlantilla();
    estado().nuevaAlineacion();
    estado().iniciarSecuencia();
    estado().renombrarFrame(0, 'Salida');
    estado().agregarFrame();
    estado().renombrarFrame(1, 'Pase');
    estado().agregarFrame();
    estado().renombrarFrame(2, 'Remate');
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: true, indiceFrame: 0, tiempoMs: 0 });
  });

  it('marca la pestaña y el nombre de la fase que se ve', () => {
    render(<TimelineTactica />);
    expect(screen.getByRole('button', { name: 'Frame 1: Salida' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('textbox', { name: 'Nombre del frame 1' })).toHaveValue('Salida');
  });

  it('no deja mover, renombrar, insertar, duplicar ni borrar fases', () => {
    render(<TimelineTactica />);
    expect(screen.getByRole('button', { name: 'Mover la fase 1 a la derecha' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Nombre del frame 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Fase$/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicar este frame' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar este frame' })).toBeDisabled();
    expect(nombres()).toEqual(['Salida', 'Pase', 'Remate']);
  });

  it('tocar una pestaña sale de la barra y deja esa fase lista para editar', () => {
    render(<TimelineTactica />);
    fireEvent.click(screen.getByRole('button', { name: 'Frame 2: Pase' }));
    expect(useReproduccionStore.getState().previsualizando).toBe(false);
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(1);
    expect(screen.getByRole('button', { name: 'Mover la fase 2 a la derecha' })).toBeEnabled();
  });
});
