import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { obtenerFormacion } from '../data/formaciones';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia, ubicarZonaEnLado } from '../utils/anexoA';
import type { JugadorEnCampo } from '../types';

/**
 * Activar, ocultar o cambiar el modo del rival nunca mueve a nuestros
 * jugadores: ni a los que tienen zona ni a los arrastrados a mano, aunque
 * estén en la mitad del rival.
 */
const estado = () => useAlineacionStore.getState().historial.presente;

describe('rival sin mover a nuestros jugadores', () => {
  let titularesIniciales: JugadorEnCampo[];

  beforeEach(() => {
    sembrarPlantilla();
    titularesIniciales = [
      { jugadorId: 'test-01', x: 50, y: 6, zonaOrigenId: 'POR-0', esCapitan: false },
      // En su zona MCD pero arrastrado a mano hasta campo rival.
      { jugadorId: 'test-06', x: 44.2, y: 71.5, zonaOrigenId: 'MCD-5', esCapitan: false },
      // Sin zona (entró desde el panel), metido en la mitad rival.
      { jugadorId: 'test-09', x: 58.3, y: 88.9, esCapitan: false },
    ];
    const ahora = new Date().toISOString();
    useAlineacionStore.setState({
      id: generarId(),
      nombre: 'Prueba de rival',
      creadaEn: ahora,
      modificadaEn: ahora,
      historial: {
        pasado: [],
        presente: {
          formacionId: '4-3-3',
          titulares: titularesIniciales,
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

  it('activar el rival (modo Ambos) no mueve a nadie', () => {
    useAlineacionStore.getState().activarRival('4-4-2');
    expect(estado().rival?.modoVista).toBe('ambos');
    expect(estado().titulares).toEqual(titularesIniciales);
  });

  it('ocultar, cambiar de modo y desactivar el rival tampoco mueve a nadie', () => {
    const { activarRival, actualizarRival, desactivarRival } = useAlineacionStore.getState();
    activarRival('4-4-2');
    actualizarRival({ visible: false });
    expect(estado().titulares).toEqual(titularesIniciales);
    actualizarRival({ visible: true, modoVista: 'solo_nosotros' });
    expect(estado().titulares).toEqual(titularesIniciales);
    actualizarRival({ modoVista: 'solo_rival' });
    expect(estado().titulares).toEqual(titularesIniciales);
    actualizarRival({ modoVista: 'ambos' });
    expect(estado().titulares).toEqual(titularesIniciales);
    desactivarRival();
    expect(estado().titulares).toEqual(titularesIniciales);
  });

  it('los jugadores rivales siguen recogiéndose en su mitad según el modo', () => {
    const { activarRival, asignarJugadorRivalAZona, actualizarRival } = useAlineacionStore.getState();
    activarRival('4-4-2');
    const zona = obtenerFormacion('4-4-2')!.zonas.find((z) => z.id === 'DC-9')!;
    const enAmbos = ubicarZonaEnLado(zona, { espejo: true, mediaCancha: true });
    asignarJugadorRivalAZona(zona.id, enAmbos.x, enAmbos.y, 'DC', 9);

    actualizarRival({ modoVista: 'solo_rival' });
    const solo = ubicarZonaEnLado(zona, { espejo: true, mediaCancha: false });
    expect(estado().rival!.jugadores[0]).toMatchObject({ x: solo.x, y: solo.y });

    actualizarRival({ modoVista: 'ambos' });
    expect(estado().rival!.jugadores[0]).toMatchObject({ x: enAmbos.x, y: enAmbos.y });
  });
});
