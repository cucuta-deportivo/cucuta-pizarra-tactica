import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { useUiStore } from '../store/uiStore';
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
const ACOMODAR = 'Acomodar mi equipo en mi mitad';
const EXTENDER = 'Extender mi equipo por todo el campo';
const aviso = (etiqueta: string) => useUiStore.getState().toasts.find((t) => t.accion?.etiqueta === etiqueta);

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
    useUiStore.setState({ toasts: [] });
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

  // --- Paso 7b: recolocar a los nuestros solo cuando el entrenador lo pide ---

  it('al activar el rival con jugadores en campo rival se ofrece acomodar; al tocarlo, y/2 sin tocar x', () => {
    useAlineacionStore.getState().activarRival('4-4-2');
    expect(estado().titulares).toEqual(titularesIniciales);

    aviso(ACOMODAR)!.accion!.ejecutar();
    expect(estado().titulares).toEqual(titularesIniciales.map((t) => ({ ...t, y: t.y / 2 })));
    expect(aviso('Deshacer')).toBeDefined();
  });

  it('el Deshacer del aviso devuelve las posiciones exactas', () => {
    useAlineacionStore.getState().activarRival('4-4-2');
    aviso(ACOMODAR)!.accion!.ejecutar();
    aviso('Deshacer')!.accion!.ejecutar();
    expect(estado().titulares).toEqual(titularesIniciales);
  });

  it('acomodar no mueve a los rivales', () => {
    const { activarRival, asignarJugadorRivalAZona, acomodarEnMiMitad } = useAlineacionStore.getState();
    activarRival('4-4-2');
    asignarJugadorRivalAZona('DC-9', 30, 60, 'DC', 9);
    const rivales = estado().rival!.jugadores;
    acomodarEnMiMitad();
    expect(estado().rival!.jugadores).toEqual(rivales);
  });

  it('con todo el equipo en su mitad no se ofrece acomodar, y acomodar no hace nada', () => {
    const enMiMitad = titularesIniciales.map((t) => ({ ...t, y: Math.min(t.y, 40) }));
    useAlineacionStore.setState((s) => ({ historial: { ...s.historial, presente: { ...s.historial.presente, titulares: enMiMitad } } }));
    useAlineacionStore.getState().activarRival('4-4-2');
    expect(aviso(ACOMODAR)).toBeUndefined();

    const pasos = useAlineacionStore.getState().historial.pasado.length;
    useAlineacionStore.getState().acomodarEnMiMitad();
    expect(useAlineacionStore.getState().historial.pasado).toHaveLength(pasos);
  });

  it('al ocultar el rival con el equipo en su mitad se ofrece extender (y×2), que deshace el acomodo exacto', () => {
    const { activarRival, acomodarEnMiMitad, actualizarRival } = useAlineacionStore.getState();
    activarRival('4-4-2');
    acomodarEnMiMitad();
    useUiStore.setState({ toasts: [] });

    actualizarRival({ visible: false });
    expect(estado().titulares).toEqual(titularesIniciales.map((t) => ({ ...t, y: t.y / 2 })));
    aviso(EXTENDER)!.accion!.ejecutar();
    expect(estado().titulares).toEqual(titularesIniciales);
    expect(aviso('Deshacer')).toBeDefined();
  });

  it('extender se ofrece al desactivar el rival o pasar a Solo nosotros, pero no al pasar a Solo rival', () => {
    const preparar = () => {
      const { activarRival, acomodarEnMiMitad } = useAlineacionStore.getState();
      useAlineacionStore.setState((s) => ({
        historial: { ...s.historial, presente: { ...s.historial.presente, rival: null, titulares: titularesIniciales } },
      }));
      activarRival('4-4-2');
      acomodarEnMiMitad();
      useUiStore.setState({ toasts: [] });
    };

    preparar();
    useAlineacionStore.getState().desactivarRival();
    expect(aviso(EXTENDER)).toBeDefined();

    preparar();
    useAlineacionStore.getState().actualizarRival({ modoVista: 'solo_nosotros' });
    expect(aviso(EXTENDER)).toBeDefined();

    preparar();
    useAlineacionStore.getState().actualizarRival({ modoVista: 'solo_rival' });
    expect(aviso(EXTENDER)).toBeUndefined();
  });

  it('extender no hace nada si alguien está en campo rival, y renombrar al rival no ofrece nada', () => {
    const { activarRival, actualizarRival, extenderPorTodoElCampo } = useAlineacionStore.getState();
    activarRival('4-4-2');
    useUiStore.setState({ toasts: [] });
    actualizarRival({ nombre: 'Rival de prueba', paleta: 'azul' });
    expect(useUiStore.getState().toasts).toHaveLength(0);

    extenderPorTodoElCampo();
    expect(estado().titulares).toEqual(titularesIniciales);
  });
});
