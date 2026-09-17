import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { useReproduccionStore } from '../store/reproduccionStore';
import { obtenerFormacion } from '../data/formaciones';

/**
 * Modo grabación: cada tanda de movimientos cierra un frame sola. Lo que aquí se
 * protege es que grabar NO vuelque el estado actual sobre el frame activo — si
 * lo hiciera, el paso de partida quedaría ya movido y la jugada no se animaría.
 */
describe('grabación de jugadas', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;
  const frames = () => doc().secuencia!.frames;

  let jugadorId: string;
  let otroId: string;

  beforeEach(() => {
    sembrarPlantilla();
    useAlineacionStore.getState().nuevaAlineacion();
    useReproduccionStore.getState().detenerGrabacion();
    const formacion = obtenerFormacion(doc().formacionId)!;
    jugadorId = usePlantillaStore.getState().jugadores[0]!.id;
    otroId = usePlantillaStore.getState().jugadores[1]!.id;
    estado().asignarJugador(formacion.zonas[0]!.id, 20, 50, jugadorId);
    estado().asignarJugador(formacion.zonas[1]!.id, 30, 30, otroId);
  });

  it('grabar un movimiento deja el frame de partida intacto', () => {
    estado().iniciarSecuencia();
    estado().moverJugador(jugadorId, 80, 20);
    estado().grabarFrame();

    expect(frames()).toHaveLength(2);
    // El frame 1 conserva el "antes"; el 2 guarda el "después".
    expect(frames()[0]!.titulares.find((t) => t.jugadorId === jugadorId)).toMatchObject({ x: 20, y: 50 });
    expect(frames()[1]!.titulares.find((t) => t.jugadorId === jugadorId)).toMatchObject({ x: 80, y: 20 });
    expect(doc().secuencia!.indiceActivo).toBe(1);
  });

  it('varios movimientos antes de cerrar entran en el mismo frame', () => {
    estado().iniciarSecuencia();
    estado().moverJugador(jugadorId, 80, 20);
    estado().moverJugador(otroId, 70, 60);
    estado().grabarFrame();

    expect(frames()).toHaveLength(2);
    expect(frames()[1]!.titulares.find((t) => t.jugadorId === jugadorId)).toMatchObject({ x: 80, y: 20 });
    expect(frames()[1]!.titulares.find((t) => t.jugadorId === otroId)).toMatchObject({ x: 70, y: 60 });
  });

  it('grabar sin haber movido nada no crea un frame vacío', () => {
    estado().iniciarSecuencia();
    estado().grabarFrame();
    estado().grabarFrame();
    expect(frames()).toHaveLength(1);
  });

  it('grabar en cadena encadena los pasos sin pisarse', () => {
    estado().iniciarSecuencia();
    estado().moverJugador(jugadorId, 50, 50);
    estado().grabarFrame();
    estado().moverJugador(jugadorId, 90, 10);
    estado().grabarFrame();

    expect(frames()).toHaveLength(3);
    expect(frames().map((f) => f.titulares.find((t) => t.jugadorId === jugadorId)!.x)).toEqual([20, 50, 90]);
  });

  it('cada grabación es un paso de historial reversible', () => {
    estado().iniciarSecuencia();
    estado().moverJugador(jugadorId, 80, 20);
    estado().grabarFrame();
    expect(frames()).toHaveLength(2);

    estado().deshacer();
    expect(doc().secuencia!.frames).toHaveLength(1);
  });

  it('grabar y reproducir se excluyen', () => {
    const repro = () => useReproduccionStore.getState();
    repro().iniciarGrabacion();
    expect(repro().grabando).toBe(true);
    expect(repro().reproduciendo).toBe(false);

    repro().reproducir();
    expect(repro().grabando).toBe(false);
    expect(repro().reproduciendo).toBe(true);
  });
});
