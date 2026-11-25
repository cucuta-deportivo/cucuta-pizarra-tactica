import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { sembrarPlantilla } from './fixturePlantilla';
import { VentanaJugadas } from '../components/pizarra/VentanaJugadas';
import { TimelineTactica } from '../components/pizarra/TimelineTactica';
import { useAlineacionStore } from '../store/alineacionStore';
import { useReproduccionStore } from '../store/reproduccionStore';
import { useUiStore } from '../store/uiStore';
import { obtenerFormacion } from '../data/formaciones';
import { usePlantillaStore } from '../store/plantillaStore';
import { PESO_TOPE } from '../utils/pesoAlineacion';

/**
 * F5.4b, paso 5: la ventana «Jugadas». Todas las jugadas de la alineación, para
 * que no se pierda ninguna; el espacio, en porcentaje (los entrenadores no saben
 * qué es un KB); y el nombre de la jugada abierta en la barra, que abre la ventana.
 */
const estado = () => useAlineacionStore.getState();
const doc = () => estado().historial.presente;
const filas = () => within(screen.getByRole('list', { name: 'Jugadas de esta alineación' })).getAllByRole('listitem');

/** Tres jugadas: «Salida» y «Córner» cerradas, «Contra» abierta (la última). */
function tresJugadas(): void {
  estado().iniciarSecuencia();
  estado().agregarFrame();
  estado().renombrarJugada(doc().secuencia!.id!, 'Salida');
  estado().nuevaJugada();
  estado().renombrarJugada(doc().secuencia!.id!, 'Córner');
  estado().nuevaJugada();
  estado().renombrarJugada(doc().secuencia!.id!, 'Contra');
}

beforeEach(() => {
  // La barra mide sus filas; jsdom no tiene ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  sembrarPlantilla();
  useUiStore.setState({ toasts: [], ventanaJugadasAbierta: false });
  useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, grabando: false, indiceFrame: 0, tiempoMs: 0 });
  estado().nuevaAlineacion('Ventana');
  const zona = obtenerFormacion(doc().formacionId)!.zonas[0]!;
  estado().asignarJugador(zona.id, zona.x, zona.y, usePlantillaStore.getState().jugadores[0]!.id);
});

describe('ventana «Jugadas»', () => {
  it('lista todas en su orden, con la abierta marcada, y el espacio en porcentaje, sin KB', () => {
    tresJugadas();
    render(<VentanaJugadas abierto onCerrar={vi.fn()} />);
    expect(filas().map((f) => f.getAttribute('aria-label'))).toEqual(['Salida', 'Córner', 'Contra']);
    expect(filas()[2]).toHaveAttribute('aria-current', 'true');
    expect(within(filas()[0]!).getByText('2 fases')).toBeInTheDocument();
    const medidor = screen.getByRole('meter', { name: 'Espacio usado de esta alineación' });
    expect(Number(medidor.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
    expect(screen.getByRole('dialog').textContent).not.toMatch(/KB|MB/);
    // La miniatura de la fase 1: el jugador colocado, en rojo.
    expect(filas()[0]!.querySelectorAll('svg circle[fill="#DA3939"]')).toHaveLength(1);
  });

  it('abrir otra la abre (la abierta queda guardada en su sitio) y cierra la ventana', () => {
    tresJugadas();
    const onCerrar = vi.fn();
    render(<VentanaJugadas abierto onCerrar={onCerrar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir «Salida»' }));
    expect(doc().secuencia!.nombre).toBe('Salida');
    expect(doc().jugadas.map((j) => j.nombre)).toEqual(['Córner', 'Contra']);
    expect(onCerrar).toHaveBeenCalled();
  });

  it('renombrar y describir desde la ventana', () => {
    tresJugadas();
    render(<VentanaJugadas abierto onCerrar={vi.fn()} />);
    const nombre = screen.getByRole('textbox', { name: 'Nombre de la jugada 2' });
    fireEvent.change(nombre, { target: { value: 'Córner al primer palo' } });
    fireEvent.blur(nombre);
    const descripcion = screen.getByRole('textbox', { name: 'Descripción de la jugada 2' });
    fireEvent.change(descripcion, { target: { value: 'El 4 ataca el primer palo; el 9, el segundo.' } });
    fireEvent.blur(descripcion);
    expect(doc().jugadas[1]).toMatchObject({ nombre: 'Córner al primer palo', descripcion: 'El 4 ataca el primer palo; el 9, el segundo.' });
  });

  it('duplicar pone la copia detrás; borrar pide dos toques y deja Deshacer', () => {
    tresJugadas();
    render(<VentanaJugadas abierto onCerrar={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar «Salida»' }));
    expect(filas().map((f) => f.getAttribute('aria-label'))).toEqual(['Salida', 'Salida (copia)', 'Córner', 'Contra']);

    fireEvent.click(screen.getByRole('button', { name: 'Borrar «Córner»' }));
    expect(doc().jugadas.map((j) => j.nombre)).toContain('Córner');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: borrar «Córner»' }));
    expect(filas().map((f) => f.getAttribute('aria-label'))).toEqual(['Salida', 'Salida (copia)', 'Contra']);
    useUiStore.getState().toasts.find((t) => t.accion?.etiqueta === 'Deshacer')!.accion!.ejecutar();
    expect(doc().jugadas.map((j) => j.nombre)).toContain('Córner');
  });

  it('jugada nueva y grabar jugada nueva: parten de la pizarra y cierran la ventana', () => {
    tresJugadas();
    const onCerrar = vi.fn();
    const { unmount } = render(<VentanaJugadas abierto onCerrar={onCerrar} />);
    fireEvent.click(screen.getByRole('button', { name: '＋ Nueva jugada' }));
    expect(doc().secuencia!.nombre).toBe('Jugada 4');
    expect(onCerrar).toHaveBeenCalledTimes(1);
    unmount();

    render(<VentanaJugadas abierto onCerrar={onCerrar} />);
    fireEvent.click(screen.getByRole('button', { name: '⏺ Grabar jugada nueva' }));
    expect(doc().secuencia!.nombre).toBe('Jugada 5');
    expect(useReproduccionStore.getState().grabando).toBe(true);
  });

  it('sin jugadas, lo dice', () => {
    render(<VentanaJugadas abierto onCerrar={vi.fn()} />);
    expect(screen.getByText(/no tiene jugadas todavía/)).toBeInTheDocument();
  });

  it('llena: lo dice en porcentaje y no deja crear ni duplicar', () => {
    tresJugadas();
    useAlineacionStore.setState({ pesoAlineacion: () => PESO_TOPE + 10_000 });
    render(<VentanaJugadas abierto onCerrar={vi.fn()} />);
    expect(screen.getByText('Llena (100 %)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ Nueva jugada' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicar «Salida»' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Borrar «Salida»' })).toBeEnabled();
  });
});

describe('la jugada abierta, a la vista en la barra', () => {
  it('su nombre con ▾ está al principio de la fila de pestañas y abre la ventana', () => {
    tresJugadas();
    render(<TimelineTactica />);
    const boton = screen.getByRole('button', { name: 'Jugada abierta: Contra. Ver todas las jugadas' });
    expect(boton).toHaveTextContent('Contra');
    fireEvent.click(boton);
    expect(useUiStore.getState().ventanaJugadasAbierta).toBe(true);
  });
});
