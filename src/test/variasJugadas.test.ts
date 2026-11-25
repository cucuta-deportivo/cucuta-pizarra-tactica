import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { useUiStore } from '../store/uiStore';
import { obtenerFormacion } from '../data/formaciones';

/**
 * F5.4b, paso 2: varias jugadas por alineación. Nueva, abrir otra, renombrar,
 * describir, duplicar y borrar, cada una con su vista; y el once es uno solo: un
 * cambio de jugador se aplica en la pizarra y en todas las fases de todas las jugadas.
 */
const estado = () => useAlineacionStore.getState();
const doc = () => estado().historial.presente;
const nombres = () => doc().jugadas.map((j) => j.nombre);
const enTablero = (titulares: { jugadorId: string }[]) => titulares.map((t) => t.jugadorId);

let A: string; // en el campo
let C: string; // en el campo
let B: string; // en el banquillo
let posicionInicialA: { x: number; y: number };

beforeEach(() => {
  sembrarPlantilla();
  useUiStore.setState({ toasts: [] });
  estado().nuevaAlineacion('Varias jugadas');
  const [zona0, zona1] = obtenerFormacion(doc().formacionId)!.zonas;
  const jugadores = usePlantillaStore.getState().jugadores;
  [A, C, B] = [jugadores[0]!.id, jugadores[1]!.id, jugadores[2]!.id];
  estado().asignarJugador(zona0!.id, zona0!.x, zona0!.y, A);
  estado().asignarJugador(zona1!.id, zona1!.x, zona1!.y, C);
  estado().enviarABanquillo(B);
  posicionInicialA = { x: zona0!.x, y: zona0!.y };
});

/** Jugada 1 de dos fases (en la segunda A va a 80,20), cerrada. Devuelve su id. */
function jugadaUnoCerrada(): string {
  estado().iniciarSecuencia();
  estado().agregarFrame();
  estado().moverJugador(A, 80, 20);
  const id = doc().secuencia!.id!;
  estado().cerrarJugada();
  return id;
}

describe('crear y cambiar de jugada', () => {
  it('una jugada nueva parte de la pizarra, se llama «Jugada N», y la que estaba abierta queda guardada en su sitio', () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().moverJugador(A, 80, 20);

    estado().nuevaJugada();
    expect(nombres()).toEqual(['Jugada 1']);
    expect(doc().jugadas[0]!.frames[1]!.titulares.find((t) => t.jugadorId === A)).toMatchObject({ x: 80, y: 20 });
    expect(doc().secuencia).toMatchObject({ nombre: 'Jugada 2', posicion: 1, indiceActivo: 0 });
    // Desde la pizarra, no desde la fase que se veía.
    expect(doc().titulares.find((t) => t.jugadorId === A)).toMatchObject(posicionInicialA);
  });

  it('abrir otra jugada guarda la abierta con lo editado y abre la pedida en la fase en que se dejó', () => {
    const uno = jugadaUnoCerrada();
    estado().nuevaJugada();
    const dos = doc().secuencia!.id!;
    estado().moverJugador(A, 30, 30);

    estado().abrirJugada(uno);
    expect(doc().secuencia).toMatchObject({ id: uno, indiceActivo: 1, posicion: 0 });
    expect(doc().titulares.find((t) => t.jugadorId === A)).toMatchObject({ x: 80, y: 20 });
    expect(doc().jugadas.map((j) => j.id)).toEqual([dos]);
    expect(doc().jugadas[0]!.frames[0]!.titulares.find((t) => t.jugadorId === A)).toMatchObject({ x: 30, y: 30 });

    // Al cerrarla, cada una en su sitio.
    estado().cerrarJugada();
    expect(doc().jugadas.map((j) => j.id)).toEqual([uno, dos]);
    expect(doc().titulares.find((t) => t.jugadorId === A)).toMatchObject(posicionInicialA);
  });

  it('cambiar de jugada no deja dos abiertas ni pierde ninguna', () => {
    const uno = jugadaUnoCerrada();
    estado().nuevaJugada();
    estado().nuevaJugada();
    expect(nombres()).toEqual(['Jugada 1', 'Jugada 2']);
    estado().abrirJugada(uno);
    expect(doc().secuencia!.nombre).toBe('Jugada 1');
    expect(nombres()).toEqual(['Jugada 2', 'Jugada 3']);
  });
});

