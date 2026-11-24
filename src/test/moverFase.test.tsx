import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { sembrarPlantilla } from './fixturePlantilla';
import { TimelineTactica } from '../components/pizarra/TimelineTactica';
import { useAlineacionStore } from '../store/alineacionStore';
import { useReproduccionStore } from '../store/reproduccionStore';

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

function abrirMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  return screen.getByRole('dialog', { name: 'Editar la fase y la jugada' });
}

/**
 * El menú «Editar ▾» reúne lo que antes ocupaba la barra de la jugada, para dejar
 * sitio a las pestañas en la tablet. En tablet no hay texto emergente: los textos
 * van completos.
 */
describe('menú «Editar ▾» de la jugada', () => {
  beforeEach(() => {
    sembrarJugada();
    estado().irAFrame(1);
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 1, tiempoMs: 0 });
  });

  it('dice qué fase edita y cada acción con su texto completo, sin ◀ ▶', () => {
    render(<TimelineTactica />);
    const menu = abrirMenu();
    expect(within(menu).getByText('Fase 2 de 3')).toBeInTheDocument();
    for (const texto of ['Mover a la izquierda', 'Mover a la derecha', '＋ Insertar fase después', '⇥ Añadir fase al final', '⧉ Duplicar fase', '🗑 Borrar fase']) {
      expect(within(menu).getByRole('button', { name: texto })).toBeEnabled();
    }
    expect(within(menu).getByRole('button', { name: 'Mover a la izquierda' })).toHaveAttribute(
      'title',
      'Mover esta fase a la izquierda. Cambia el orden de la jugada.',
    );
    expect(within(menu).getByRole('button', { name: 'Mover a la derecha' })).toHaveAttribute(
      'title',
      'Mover esta fase a la derecha. Cambia el orden de la jugada.',
    );
    expect(menu.textContent).not.toMatch(/[◀▶]/);
    expect(within(menu).getByRole('textbox', { name: 'Nombre de la fase' })).toHaveValue('Pase');
  });

  it('mover se lleva la fase activa con ella y deja el menú abierto', () => {
    render(<TimelineTactica />);
    const menu = abrirMenu();
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover a la derecha' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase']);
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(2);
    expect(within(screen.getByRole('dialog')).getByText('Fase 3 de 3')).toBeInTheDocument();
  });

  it('borrar pide un segundo toque y borra la fase que se ve', () => {
    render(<TimelineTactica />);
    const menu = abrirMenu();
    fireEvent.click(within(menu).getByRole('button', { name: '🗑 Borrar fase' }));
    expect(nombres()).toHaveLength(3);
    fireEvent.click(within(menu).getByRole('button', { name: '🗑 ¿Borrar la fase 2? Toca otra vez' }));
    expect(nombres()).toEqual(['Salida', 'Remate']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el nombre escrito se guarda al cerrar el menú tocando fuera, sin haber salido del campo', () => {
    render(<TimelineTactica />);
    const menu = abrirMenu();
    fireEvent.change(within(menu).getByRole('textbox', { name: 'Nombre de la fase' }), { target: { value: 'Pase al 7' } });
    fireEvent.change(within(menu).getByRole('textbox', { name: 'Nombre de la jugada' }), { target: { value: 'Salida por la derecha' } });
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nombres()).toEqual(['Salida', 'Pase al 7', 'Remate']);
    expect(estado().historial.presente.secuencia!.nombre).toBe('Salida por la derecha');
  });

  it('un nombre a medias se guarda en su fase antes de moverla o de borrar (en el iPad el botón no quita el foco)', () => {
    render(<TimelineTactica />);
    const menu = abrirMenu();
    const campo = within(menu).getByRole('textbox', { name: 'Nombre de la fase' });
    campo.focus();
    fireEvent.change(campo, { target: { value: 'Pase al 7' } });
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover a la derecha' }));
    expect(nombres()).toEqual(['Salida', 'Remate', 'Pase al 7']);
  });

  it('la curva de la jugada se cambia desde el menú', () => {
    render(<TimelineTactica />);
    const menu = abrirMenu();
    fireEvent.change(within(menu).getByRole('combobox', { name: 'Curva' }), { target: { value: 'lineal' } });
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
    render(<TimelineTactica />);
    expect(screen.getByRole('button', { name: 'Frame 1: Salida' })).toHaveAttribute('aria-current', 'true');
    const menu = abrirMenu();
    expect(within(menu).getByText('Fase 1 de 3')).toBeInTheDocument();
    expect(within(menu).getByRole('textbox', { name: 'Nombre de la fase' })).toHaveValue('Salida');
  });

  it('no deja mover, renombrar, insertar, duplicar ni borrar fases', () => {
    render(<TimelineTactica />);
    const menu = abrirMenu();
    expect(within(menu).getByRole('button', { name: 'Mover a la derecha' })).toBeDisabled();
    expect(within(menu).getByRole('textbox', { name: 'Nombre de la fase' })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: '＋ Insertar fase después' })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: '⧉ Duplicar fase' })).toBeDisabled();
    expect(within(menu).getByRole('button', { name: '🗑 Borrar fase' })).toBeDisabled();
    expect(nombres()).toEqual(['Salida', 'Pase', 'Remate']);
  });

  it('tocar una pestaña sale de la barra y deja esa fase lista para editar', () => {
    render(<TimelineTactica />);
    fireEvent.click(screen.getByRole('button', { name: 'Frame 2: Pase' }));
    expect(useReproduccionStore.getState().previsualizando).toBe(false);
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(1);
    const menu = abrirMenu();
    expect(within(menu).getByRole('button', { name: 'Mover a la derecha' })).toBeEnabled();
  });
});

/**
 * Las pestañas cortan el nombre de la fase («Falta latera…»): el nombre completo
 * de la fase que se ve va junto a «FASE x/y», donde la fila tiene sitio.
 */
describe('nombre de la fase junto a «FASE x/y»', () => {
  beforeEach(() => {
    sembrarJugada();
    estado().irAFrame(1);
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 1, tiempoMs: 0 });
  });

  it('muestra el nombre completo de la fase que se edita', () => {
    render(<TimelineTactica />);
    expect(screen.getByTitle('Fase 2 de 3: Pase')).toHaveTextContent('Fase 2/3 · Pase');
  });

  it('con la barra de tiempo arrastrada, el de la fase que se ve', () => {
    useReproduccionStore.setState({ previsualizando: true, tiempoMs: 0 });
    render(<TimelineTactica />);
    expect(screen.getByTitle('Fase 1 de 3: Salida')).toHaveTextContent('Fase 1/3 · Salida');
  });

  it('una fase sin nombre deja solo «Fase x/y»', () => {
    estado().renombrarFrame(1, '');
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
