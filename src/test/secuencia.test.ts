import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { obtenerFormacion } from '../data/formaciones';
import { DURACION_MAXIMA_MS, DURACION_MINIMA_MS } from '../utils/interpolacion';

/**
 * Reglas de la jugada animada: cada frame es una instantánea de lo que se mueve,
 * el frame activo se captura solo al cambiar de frame (nadie pulsa "guardar"), y
 * moverse por la secuencia nunca destruye lo ya definido en otros frames.
 */
describe('secuencia táctica: frames', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;
  const posicionDe = (jugadorId: string) => doc().titulares.find((t) => t.jugadorId === jugadorId);

  let jugadorId: string;

  beforeEach(() => {
    sembrarPlantilla();
    useAlineacionStore.getState().nuevaAlineacion();
    const formacion = obtenerFormacion(doc().formacionId)!;
    const zona = formacion.zonas[0]!;
    jugadorId = usePlantillaStore.getState().jugadores[0]!.id;
    estado().asignarJugador(zona.id, zona.x, zona.y, jugadorId);
  });

  it('arranca sin secuencia: la pizarra se comporta como siempre', () => {
    expect(doc().secuencia).toBeNull();
  });

  it('al iniciar una jugada, el estado actual queda como primer frame', () => {
    estado().iniciarSecuencia();
    const secuencia = doc().secuencia!;
    expect(secuencia.frames).toHaveLength(1);
    expect(secuencia.indiceActivo).toBe(0);
    expect(secuencia.frames[0]!.titulares).toHaveLength(1);
  });

  it('mover a un jugador y cambiar de frame no destruye el frame anterior', () => {
    estado().iniciarSecuencia();
    const inicial = { ...posicionDe(jugadorId)! };

    estado().agregarFrame();
    estado().moverJugador(jugadorId, 80, 20);
    expect(posicionDe(jugadorId)).toMatchObject({ x: 80, y: 20 });

    // Volver al primero devuelve la posición de partida…
    estado().irAFrame(0);
    expect(posicionDe(jugadorId)).toMatchObject({ x: inicial.x, y: inicial.y });

    // …y el segundo conserva lo suyo, sin haber pulsado ningún "guardar".
    estado().irAFrame(1);
    expect(posicionDe(jugadorId)).toMatchObject({ x: 80, y: 20 });
  });

  it('duplicar copia el frame y eliminar respeta el mínimo de uno', () => {
    estado().iniciarSecuencia();
    estado().duplicarFrame(0);
    expect(doc().secuencia!.frames).toHaveLength(2);

    estado().eliminarFrame(1);
    expect(doc().secuencia!.frames).toHaveLength(1);

    estado().eliminarFrame(0);
    expect(doc().secuencia!.frames).toHaveLength(1);
  });

  it('los frames entran en el historial: deshacer revierte el frame añadido', () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    expect(doc().secuencia!.frames).toHaveLength(2);

    estado().deshacer();
    expect(doc().secuencia!.frames).toHaveLength(1);
  });

  it('descartar la jugada devuelve la pizarra a su estado normal', () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().descartarSecuencia();
    expect(doc().secuencia).toBeNull();
    // El tablero conserva a los jugadores: descartar la animación no vacía el campo.
    expect(doc().titulares).toHaveLength(1);
  });
});

/**
 * La jugada se reproduce leyendo los frames guardados, no lo que hay en
 * pantalla. Estas pruebas cubren el volcado del frame activo, que es lo que
 * mantiene sincronizadas ambas cosas.
 */
describe('secuencia táctica: volcado del frame activo', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;

  let jugadorId: string;

  beforeEach(() => {
    sembrarPlantilla();
    useAlineacionStore.getState().nuevaAlineacion();
    const formacion = obtenerFormacion(doc().formacionId)!;
    const zona = formacion.zonas[0]!;
    jugadorId = usePlantillaStore.getState().jugadores[0]!.id;
    estado().asignarJugador(zona.id, zona.x, zona.y, jugadorId);
  });

  it('ir al frame en el que ya se está guarda lo editado sin moverse de sitio', () => {
    estado().iniciarSecuencia();
    estado().moverJugador(jugadorId, 75, 15);
    estado().irAFrame(0);

    expect(doc().secuencia!.indiceActivo).toBe(0);
    expect(doc().secuencia!.frames[0]!.titulares[0]).toMatchObject({ x: 75, y: 15 });
  });

  it('volcar un frame sin cambios no ensucia el historial', () => {
    estado().iniciarSecuencia();
    const pasosAntes = estado().historial.pasado.length;
    estado().irAFrame(0);
    estado().irAFrame(0);
    expect(estado().historial.pasado.length).toBe(pasosAntes);
  });
});

