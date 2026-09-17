import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { obtenerFormacion } from '../data/formaciones';
import { posicionEfectivaBalon } from '../utils/balon';
import { OFFSET_BALON_ANCLADO } from '../utils/constantes';

/**
 * El balón anclado no guarda su posición, la hereda del jugador que lo posee.
 * Todo lo que sale mal con el balón (saltos al centro, pases que no se animan)
 * viene de olvidar eso, así que se comprueba aquí.
 */
describe('balón: posesión y posición efectiva', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;
  const balon = () => doc().balones[0]!;

  let jugadorId: string;

  beforeEach(() => {
    sembrarPlantilla();
    useAlineacionStore.getState().nuevaAlineacion();
    const formacion = obtenerFormacion(doc().formacionId)!;
    const zona = formacion.zonas[0]!;
    jugadorId = usePlantillaStore.getState().jugadores[0]!.id;
    estado().asignarJugador(zona.id, zona.x, zona.y, jugadorId);
    estado().moverJugador(jugadorId, 30, 70);
  });

  it('un balón anclado se sitúa junto a su poseedor, no donde lo dejaron', () => {
    estado().anclarBalon(balon().id, jugadorId);
    expect(posicionEfectivaBalon(balon(), doc().titulares)).toMatchObject({
      x: 30 + OFFSET_BALON_ANCLADO.x,
      y: 70 + OFFSET_BALON_ANCLADO.y,
    });
  });

  it('el balón anclado acompaña al jugador cuando este se mueve', () => {
    estado().anclarBalon(balon().id, jugadorId);
    estado().moverJugador(jugadorId, 60, 25);
    expect(posicionEfectivaBalon(balon(), doc().titulares)).toMatchObject({
      x: 60 + OFFSET_BALON_ANCLADO.x,
      y: 25 + OFFSET_BALON_ANCLADO.y,
    });
  });

  it('al liberarlo se queda donde estaba, no salta al centro', () => {
    estado().anclarBalon(balon().id, jugadorId);
    estado().liberarBalon(balon().id);
    expect(balon().jugadorPoseedorId).toBeNull();
    expect(balon().x).toBeCloseTo(30 + OFFSET_BALON_ANCLADO.x);
    expect(balon().y).toBeCloseTo(70 + OFFSET_BALON_ANCLADO.y);
    // Y sigue viéndose en el mismo sitio ya sin dueño.
    expect(posicionEfectivaBalon(balon(), doc().titulares)).toMatchObject({ x: balon().x, y: balon().y });
  });

  it('liberar es reversible con deshacer', () => {
    estado().anclarBalon(balon().id, jugadorId);
    estado().liberarBalon(balon().id);
    estado().deshacer();
    expect(balon().jugadorPoseedorId).toBe(jugadorId);
  });

  it('en una jugada, el balón cambia de dueño entre frames y cada frame lo recuerda', () => {
    const otroId = usePlantillaStore.getState().jugadores[1]!.id;
    const formacion = obtenerFormacion(doc().formacionId)!;
    estado().asignarJugador(formacion.zonas[1]!.id, 80, 20, otroId);

    estado().anclarBalon(balon().id, jugadorId);
    estado().iniciarSecuencia();

    estado().agregarFrame();
    estado().anclarBalon(balon().id, otroId);
    // Ir al frame en el que ya se está vuelca lo editado, que es justo lo que
    // hace el botón de reproducir antes de arrancar la jugada.
    estado().irAFrame(doc().secuencia!.indiceActivo);

    const frames = doc().secuencia!.frames;
    expect(frames[0]!.balones[0]!.jugadorPoseedorId).toBe(jugadorId);
    expect(frames[1]!.balones[0]!.jugadorPoseedorId).toBe(otroId);

    // El pase se anima porque las posiciones resueltas de cada frame difieren.
    const desde = posicionEfectivaBalon(frames[0]!.balones[0]!, frames[0]!.titulares);
    const hasta = posicionEfectivaBalon(frames[1]!.balones[0]!, frames[1]!.titulares);
    expect(desde.x).not.toBeCloseTo(hasta.x);
  });
});