describe('renombrar, describir, duplicar y borrar', () => {
  it('renombrar y describir cualquier jugada, abierta o cerrada', () => {
    const uno = jugadaUnoCerrada();
    estado().nuevaJugada();
    const dos = doc().secuencia!.id!;

    estado().renombrarJugada(uno, '  Salida ante presión  ');
    estado().renombrarJugada(dos, 'Córner');
    estado().renombrarJugada(uno, '   ');
    expect(doc().jugadas[0]!.nombre).toBe('Salida ante presión');
    expect(doc().secuencia!.nombre).toBe('Córner');

    estado().describirJugada(uno, '  El 6 baja a recibir entre centrales. ');
    expect(doc().jugadas[0]!.descripcion).toBe('El 6 baja a recibir entre centrales.');
    estado().describirJugada(uno, '');
    expect(doc().jugadas[0]).not.toHaveProperty('descripcion');
  });

  it('duplicar pone la copia justo detrás de la original, con ids nuevos, y no la abre', () => {
    const uno = jugadaUnoCerrada();
    estado().nuevaJugada();
    estado().cerrarJugada();

    estado().duplicarJugada(uno);
    expect(nombres()).toEqual(['Jugada 1', 'Jugada 1 (copia)', 'Jugada 2']);
    const [original, copia] = doc().jugadas;
    expect(copia!.id).not.toBe(original!.id);
    expect(copia!.frames.map((f) => f.id)).not.toEqual(original!.frames.map((f) => f.id));
    expect(copia!.frames[1]!.titulares).toEqual(original!.frames[1]!.titulares);
    expect(doc().secuencia).toBeNull();
  });

  it('duplicar la abierta copia lo editado, y la copia queda justo detrás de ella', () => {
    jugadaUnoCerrada();
    estado().nuevaJugada();
    const dos = doc().secuencia!.id!;
    estado().moverJugador(A, 33, 44);

    estado().duplicarJugada(dos);
    expect(doc().secuencia!.id).toBe(dos);
    expect(nombres()).toEqual(['Jugada 1', 'Jugada 2 (copia)']);
    expect(doc().jugadas[1]!.frames[0]!.titulares.find((t) => t.jugadorId === A)).toMatchObject({ x: 33, y: 44 });
    estado().cerrarJugada();
    expect(nombres()).toEqual(['Jugada 1', 'Jugada 2', 'Jugada 2 (copia)']);
  });

  it('borrar una cerrada o la abierta, con Deshacer; borrar la abierta deja el campo en la pizarra', () => {
    const uno = jugadaUnoCerrada();
    estado().nuevaJugada();
    const dos = doc().secuencia!.id!;
    estado().moverJugador(A, 33, 44);

    estado().borrarJugada(uno);
    expect(doc().jugadas).toEqual([]);
    expect(doc().secuencia).toMatchObject({ id: dos, posicion: 0 });
    useUiStore.getState().toasts.find((t) => t.accion?.etiqueta === 'Deshacer')!.accion!.ejecutar();
    expect(nombres()).toEqual(['Jugada 1']);
    expect(doc().secuencia!.posicion).toBe(1);

    estado().borrarJugada(dos);
    expect(doc().secuencia).toBeNull();
    expect(nombres()).toEqual(['Jugada 1']);
    expect(doc().titulares.find((t) => t.jugadorId === A)).toMatchObject(posicionInicialA);
  });
});

