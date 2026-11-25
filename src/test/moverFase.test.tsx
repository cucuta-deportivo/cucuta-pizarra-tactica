import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { sembrarPlantilla } from './fixturePlantilla';
import { TimelineTactica } from '../components/pizarra/TimelineTactica';
import { useAlineacionStore } from '../store/alineacionStore';
import { useReproduccionStore } from '../store/reproduccionStore';
import { anchoOcupado } from '../utils/barraJugada';

const estado = () => useAlineacionStore.getState();
const nombres = () => estado().historial.presente.secuencia!.frames.map((f) => f.nombre);

/** Jugada de tres fases: Salida, Pase y Remate. */
function sembrarJugada(): void {
  // jsdom no implementa scrollIntoView; si la línea de tiempo lo llamara, la prueba no fallaría por eso.
  Element.prototype.scrollIntoView = vi.fn();
  sembrarPlantilla();
  estado().nuevaAlineacion();
  estado().iniciarSecuencia();
  estado().renombrarFrame(0, 'Salida');
  estado().agregarFrame();
  estado().renombrarFrame(1, 'Pase');
  estado().agregarFrame();
  estado().renombrarFrame(2, 'Remate');
}

/**
 * jsdom no maqueta. Se simula el sitio de la barra: `espacioFila` es lo que se
 * reparten el bloque «FASE x/y» y los controles que pueden esconderse; la barra
 * se mide al montarse con todo a la vista, así que el bloque mide eso menos lo que
 * ocupan los controles. `pestanas` es el ancho de la fila de pestañas.
 */
function simularBarra({ espacioFila, pestanas }: { espacioFila: number; pestanas: number }): void {
  const caja = (ancho: number) => ({ left: 0, top: 0, right: ancho, bottom: 44, width: ancho, height: 44, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.matches('span[title^="Fase"]')) return caja(espacioFila - anchoOcupado(0));
    if (this.classList.contains('barra-scroll')) return caja(pestanas);
    return caja(0);
  });
}
const ANCHA = { espacioFila: 2000, pestanas: 2000 }; // pantalla de escritorio: todo a la vista
const ESTRECHA = { espacioFila: 180, pestanas: 600 }; // tablet de 1024: solo ＋ Fase

