import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { useUiStore } from '../store/uiStore';
import { obtenerFormacion } from '../data/formaciones';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia, ubicarZonaEnLado } from '../utils/anexoA';
import type { JugadorEnCampo } from '../types';

/**
 * F5.3 (cambia el paso 7b): con los dos equipos a la vista, el nuestro se
 * acomoda solo en su mitad (y/2, a todos, x igual) si alguien está en campo
 * rival; al dejar de verse, se extiende (y×2) solo si fue la app quien lo
 * acomodó. Siempre con aviso y Deshacer, en un paso aparte del rival.
 */
const estado = () => useAlineacionStore.getState().historial.presente;
const ACOMODAR = 'Acomodar mi equipo en mi mitad';
const EXTENDER = 'Extender mi equipo por todo el campo';
const aviso = (etiqueta: string) => useUiStore.getState().toasts.find((t) => t.accion?.etiqueta === etiqueta);

describe('rival y nuestro equipo (F5.3)', () => {
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
          jugadaCerrada: null,
        },
        etiquetaPresente: 'Alineación inicial',
        futuro: [],
      },
      estadoGuardado: 'guardado',
    });
    useUiStore.setState({ toasts: [] });
  });

  const acomodados = () => titularesIniciales.map((t) => ({ ...t, y: t.y / 2 }));

  it('activar el rival con alguien en campo rival acomoda solo a todos (y/2, x igual) y avisa con Deshacer', () => {
    useAlineacionStore.getState().activarRival('4-4-2');
    expect(estado().rival?.modoVista).toBe('ambos');
    expect(estado().titulares).toEqual(acomodados());
    expect(estado().rival?.nuestroEquipoAcomodado).toBe(true);
    expect(aviso('Deshacer')).toBeDefined();
    expect(aviso(ACOMODAR)).toBeUndefined();
  });

  it('el Deshacer del aviso devuelve las posiciones exactas y el rival sigue activo', () => {
    useAlineacionStore.getState().activarRival('4-4-2');
    aviso('Deshacer')!.accion!.ejecutar();
    expect(estado().titulares).toEqual(titularesIniciales);
    expect(estado().rival).toMatchObject({ formacionId: '4-4-2', visible: true, modoVista: 'ambos' });
  });

  it('ocultar el rival extiende al equipo (y×2) exacto, con aviso; mostrarlo lo vuelve a acomodar', () => {
    const { activarRival, actualizarRival } = useAlineacionStore.getState();
    activarRival('4-4-2');
    useUiStore.setState({ toasts: [] });

    actualizarRival({ visible: false });
    expect(estado().titulares).toEqual(titularesIniciales);
    expect(estado().rival?.nuestroEquipoAcomodado).toBeUndefined();
    expect(aviso('Deshacer')).toBeDefined();

    actualizarRival({ visible: true });
    expect(estado().titulares).toEqual(acomodados());
  });

  it('los jugadores rivales siguen recogiéndose en su mitad según el modo', () => {
    const { activarRival, actualizarRival } = useAlineacionStore.getState();
    activarRival('4-4-2');
    const zona = obtenerFormacion('4-4-2')!.zonas.find((z) => z.id === 'DC-9')!;
    const enAmbos = ubicarZonaEnLado(zona, { espejo: true, mediaCancha: true });
    // Desde F5.2 el rival sale entero: se sigue al que ocupa la zona DC-9.
    const delantero = () => estado().rival!.jugadores.find((j) => j.zonaOrigenId === 'DC-9');
    expect(delantero()).toMatchObject({ x: enAmbos.x, y: enAmbos.y });

    actualizarRival({ modoVista: 'solo_rival' });
    const solo = ubicarZonaEnLado(zona, { espejo: true, mediaCancha: false });
    expect(delantero()).toMatchObject({ x: solo.x, y: solo.y });

    actualizarRival({ modoVista: 'ambos' });
    expect(delantero()).toMatchObject({ x: enAmbos.x, y: enAmbos.y });
  });

  it('acomodar no mueve a los rivales', () => {
    const { activarRival, asignarJugadorRivalAZona, acomodarEnMiMitad, deshacer } = useAlineacionStore.getState();
    activarRival('4-4-2');
    deshacer(); // los nuestros vuelven a campo rival; el rival sigue activo
    asignarJugadorRivalAZona('DC-9', 30, 60, 'DC', 9);
    const rivales = estado().rival!.jugadores;
    acomodarEnMiMitad();
    expect(estado().titulares).toEqual(acomodados());
    expect(estado().rival!.jugadores).toEqual(rivales);
  });

  it('se extiende al desactivar el rival o pasar a Solo nosotros; en Solo rival se queda acomodado', () => {
    const preparar = () => {
      useAlineacionStore.setState((s) => ({
        historial: { ...s.historial, presente: { ...s.historial.presente, rival: null, titulares: titularesIniciales } },
      }));
      useAlineacionStore.getState().activarRival('4-4-2');
    };

    preparar();
    useAlineacionStore.getState().desactivarRival();
    expect(estado().titulares).toEqual(titularesIniciales);

    preparar();
    useAlineacionStore.getState().actualizarRival({ modoVista: 'solo_nosotros' });
    expect(estado().titulares).toEqual(titularesIniciales);

    preparar();
    useAlineacionStore.getState().actualizarRival({ modoVista: 'solo_rival' });
    expect(estado().titulares).toEqual(acomodados());
    // De vuelta a Ambos no se acomoda otra vez (ya lo está), y en Solo nosotros se extiende.
    useAlineacionStore.getState().actualizarRival({ modoVista: 'ambos' });
    expect(estado().titulares).toEqual(acomodados());
    useAlineacionStore.getState().actualizarRival({ modoVista: 'solo_nosotros' });
    expect(estado().titulares).toEqual(titularesIniciales);
  });

  it('con todo el equipo en su mitad no se mueve a nadie, y al quitar el rival no se estira: se ofrece', () => {
    const enMiMitad = titularesIniciales.map((t) => ({ ...t, y: Math.min(t.y, 40) }));
    useAlineacionStore.setState((s) => ({ historial: { ...s.historial, presente: { ...s.historial.presente, titulares: enMiMitad } } }));
    useAlineacionStore.getState().activarRival('4-4-2');
    expect(estado().titulares).toEqual(enMiMitad);
    expect(useUiStore.getState().toasts).toHaveLength(0);

    const pasos = useAlineacionStore.getState().historial.pasado.length;
    useAlineacionStore.getState().acomodarEnMiMitad();
    expect(useAlineacionStore.getState().historial.pasado).toHaveLength(pasos);

    // Un bloque colocado a propósito en su campo no se estira solo.
    useAlineacionStore.getState().desactivarRival();
    expect(estado().titulares).toEqual(enMiMitad);
    expect(aviso(EXTENDER)).toBeDefined();
  });

  it('una alineación de antes, acomodada a mano y sin la marca, no se extiende sola: se ofrece', () => {
    useAlineacionStore.setState((s) => ({
      historial: {
        ...s.historial,
        presente: {
          ...s.historial.presente,
          titulares: acomodados(),
          rival: { nombre: 'Rival', formacionId: '4-4-2', paleta: 'blanco', jugadores: [], visible: true, modoVista: 'ambos' },
        },
      },
    }));
    useAlineacionStore.getState().actualizarRival({ visible: false });
    expect(estado().titulares).toEqual(acomodados());

    aviso(EXTENDER)!.accion!.ejecutar();
    expect(estado().titulares).toEqual(titularesIniciales);
  });

  it('si alguien volvió a campo rival, al ocultar no se extiende; renombrar al rival no mueve ni avisa', () => {
    const { activarRival, actualizarRival, moverJugador, extenderPorTodoElCampo } = useAlineacionStore.getState();
    activarRival('4-4-2');
    useUiStore.setState({ toasts: [] });
    actualizarRival({ nombre: 'Rival de prueba', paleta: 'azul' });
    expect(useUiStore.getState().toasts).toHaveLength(0);
    expect(estado().titulares).toEqual(acomodados());

    // y×2 lo sacaría del campo.
    moverJugador('test-09', 58.3, 70);
    const conUnoEnCampoRival = estado().titulares;
    actualizarRival({ visible: false });
    expect(estado().titulares).toEqual(conUnoEnCampoRival);
    extenderPorTodoElCampo();
    expect(estado().titulares).toEqual(conUnoEnCampoRival);
  });

  it('con una jugada abierta no se mueve a nadie solo: se ofrece acomodar, como antes', () => {
    useAlineacionStore.getState().iniciarSecuencia();
    useAlineacionStore.getState().activarRival('4-4-2');
    expect(estado().titulares).toEqual(titularesIniciales);

    aviso(ACOMODAR)!.accion!.ejecutar();
    expect(estado().titulares).toEqual(acomodados());
    // Solo se movió la fase activa: no cuenta como acomodado para extenderlo solo.
    expect(estado().rival?.nuestroEquipoAcomodado).toBeUndefined();
  });
});