/**
 * Duración por fase y curva de movimiento. Lo que aquí se protege es que sean
 * opcionales: una jugada guardada antes de que existieran debe seguir
 * cargándose y reproduciéndose con los valores de por defecto.
 */
describe('secuencia táctica: duración y easing', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;

  beforeEach(() => {
    sembrarPlantilla();
    useAlineacionStore.getState().nuevaAlineacion();
    const formacion = obtenerFormacion(doc().formacionId)!;
    const zona = formacion.zonas[0]!;
    estado().asignarJugador(zona.id, zona.x, zona.y, usePlantillaStore.getState().jugadores[0]!.id);
    estado().iniciarSecuencia();
  });

  it('una jugada nace sin duración ni easing explícitos', () => {
    expect(doc().secuencia!.frames[0]!.duracionMs).toBeUndefined();
    expect(doc().secuencia!.easing).toBeUndefined();
  });

  it('cada fase guarda su propia duración', () => {
    estado().agregarFrame();
    estado().setDuracionFrame(0, 2500);
    estado().setDuracionFrame(1, 800);
    expect(doc().secuencia!.frames[0]!.duracionMs).toBe(2500);
    expect(doc().secuencia!.frames[1]!.duracionMs).toBe(800);
  });

  it('la duración se recorta a un rango razonable', () => {
    estado().setDuracionFrame(0, 50);
    expect(doc().secuencia!.frames[0]!.duracionMs).toBe(DURACION_MINIMA_MS);
    estado().setDuracionFrame(0, 999999);
    expect(doc().secuencia!.frames[0]!.duracionMs).toBe(DURACION_MAXIMA_MS);
  });

  it('la duración sobrevive a añadir frames y a moverse por la jugada', () => {
    estado().setDuracionFrame(0, 2000);
    estado().agregarFrame();
    estado().irAFrame(0);
    expect(doc().secuencia!.frames[0]!.duracionMs).toBe(2000);
  });

  it('el easing es de la jugada entera y es reversible', () => {
    estado().setEasingSecuencia('lineal');
    expect(doc().secuencia!.easing).toBe('lineal');
    estado().deshacer();
    expect(doc().secuencia!.easing).toBeUndefined();
  });
});

/** Reordenar fases, nombrar la jugada y añadir al final (fase C del modo animación). */
describe('secuencia táctica: reordenar y nombrar', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;
  const frames = () => doc().secuencia!.frames;
  const nombres = () => frames().map((f) => f.nombre);

  beforeEach(() => {
    sembrarPlantilla();
    useAlineacionStore.getState().nuevaAlineacion();
    const formacion = obtenerFormacion(doc().formacionId)!;
    const zona = formacion.zonas[0]!;
    estado().asignarJugador(zona.id, zona.x, zona.y, usePlantillaStore.getState().jugadores[0]!.id);
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().renombrarFrame(1, 'B');
    estado().agregarFrame();
    estado().renombrarFrame(2, 'C');
    estado().irAFrame(0);
    estado().renombrarFrame(0, 'A');
  });

  it('mover una fase la cambia de sitio y la sigue teniendo activa', () => {
    estado().moverFrame(0, 2);
    expect(nombres()).toEqual(['B', 'C', 'A']);
    expect(doc().secuencia!.indiceActivo).toBe(2);
  });

  it('mover hacia atrás funciona igual', () => {
    estado().moverFrame(2, 0);
    expect(nombres()).toEqual(['C', 'A', 'B']);
  });

  it('mover a un sitio imposible no toca nada', () => {
    estado().moverFrame(0, 9);
    estado().moverFrame(-1, 1);
    estado().moverFrame(1, 1);
    expect(nombres()).toEqual(['A', 'B', 'C']);
  });

  it('mover es reversible con deshacer', () => {
    estado().moverFrame(0, 2);
    estado().deshacer();
    expect(nombres()).toEqual(['A', 'B', 'C']);
  });

  it('añadir al final va al final, no detrás de la activa', () => {
    estado().irAFrame(0);
    estado().agregarFrameAlFinal();
    expect(frames()).toHaveLength(4);
    expect(doc().secuencia!.indiceActivo).toBe(3);
    expect(nombres().slice(0, 3)).toEqual(['A', 'B', 'C']);
  });

  it('＋ Fase sigue insertando justo detrás de la activa', () => {
    estado().irAFrame(0);
    estado().agregarFrame();
    expect(nombres()).toEqual(['A', undefined, 'B', 'C']);
  });

  it('la jugada se puede nombrar y el nombre se limpia si queda vacío', () => {
    estado().renombrarSecuencia('  Salida ante presión  ');
    expect(doc().secuencia!.nombre).toBe('Salida ante presión');
    estado().renombrarSecuencia('   ');
    expect(doc().secuencia!.nombre).toBeUndefined();
  });
});
