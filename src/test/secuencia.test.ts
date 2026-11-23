import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { useUiStore } from '../store/uiStore';
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

  // --- F5.4a: cerrar guarda la jugada; borrar es aparte ---

  it('cerrar guarda la jugada y vuelve a la pizarra; abrirla vuelve a la fase en que se dejó', () => {
    const inicial = { ...posicionDe(jugadorId)! };
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().moverJugador(jugadorId, 80, 20);

    estado().cerrarJugada();
    expect(doc().secuencia).toBeNull();
    expect(doc().jugadaCerrada!.frames).toHaveLength(2);
    expect(doc().jugadaCerrada!.indiceActivo).toBe(1);
    // Lo movido en la fase 2 quedó en ella aunque no se cambió de fase antes de cerrar.
    expect(doc().jugadaCerrada!.frames[1]!.titulares[0]).toMatchObject({ x: 80, y: 20 });
    expect(posicionDe(jugadorId)).toMatchObject({ x: inicial.x, y: inicial.y });

    // Editar la pizarra no toca la jugada cerrada.
    const fases = doc().jugadaCerrada!.frames;
    estado().moverJugador(jugadorId, 10, 10);
    expect(doc().jugadaCerrada!.frames).toBe(fases);

    estado().abrirJugada();
    expect(doc().jugadaCerrada).toBeNull();
    expect(doc().secuencia!.indiceActivo).toBe(1);
    expect(posicionDe(jugadorId)).toMatchObject({ x: 80, y: 20 });

    // Y al volver a cerrarla, la pizarra es la que se editó entre medias.
    estado().cerrarJugada();
    expect(posicionDe(jugadorId)).toMatchObject({ x: 10, y: 10 });
  });

  it('cerrar y abrir se deshacen como cualquier otro paso', () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().cerrarJugada();
    estado().deshacer();
    expect(doc().secuencia!.frames).toHaveLength(2);
    expect(doc().jugadaCerrada).toBeNull();
  });

  it('una jugada de antes, sin la pizarra guardada, se cierra dejando el campo en la fase que se veía', () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().moverJugador(jugadorId, 80, 20);
    // Así guardaban la jugada las versiones anteriores: sin `pizarra`.
    useAlineacionStore.setState((s) => {
      const { pizarra: _pizarra, ...sinPizarra } = s.historial.presente.secuencia!;
      return { historial: { ...s.historial, presente: { ...s.historial.presente, secuencia: sinPizarra } } };
    });

    estado().cerrarJugada();
    expect(doc().jugadaCerrada!.frames).toHaveLength(2);
    expect(posicionDe(jugadorId)).toMatchObject({ x: 80, y: 20 });
  });

  it('con una jugada cerrada no se crea otra, y borrarla no mueve la pizarra y se puede deshacer', () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().cerrarJugada();
    estado().moverJugador(jugadorId, 10, 10);

    estado().iniciarSecuencia();
    expect(doc().secuencia).toBeNull();

    useUiStore.setState({ toasts: [] });
    estado().descartarSecuencia();
    expect(doc().jugadaCerrada).toBeNull();
    expect(posicionDe(jugadorId)).toMatchObject({ x: 10, y: 10 });

    useUiStore.getState().toasts.find((t) => t.accion?.etiqueta === 'Deshacer')!.accion!.ejecutar();
    expect(doc().jugadaCerrada!.frames).toHaveLength(2);
  });

  it('borrar la jugada abierta devuelve el campo a la pizarra de antes de la jugada', () => {
    const inicial = { ...posicionDe(jugadorId)! };
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().moverJugador(jugadorId, 80, 20);
    estado().descartarSecuencia();
    expect(doc().secuencia).toBeNull();
    expect(posicionDe(jugadorId)).toMatchObject({ x: inicial.x, y: inicial.y });
  });

  it('la jugada cerrada se guarda con la alineación y vuelve al abrirla', async () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().renombrarSecuencia('Salida ante presión');
    estado().cerrarJugada();
    const id = estado().id;
    await estado().guardarAhora();

    estado().nuevaAlineacion();
    await estado().cargarAlineacion(id);
    expect(doc().secuencia).toBeNull();
    expect(doc().jugadaCerrada).toMatchObject({ nombre: 'Salida ante presión' });
    expect(doc().jugadaCerrada!.frames).toHaveLength(2);
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

/**
 * Mirar una jugada no es editarla: abrirla, recorrer sus fases, reproducirla
 * (que vuelca la fase activa), dejarla terminar, volver al principio y cerrarla
 * no deja nada por guardar. Cada guardado es una versión nueva que en producción
 * se sube a Supabase, y dos dispositivos mirando la misma alineación acabarían
 * con copias por conflicto. Lo editado, en cambio, se sigue guardando.
 */
describe('secuencia táctica: mirar no guarda', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;
  let jugadorId: string;

  // Una jugada de tres fases, cerrada y guardada, abierta de nuevo desde lo guardado
  // como haría el entrenador (sin autoguardados pendientes de la preparación).
  beforeEach(async () => {
    sembrarPlantilla();
    estado().nuevaAlineacion();
    const zona = obtenerFormacion(doc().formacionId)!.zonas[0]!;
    jugadorId = usePlantillaStore.getState().jugadores[0]!.id;
    estado().asignarJugador(zona.id, zona.x, zona.y, jugadorId);
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().moverJugador(jugadorId, 60, 40);
    estado().agregarFrame();
    estado().moverJugador(jugadorId, 70, 70);
    estado().cerrarJugada();
    await estado().guardarAhora();
    await estado().cargarAlineacion(estado().id);
    expect(estado().estadoGuardado).toBe('guardado');
  });

  it('abrir, recorrer las fases, reproducir hasta el final, volver al principio y cerrar no deja nada por guardar', () => {
    estado().abrirJugada();
    estado().irAFrame(2); // ▶: vuelca la fase activa antes de reproducir
    estado().irAFrame(2); // fin de la reproducción: se descansa en la última fase
    estado().irAFrame(0); // ▶ desde el principio, ↻, ⏮ o la pestaña de la fase 1
    estado().irAFrame(1);
    expect(estado().estadoGuardado).toBe('guardado');
    expect(posicion()).toMatchObject({ x: 60, y: 40 });

    estado().cerrarJugada();
    expect(estado().estadoGuardado).toBe('guardado');
    expect(doc().jugadaCerrada!.frames[2]!.titulares[0]).toMatchObject({ x: 70, y: 70 });
  });

  it('tampoco guarda una jugada que llegó con las claves de sus fases en otro orden (de Supabase o de un JSON)', () => {
    // El jsonb de PostgreSQL no conserva el orden de las claves: así llegan las fases bajadas del servidor.
    useAlineacionStore.setState((s) => {
      const cerrada = s.historial.presente.jugadaCerrada!;
      const reordenada = cerrada.frames.map((fase) => Object.fromEntries(Object.entries(fase).reverse()) as typeof fase);
      return { historial: { ...s.historial, presente: { ...s.historial.presente, jugadaCerrada: { ...cerrada, frames: reordenada } } } };
    });
    estado().abrirJugada();
    estado().irAFrame(2);
    estado().irAFrame(0);
    estado().irAFrame(1);
    estado().cerrarJugada();
    expect(estado().estadoGuardado).toBe('guardado');
  });

  it('abrirla y cerrarla sin tocar nada tampoco guarda', () => {
    estado().abrirJugada();
    estado().cerrarJugada();
    expect(estado().estadoGuardado).toBe('guardado');
  });

  it('lo editado en una fase sí se guarda al dejarla', async () => {
    estado().abrirJugada();
    estado().moverJugador(jugadorId, 20, 20);
    // El cambio se guarda enseguida, pero la fase todavía no lo tiene: se vuelca al dejarla.
    await estado().guardarAhora();
    expect(estado().estadoGuardado).toBe('guardado');

    estado().irAFrame(0);
    expect(estado().estadoGuardado).toBe('pendiente');
    expect(doc().secuencia!.frames[2]!.titulares[0]).toMatchObject({ x: 20, y: 20 });
  });

  it('cerrar una jugada que ya se guardó abierta (porque se editó) sí se guarda', async () => {
    estado().abrirJugada();
    estado().moverJugador(jugadorId, 20, 20);
    estado().irAFrame(0);
    await estado().guardarAhora();
    expect(estado().estadoGuardado).toBe('guardado');

    estado().cerrarJugada();
    expect(estado().estadoGuardado).toBe('pendiente');
  });

  const posicion = () => doc().titulares.find((t) => t.jugadorId === jugadorId);
});