describe('vista del campo por jugada', () => {
  it('cada jugada guarda su vista; al cerrarla, el campo vuelve a la de la pizarra; sin vista, la de la pizarra', () => {
    estado().actualizarCancha({ vista: 'completo' });
    estado().iniciarSecuencia();
    const corner = doc().secuencia!.id!;
    estado().actualizarCancha({ vista: 'tercio' });
    estado().cerrarJugada();
    expect(doc().cancha.vista).toBe('completo');
    expect(doc().jugadas[0]!.vista).toBe('tercio');

    estado().nuevaJugada();
    expect(doc().cancha.vista).toBe('completo');
    estado().cerrarJugada();
    expect(doc().jugadas[1]).not.toHaveProperty('vista');

    estado().abrirJugada(corner);
    expect(doc().cancha.vista).toBe('tercio');
    estado().abrirJugada(doc().jugadas[0]!.id!);
    expect(doc().cancha.vista).toBe('completo');
  });
});

describe('el once es uno solo: un cambio se aplica en todas las jugadas', () => {
  it('«entra B por A» cambia la pizarra y todas las fases de todas las jugadas, con su balón y sus recorridos, en un solo Deshacer', () => {
    // Jugada 1: A con un recorrido en la fase 1 y con el balón en la fase 2.
    estado().iniciarSecuencia();
    estado().agregarNodoTrayectoria(0, 'titular', A, { x: 40, y: 40 });
    estado().agregarFrame();
    estado().anclarBalon(doc().balones[0]!.id, A);
    estado().cerrarJugada();
    // Jugada 2, abierta.
    estado().nuevaJugada();
    estado().agregarFrame();

    estado().sustituirEnCampo(A, B);
    const todas = [doc().secuencia!.pizarra!.titulares, ...doc().secuencia!.frames.map((f) => f.titulares), ...doc().jugadas.flatMap((j) => j.frames.map((f) => f.titulares))];
    for (const titulares of [doc().titulares, ...todas]) {
      expect(enTablero(titulares)).toContain(B);
      expect(enTablero(titulares)).not.toContain(A);
    }
    expect(doc().jugadas[0]!.frames[0]!.trayectorias![0]!.jugadorId).toBe(B);
    expect(doc().jugadas[0]!.frames[1]!.balones[0]!.jugadorPoseedorId).toBe(B);
    expect(doc().banquillo).toContain(A);
    expect(doc().banquillo).not.toContain(B);

    estado().deshacer();
    expect(enTablero(doc().jugadas[0]!.frames[1]!.titulares)).toContain(A);
    expect(enTablero(doc().secuencia!.pizarra!.titulares)).toContain(A);
    expect(doc().jugadas[0]!.frames[1]!.balones[0]!.jugadorPoseedorId).toBe(A);
  });

  it('en una fase donde el que entra ya estaba en el campo, esa fase no se toca y se avisa', () => {
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().moverDesdeBanquilloACampo(B, 50, 50); // B sale en la fase 2 de la jugada
    estado().cerrarJugada();

    estado().sustituirEnCampo(A, B);
    const [fase1, fase2] = doc().jugadas[0]!.frames;
    expect(enTablero(fase1!.titulares)).toEqual(expect.arrayContaining([B, C]));
    expect(enTablero(fase1!.titulares)).not.toContain(A);
    expect(enTablero(fase2!.titulares)).toEqual(expect.arrayContaining([A, B, C]));
    expect(useUiStore.getState().toasts.some((t) => /ya estaba en el campo en 1 fase/.test(t.mensaje))).toBe(true);
  });

  it('un traspasado que sale en varias jugadas conserva su ficha y se pinta igual en todas', () => {
    // C sale en la pizarra y en dos jugadas; después se traspasa y deja la plantilla cargada.
    jugadaUnoCerrada();
    estado().nuevaJugada();
    estado().cerrarJugada();
    const fichaAntes = estado().fichas.find((f) => f.id === C);
    expect(fichaAntes).toBeDefined();

    usePlantillaStore.setState({ jugadores: usePlantillaStore.getState().jugadores.filter((j) => j.id !== C) });
    estado().moverJugador(A, 11, 11); // cualquier cambio vuelve a repasar las fichas
    expect(estado().fichas.filter((f) => f.id === C)).toEqual([fichaAntes]);
    for (const jugada of doc().jugadas) {
      for (const frame of jugada.frames) expect(enTablero(frame.titulares)).toContain(C);
    }
  });
});