function abrirMas() {
  fireEvent.click(screen.getByRole('button', { name: 'Más' }));
  return screen.getByRole('dialog', { name: 'Más: fase y jugada' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * En una pantalla ancha la edición de la fase se ve directamente, como en la barra
 * de antes, y el nombre y la curva de la jugada suben a la fila de las pestañas:
 * la fila de arriba es la jugada y la de abajo, la fase que se ve.
 */
describe('barra ancha: la edición de la fase a la vista', () => {
  beforeEach(() => {
    sembrarJugada();
    estado().irAFrame(1);
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 1, tiempoMs: 0 });
    simularBarra(ANCHA);
  });

  it('enseña nombre, duración, ＋ Fase, mover, duplicar y borrar, y arriba la curva de la jugada (su nombre, en la ventana Jugadas)', () => {
    render(<TimelineTactica />);
    expect(screen.getByRole('textbox', { name: 'Nombre de la fase' })).toHaveValue('Pase');
    expect(screen.getByRole('spinbutton', { name: 'Duración de la fase en segundos' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '＋ Fase' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Mover la fase 2 a la izquierda' })).toHaveAttribute(
      'title',
      'Mover esta fase a la izquierda. Cambia el orden de la jugada.',
    );
    expect(screen.getByRole('button', { name: 'Mover la fase 2 a la derecha' })).toHaveTextContent('Mover');
    expect(screen.getByRole('button', { name: 'Duplicar la fase 2' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Borrar la fase 2' })).toBeEnabled();
    expect(screen.queryByRole('textbox', { name: 'Nombre de la jugada' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Curva' })).toBeInTheDocument();
    // «Borrar» en rojo, pero sin el fondo rojo lleno: es lo más peligroso y no debe ser lo que más llama la atención.
    expect(screen.getByRole('button', { name: 'Borrar la fase 2' }).className).not.toMatch(/bg-red-950 /);
    expect(screen.getByRole('button', { name: 'Borrar la fase 2' }).className).toMatch(/text-red-300/);
  });

  it('«Más ▾» solo guarda «Añadir fase al final»', () => {
    render(<TimelineTactica />);
    const menu = abrirMas();
    expect(within(menu).getAllByRole('button').map((b) => b.textContent)).toEqual(['⇥ Añadir fase al final']);
    expect(within(menu).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('con el campo del nombre a la vista, el nombre no se repite junto a «FASE x/y»', () => {
    render(<TimelineTactica />);
    const fase = screen.getByTitle('Fase actual y tiempo transcurrido');
    expect(fase).toHaveTextContent('Fase 2/3');
    expect(fase.textContent).not.toContain('·');
  });

  it('los botones de la barra mueven, insertan, duplican y borran (con segundo toque)', () => {
    render(<TimelineTactica />);
    fireEvent.click(screen.getByRole('button', { name: 'Mover la fase 2 a la derecha' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase']);
    fireEvent.click(screen.getByRole('button', { name: '＋ Fase' }));
    expect(nombres()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: /^Duplicar la fase/ }));
    expect(nombres()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /^Borrar la fase/ }));
    expect(nombres()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar: borrar la fase/ }));
    expect(nombres()).toHaveLength(4);
  });

  it('un nombre a medias se guarda en su fase antes de moverla (en el iPad el botón no quita el foco)', () => {
    render(<TimelineTactica />);
    const campo = screen.getByRole('textbox', { name: 'Nombre de la fase' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'Pase al 7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mover la fase 2 a la derecha' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase al 7']);
  });

  it('un nombre a medias se guarda en su fase al tocar la pestaña de otra', () => {
    render(<TimelineTactica />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la fase' }), { target: { value: 'Pase al 7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Frame 3: Remate' }));
    expect(nombres()).toEqual(['Salida', 'Pase al 7', 'Remate']);
    expect(screen.getByRole('textbox', { name: 'Nombre de la fase' })).toHaveValue('Remate');
  });

  it('en la última fase la duración se queda en su sitio, desactivada', () => {
    estado().irAFrame(2);
    useReproduccionStore.setState({ indiceFrame: 2 });
    render(<TimelineTactica />);
    expect(screen.getByRole('spinbutton', { name: 'Duración de la fase en segundos' })).toBeDisabled();
  });
});

/**
 * En una tablet de 1024 solo cabe ＋ Fase: lo demás va a «Más ▾», con el texto
 * completo, y el nombre de la fase se lee junto a «FASE x/y».
 */
describe('barra estrecha: ＋ Fase a la vista y lo demás en «Más ▾»', () => {
  beforeEach(() => {
    sembrarJugada();
    estado().irAFrame(1);
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 1, tiempoMs: 0 });
    simularBarra(ESTRECHA);
  });

  it('en la barra solo queda ＋ Fase, y Grabar y Movimiento siguen a mano', () => {
    render(<TimelineTactica />);
    expect(screen.getByRole('button', { name: '＋ Fase' })).toBeEnabled();
    expect(screen.queryByRole('textbox', { name: 'Nombre de la fase' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mover la fase/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nombre de la jugada' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grabar' })).toHaveTextContent('Grabar');
    expect(screen.getByRole('button', { name: 'Movimiento' })).toHaveTextContent('Movimiento');
  });

  it('«Más ▾» dice qué fase edita y lleva todo lo demás con su texto completo', () => {
    render(<TimelineTactica />);
    const menu = abrirMas();
    expect(within(menu).getByText('Fase 2 de 3')).toBeInTheDocument();
    expect(within(menu).getByRole('textbox', { name: 'Nombre de la fase' })).toHaveValue('Pase');
    expect(within(menu).getByRole('spinbutton', { name: 'Duración de la fase en segundos' })).toBeEnabled();
    for (const texto of ['Mover a la izquierda', 'Mover a la derecha', '⇥ Añadir fase al final', '⧉ Duplicar fase', '🗑 Borrar fase']) {
      expect(within(menu).getByRole('button', { name: texto })).toBeEnabled();
    }
    expect(within(menu).queryByRole('textbox', { name: 'Nombre de la jugada' })).not.toBeInTheDocument();
    expect(within(menu).getByRole('combobox', { name: 'Curva' })).toBeInTheDocument();
    expect(menu.textContent).not.toMatch(/[◀▶]/);
  });

  it('el nombre de la fase se lee junto a «FASE x/y»', () => {
    render(<TimelineTactica />);
    expect(screen.getByTitle('Fase 2 de 3: Pase')).toHaveTextContent('Fase 2/3 · Pase');
  });

  it('mover desde el menú se lleva la fase activa con ella y deja el menú abierto', () => {
    render(<TimelineTactica />);
    const menu = abrirMas();
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover a la derecha' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase']);
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(2);
    expect(within(screen.getByRole('dialog')).getByText('Fase 3 de 3')).toBeInTheDocument();
  });

  it('borrar desde el menú pide un segundo toque y borra la fase que se ve', () => {
    render(<TimelineTactica />);
    const menu = abrirMas();
    fireEvent.click(within(menu).getByRole('button', { name: '🗑 Borrar fase' }));
    expect(nombres()).toHaveLength(3);
    fireEvent.click(within(menu).getByRole('button', { name: '🗑 ¿Borrar la fase 2? Toca otra vez' }));
    expect(nombres()).toEqual(['Salida', 'Remate']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lo escrito en el menú se guarda al cerrarlo tocando fuera, sin haber salido del campo', () => {
    render(<TimelineTactica />);
    const menu = abrirMas();
    fireEvent.change(within(menu).getByRole('textbox', { name: 'Nombre de la fase' }), { target: { value: 'Pase al 7' } });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nombres()).toEqual(['Salida', 'Pase al 7', 'Remate']);
  });

  it('un nombre a medias en el menú se guarda en su fase antes de moverla', () => {
    render(<TimelineTactica />);
    const menu = abrirMas();
    const campo = within(menu).getByRole('textbox', { name: 'Nombre de la fase' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'Pase al 7' } });
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover a la derecha' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase al 7']);
  });

  it('la curva de la jugada se cambia desde el menú', () => {
    render(<TimelineTactica />);
    fireEvent.change(within(abrirMas()).getByRole('combobox', { name: 'Curva' }), { target: { value: 'lineal' } });
    expect(estado().historial.presente.secuencia!.easing).toBe('lineal');
  });
});

/**
 * Con la barra de tiempo arrastrada (previsualizando) el campo enseña un instante
 * del reloj, no la fase que se edita. La línea de tiempo tiene que marcar la fase
 * que se VE y no dejar editar fases: antes marcaba la fase activa del documento, y
 * mover o borrar actuaba sobre una fase que no estaba en pantalla.
 */
describe('línea de tiempo con la barra arrastrada', () => {
  // Fase activa del documento: la 3 («Remate», como al terminar la reproducción); en pantalla, la 1.
  beforeEach(() => {
    sembrarJugada();
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: true, indiceFrame: 0, tiempoMs: 0 });
  });

  it('marca la pestaña y el nombre de la fase que se ve', () => {
    simularBarra(ESTRECHA);
    render(<TimelineTactica />);
    expect(screen.getByRole('button', { name: 'Frame 1: Salida' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTitle('Fase 1 de 3: Salida')).toHaveTextContent('Fase 1/3 · Salida');
    const menu = abrirMas();
    expect(within(menu).getByText('Fase 1 de 3')).toBeInTheDocument();
    expect(within(menu).getByRole('textbox', { name: 'Nombre de la fase' })).toHaveValue('Salida');
  });

  it('no deja mover, renombrar, insertar, duplicar ni borrar fases desde la barra', () => {
    simularBarra(ANCHA);
    render(<TimelineTactica />);
    expect(screen.getByRole('textbox', { name: 'Nombre de la fase' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Duración de la fase en segundos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '＋ Fase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover la fase 1 a la derecha' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicar la fase 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Borrar la fase 1' })).toBeDisabled();
    expect(nombres()).toEqual(['Salida', 'Pase', 'Remate']);
  });

  it('ni desde «Más ▾»', () => {
    simularBarra(ESTRECHA);
    render(<TimelineTactica />);
    const menu = abrirMas();
    expect(within(menu).getByRole('button', { name: 'Mover a la derecha' })).toBeDisabled();
    expect(within(menu).getByRole('textbox', { name: 'Nombre de la fase' })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: '⧉ Duplicar fase' })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: '🗑 Borrar fase' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '＋ Fase' })).toBeDisabled();
  });

  it('tocar una pestaña sale de la barra y deja esa fase lista para editar', () => {
    simularBarra(ANCHA);
    render(<TimelineTactica />);
    fireEvent.click(screen.getByRole('button', { name: 'Frame 2: Pase' }));
    expect(useReproduccionStore.getState().previsualizando).toBe(false);
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(1);
    expect(screen.getByRole('button', { name: 'Mover la fase 2 a la derecha' })).toBeEnabled();
  });
});

describe('una fase sin nombre', () => {
  it('deja solo «Fase x/y» junto al tiempo', () => {
    sembrarJugada();
    estado().irAFrame(1);
    estado().renombrarFrame(1, '');
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 1, tiempoMs: 0 });
    simularBarra(ESTRECHA);
    render(<TimelineTactica />);
    const fase = screen.getByTitle('Fase actual y tiempo transcurrido');
    expect(fase).toHaveTextContent('Fase 2/3');
    expect(fase.textContent).not.toContain('·');
  });
});

/**
 * Con más fases de las que caben, la fila de pestañas se desplaza sola para que la
 * pestaña de la fase que se ve quede a la vista. Se desplaza solo la fila: con
 * scrollIntoView se movía también la página y, a 1024 px, la interfaz entera se
 * corría a la izquierda.
 */
describe('pestañas que se desplazan con la fase', () => {
  /** jsdom no maqueta: una fila de 300 px con 13 pestañas de 90 px cada 100 px. */
  function simularFila(lista: HTMLElement): () => number {
    let desplazado = 0;
    Object.defineProperty(lista, 'scrollLeft', { configurable: true, get: () => desplazado, set: (v: number) => { desplazado = v; } });
    Object.defineProperty(lista, 'scrollWidth', { configurable: true, get: () => 1300 });
    Object.defineProperty(lista, 'clientWidth', { configurable: true, get: () => 300 });
    const caja = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 44, height: 44, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    lista.getBoundingClientRect = () => caja(0, 300);
    [...lista.querySelectorAll('button')].forEach((b, i) => {
      b.getBoundingClientRect = () => caja(i * 100 - desplazado, 90);
    });
    return () => desplazado;
  }

  const pestana = (n: number) => screen.getByRole('button', { name: new RegExp(`^Frame ${n}(:|$)`) });
  const aLaVista = (boton: HTMLElement) => {
    const r = boton.getBoundingClientRect();
    return r.left >= 0 && r.right <= 300;
  };

  beforeEach(() => {
    sembrarJugada();
    for (let i = 3; i < 13; i++) estado().agregarFrame();
    estado().irAFrame(0);
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 0, tiempoMs: 0 });
  });

  it('tocar la última pestaña la deja a la vista desplazando solo la fila', () => {
    render(<TimelineTactica />);
    const desplazado = simularFila(pestana(1).parentElement!);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    fireEvent.click(pestana(13));
    expect(desplazado()).toBe(1000);
    expect(aLaVista(pestana(13))).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('volver a la primera fase devuelve la fila al principio', () => {
    render(<TimelineTactica />);
    const desplazado = simularFila(pestana(1).parentElement!);
    fireEvent.click(pestana(13));
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar la jugada' }));
    expect(desplazado()).toBe(0);
    expect(aLaVista(pestana(1))).toBe(true);
  });

  it('reproduciendo, la fila sigue a la fase que se ve', () => {
    render(<TimelineTactica />);
    const desplazado = simularFila(pestana(1).parentElement!);
    act(() => useReproduccionStore.setState({ reproduciendo: true, indiceFrame: 7 }));
    expect(pestana(8)).toHaveAttribute('aria-current', 'true');
    expect(desplazado()).toBe(595);
    expect(aLaVista(pestana(8))).toBe(true);
  });
});
