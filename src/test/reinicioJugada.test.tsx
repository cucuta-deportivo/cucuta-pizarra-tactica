import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { sembrarPlantilla } from './fixturePlantilla';
import { ControlesReproduccion } from '../components/pizarra/ControlesReproduccion';
import { CapaReproduccion } from '../components/campo/CapaReproduccion';
import { CapaDibujo } from '../components/pizarra/CapaDibujo';
import { EscalaCampoProvider, type EscalaCampo } from '../hooks/useCampoEscala';
import { useFrameEnReproduccion } from '../hooks/useFrameEnReproduccion';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { useReproduccionStore } from '../store/reproduccionStore';
import { obtenerFormacion } from '../data/formaciones';
import { duracionTotal } from '../utils/interpolacion';
import type { Trazo } from '../types';

/**
 * Reinicio de la jugada: al terminar, volver al principio (▶ «desde el
 * principio», ↻, ⏮ o la barra) tiene que dejar en el campo SOLO los dibujos de
 * la fase 1, no los de la última. Se monta lo mismo que en el campo: los mandos,
 * la capa de reproducción (que hace avanzar la jugada y la termina) y la capa de
 * dibujos, con la fase que se ve calculada por el mismo hook que usa `Campo`.
 *
 * jsdom no pinta en canvas: el lienzo es falso y apunta qué dibujos quedan en él
 * (`clearRect` lo vacía y cada dibujo pintado se anota por su id).
 */
const { pintados } = vi.hoisted(() => ({ pintados: new Map<unknown, string[]>() }));
vi.mock('../utils/renderTrazos', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../utils/renderTrazos')>()),
  dibujarTrazo: (ctx: { canvas: unknown }, trazo: Trazo) => {
    pintados.set(ctx.canvas, [...(pintados.get(ctx.canvas) ?? []), trazo.id]);
  },
}));

function contextoFalso(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const base: Record<string | symbol, unknown> = { canvas, clearRect: () => pintados.set(canvas, []) };
  // Cualquier otra llamada (setTransform, beginPath…) no hace nada; las propiedades se guardan.
  return new Proxy(base, { get: (objeto, clave) => (clave in objeto ? objeto[clave] : () => undefined) }) as unknown as CanvasRenderingContext2D;
}

const ESCALA: EscalaCampo = {
  contenedorRef: { current: null },
  ancho: 1000,
  alto: 650,
  orientacion: 'horizontal',
  aPixeles: (p) => ({ x: p.x * 10, y: p.y * 6.5 }),
  aPorcentaje: (x, y) => ({ x: x / 10, y: y / 6.5 }),
};

function Campo() {
  const frame = useFrameEnReproduccion();
  const animando = useReproduccionStore((s) => s.reproduciendo || s.previsualizando);
  return (
    <EscalaCampoProvider value={ESCALA}>
      <ControlesReproduccion />
      {animando && <CapaReproduccion />}
      <CapaDibujo trazosMostrados={frame?.trazos} />
    </EscalaCampoProvider>
  );
}

const trazo = (id: string): Trazo => ({ id, tipo: 'flecha', puntos: [{ x: 10, y: 10 }, { x: 30, y: 30 }], color: '#D4111E', grosor: 2 });

describe('reinicio de la jugada: en la fase 1 solo se ven sus dibujos', () => {
  const estado = () => useAlineacionStore.getState();
  let lienzo: HTMLCanvasElement;
  const enElCampo = () => pintados.get(lienzo) ?? [];
  const avanzar = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  // Jugada de tres fases, cada una con su dibujo (fase-1, fase-2, fase-3), guardada,
  // abierta de nuevo en la fase 1 y reproducida hasta el final.
  beforeEach(async () => {
    sembrarPlantilla();
    estado().nuevaAlineacion();
    const zona = obtenerFormacion(estado().historial.presente.formacionId)!.zonas[0]!;
    const jugadorId = usePlantillaStore.getState().jugadores[0]!.id;
    estado().asignarJugador(zona.id, zona.x, zona.y, jugadorId);
    estado().iniciarSecuencia();
    estado().agregarTrazo(trazo('fase-1'));
    estado().agregarFrame();
    estado().limpiarTrazos();
    estado().agregarTrazo(trazo('fase-2'));
    estado().moverJugador(jugadorId, 50, 50);
    estado().agregarFrame();
    estado().limpiarTrazos();
    estado().agregarTrazo(trazo('fase-3'));
    estado().moverJugador(jugadorId, 80, 80);
    estado().irAFrame(0);
    estado().cerrarJugada();
    await estado().guardarAhora();
    await estado().cargarAlineacion(estado().id);
    estado().abrirJugada();
    useReproduccionStore.setState({ reproduciendo: false, previsualizando: false, indiceFrame: 0, tiempoMs: 0, velocidad: 1 });

    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (paso: FrameRequestCallback) => setTimeout(() => paso(Date.now()), 16) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return contextoFalso(this);
    } as unknown as typeof HTMLCanvasElement.prototype.getContext);
    pintados.clear();

    const { container } = render(<Campo />);
    lienzo = container.querySelector('canvas.pointer-events-none.h-full') as HTMLCanvasElement;
    expect(enElCampo()).toEqual(['fase-1']);

    // ▶ y se deja llegar al final: la jugada descansa en la última fase, con sus dibujos.
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }));
    const total = duracionTotal(estado().historial.presente.secuencia!.frames);
    for (let ms = 0; ms < total + 400; ms += 100) avanzar(100);
    expect(screen.getByRole('button', { name: 'Reproducir' })).toHaveAttribute('title', 'Reproducir desde el principio');
    expect(estado().historial.presente.secuencia!.indiceActivo).toBe(2);
    expect(enElCampo()).toEqual(['fase-3']);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('▶ «Reproducir desde el principio»: arranca en la fase 1 con sus dibujos, y sigue con los de cada fase', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }));
    avanzar(50);
    expect(enElCampo()).toEqual(['fase-1']);
    // A mitad de la segunda fase ya se ven los de la segunda, solos.
    avanzar(1500);
    expect(enElCampo()).toEqual(['fase-2']);
  });

  it('↻ Reiniciar la jugada', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar la jugada' }));
    expect(enElCampo()).toEqual(['fase-1']);
  });

  it('⏮ fase a fase hasta la primera', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Frame anterior' }));
    expect(enElCampo()).toEqual(['fase-2']);
    fireEvent.click(screen.getByRole('button', { name: 'Frame anterior' }));
    expect(enElCampo()).toEqual(['fase-1']);
  });

  it('arrastrar la barra de tiempo hasta el inicio', () => {
    fireEvent.change(screen.getByRole('slider', { name: 'Posición en la jugada' }), { target: { value: '0' } });
    avanzar(20);
    expect(enElCampo()).toEqual(['fase-1']);
  });

  it('nada de esto guarda: solo se ha mirado la jugada', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }));
    avanzar(50);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar la jugada' }));
    expect(estado().estadoGuardado).toBe('guardado');
  });
});
