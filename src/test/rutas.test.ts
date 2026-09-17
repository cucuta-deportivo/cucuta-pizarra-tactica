import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { obtenerFormacion } from '../data/formaciones';

/**
 * Trayectorias por nodos en el store. Lo que más se protege aquí es que
 * sobrevivan a las recapturas del frame activo: viven solo en el frame, no en
 * el documento, así que cualquier acción que reconstruya el frame podría
 * borrarlas sin que se note hasta reproducir.
 */
describe('trayectorias por nodos', () => {
  const estado = () => useAlineacionStore.getState();
  const doc = () => estado().historial.presente;
  const rutas = (indice = 0) => doc().secuencia!.frames[indice]!.trayectorias;

  let jugadorId: string;

  beforeEach(() => {
    sembrarPlantilla();
    useAlineacionStore.getState().nuevaAlineacion();
    const formacion = obtenerFormacion(doc().formacionId)!;
    jugadorId = usePlantillaStore.getState().jugadores[0]!.id;
    estado().asignarJugador(formacion.zonas[0]!.id, 20, 50, jugadorId);
    estado().iniciarSecuencia();
    estado().agregarFrame();
    estado().moverJugador(jugadorId, 80, 50);
    estado().irAFrame(0);
  });

  it('una jugada nueva no tiene trayectorias', () => {
    expect(rutas()).toBeUndefined();
  });

  it('agregar un nodo crea la trayectoria del jugador', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 50, y: 20 });
    expect(rutas()).toHaveLength(1);
    expect(rutas()![0]).toMatchObject({ jugadorId, interpolacion: 'catmull-rom', mostrarRuta: true });
    expect(rutas()![0]!.nodos).toHaveLength(1);
  });

  it('los nodos siguientes se añaden a la misma trayectoria, en orden', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 60, y: 80 });
    expect(rutas()).toHaveLength(1);
    expect(rutas()![0]!.nodos.map((n) => n.x)).toEqual([40, 60]);
  });

  it('se puede insertar un nodo en mitad del recorrido', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 60, y: 80 });
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 50, y: 50 }, 1);
    expect(rutas()![0]!.nodos.map((n) => n.x)).toEqual([40, 50, 60]);
  });

  it('mover un nodo lo recoloca y lo mantiene dentro del campo', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    const ruta = rutas()![0]!;
    estado().moverNodoTrayectoria(0, ruta.id, ruta.nodos[0]!.id, 55, 65);
    expect(rutas()![0]!.nodos[0]).toMatchObject({ x: 55, y: 65 });

    estado().moverNodoTrayectoria(0, ruta.id, ruta.nodos[0]!.id, 500, -80);
    expect(rutas()![0]!.nodos[0]).toMatchObject({ x: 100, y: 0 });
  });

  it('quitar el último nodo retira la trayectoria: sin nodos vuelve a ser una recta', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    const ruta = rutas()![0]!;
    estado().eliminarNodoTrayectoria(0, ruta.id, ruta.nodos[0]!.id);
    expect(rutas()).toHaveLength(0);
  });

  it('quitar un nodo de varios deja la trayectoria en pie', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 60, y: 80 });
    const ruta = rutas()![0]!;
    estado().eliminarNodoTrayectoria(0, ruta.id, ruta.nodos[0]!.id);
    expect(rutas()![0]!.nodos.map((n) => n.x)).toEqual([60]);
  });

  it('cada elemento tiene su propia trayectoria', () => {
    const otroId = usePlantillaStore.getState().jugadores[1]!.id;
    const formacion = obtenerFormacion(doc().formacionId)!;
    estado().asignarJugador(formacion.zonas[1]!.id, 30, 30, otroId);
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    estado().agregarNodoTrayectoria(0, 'titular', otroId, { x: 70, y: 70 });
    estado().agregarNodoTrayectoria(0, 'balon', doc().balones[0]!.id, { x: 50, y: 90 });
    expect(rutas()).toHaveLength(3);
  });

  /** El fallo que ya nos mordió con la duración: recapturar el frame borraba lo suyo. */
  it('las trayectorias sobreviven a añadir fases y a moverse por la jugada', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    estado().agregarFrame();
    estado().irAFrame(0);
    estado().irAFrame(1);
    estado().irAFrame(0);
    expect(rutas()![0]!.nodos).toHaveLength(1);
  });

  it('cada trayectoria pertenece a su fase y no se contagia a las demás', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    expect(rutas(0)).toHaveLength(1);
    expect(rutas(1)).toBeUndefined();
  });

  it('agregar un nodo es reversible con deshacer', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    estado().deshacer();
    expect(rutas() ?? []).toHaveLength(0);
  });

  it('se puede cambiar la curva de una trayectoria', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    const ruta = rutas()![0]!;
    estado().setInterpolacionTrayectoria(0, ruta.id, 'lineal');
    expect(rutas()![0]!.interpolacion).toBe('lineal');
  });

  it('eliminar la trayectoria entera la quita del frame', () => {
    estado().agregarNodoTrayectoria(0, 'titular', jugadorId, { x: 40, y: 20 });
    estado().eliminarTrayectoria(0, rutas()![0]!.id);
    expect(rutas()).toHaveLength(0);
  });
});
