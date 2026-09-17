import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { alineacionRepository } from '../data/repositorio';
import { obtenerFormacion } from '../data/formaciones';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';

/**
 * Prueba de integración del flujo completo descrito en el pliego (§8.13):
 * elegir formación → asignar jugador → arrastrar → guardar → recargar.
 *
 * El entorno de pruebas (jsdom) no expone IndexedDB, así que el repositorio
 * resuelve automáticamente a MemoriaAlineacionRepository (ver data/repositorio/index.ts).
 * "Recargar" se simula leyendo de nuevo desde ese repositorio, que es exactamente
 * el mismo puerto que usa la UI para persistir y recuperar alineaciones.
 */
describe('flujo: formación → asignación → arrastre → guardado → recarga', () => {
  beforeEach(() => {
    sembrarPlantilla();
    const ahora = new Date().toISOString();
    useAlineacionStore.setState({
      id: generarId(),
      nombre: 'Prueba de integración',
      creadaEn: ahora,
      modificadaEn: ahora,
      historial: {
        pasado: [],
        presente: {
          formacionId: '4-4-2',
          titulares: [],
          banquillo: [],
          trazos: [],
          notas: '',
          objetos: [],
          balones: [],
          cuadricula: cuadriculaVacia(),
          rival: null,
          marcajes: [],
          cancha: canchaVacia(),
          jugadoresPersonalizados: [],
          secuencia: null,
        },
        etiquetaPresente: 'Alineación inicial',
        futuro: [],
      },
      estadoGuardado: 'guardado',
    });
  });

  it('persiste jugadores, movimientos libres y trazos, y los recupera igual tras recargar', async () => {
    const formacion433 = obtenerFormacion('4-3-3')!;
    const zonaDelantero = formacion433.zonas.find((z) => z.posicion === 'DC')!;
    const jugador = usePlantillaStore.getState().jugadores.find((j) => j.posicionNatural === 'DC')!;

    // 1. Elegir formación: no debe autocolocar jugadores.
    useAlineacionStore.getState().seleccionarFormacion('4-3-3', 'vaciar');
    expect(useAlineacionStore.getState().historial.presente.titulares).toHaveLength(0);

    // 2. Asignar jugador desde una zona.
    useAlineacionStore.getState().asignarJugador(zonaDelantero.id, zonaDelantero.x, zonaDelantero.y, jugador.id);
    expect(useAlineacionStore.getState().historial.presente.titulares).toHaveLength(1);

    // 3. Arrastrar libremente a cualquier punto del campo.
    useAlineacionStore.getState().moverJugador(jugador.id, 62, 58);
    const titular = useAlineacionStore.getState().historial.presente.titulares[0]!;
    expect(titular).toMatchObject({ jugadorId: jugador.id, x: 62, y: 58 });

    // 4. Dibujar un trazo (flecha) sobre el campo, en coordenadas normalizadas.
    const trazo = { id: generarId(), tipo: 'flecha' as const, puntos: [{ x: 12, y: 20 }, { x: 88, y: 91 }], color: '#D4111E', grosor: 2 as const };
    useAlineacionStore.getState().agregarTrazo(trazo);

    // 5. Guardar.
    await useAlineacionStore.getState().guardarAhora();
    expect(useAlineacionStore.getState().estadoGuardado).toBe('guardado');

    // 6. "Recargar": leer de nuevo desde el repositorio, como haría la app al reabrir.
    const idGuardado = useAlineacionStore.getState().id;
    const recargada = await alineacionRepository.obtener(idGuardado);

    expect(recargada).toBeDefined();
    expect(recargada!.formacionId).toBe('4-3-3');
    expect(recargada!.titulares).toEqual([{ jugadorId: jugador.id, x: 62, y: 58, zonaOrigenId: zonaDelantero.id, esCapitan: false }]);
    expect(recargada!.trazos).toEqual([trazo]);

    // Las coordenadas siguen normalizadas (0-100): son independientes del tamaño
    // de ventana con el que se recargue, tal como exige el criterio de aceptación de F6.
    for (const punto of recargada!.trazos[0]!.puntos) {
      expect(punto.x).toBeGreaterThanOrEqual(0);
      expect(punto.x).toBeLessThanOrEqual(100);
      expect(punto.y).toBeGreaterThanOrEqual(0);
      expect(punto.y).toBeLessThanOrEqual(100);
    }
  });

  it('deshacer revierte la última asignación y rehacer la restaura', () => {
    const formacion442 = obtenerFormacion('4-4-2')!;
    const zonaPortero = formacion442.zonas.find((z) => z.posicion === 'POR')!;
    const portero = usePlantillaStore.getState().jugadores.find((j) => j.posicionNatural === 'POR')!;

    useAlineacionStore.getState().asignarJugador(zonaPortero.id, zonaPortero.x, zonaPortero.y, portero.id);
    expect(useAlineacionStore.getState().historial.presente.titulares).toHaveLength(1);
    expect(useAlineacionStore.getState().puedeDeshacer()).toBe(true);

    useAlineacionStore.getState().deshacer();
    expect(useAlineacionStore.getState().historial.presente.titulares).toHaveLength(0);
    expect(useAlineacionStore.getState().puedeRehacer()).toBe(true);

    useAlineacionStore.getState().rehacer();
    expect(useAlineacionStore.getState().historial.presente.titulares).toHaveLength(1);
  });
});
