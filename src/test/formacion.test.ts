import { beforeEach, describe, expect, it } from 'vitest';
import { PLANTILLA_PRUEBA, sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { obtenerFormacion } from '../data/formaciones';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import type { JugadorEnCampo } from '../types';

/**
 * Cambiar de formación no mueve a nadie (CLAUDE.md): solo cambian las zonas
 * fantasma. Se parte de un 4-3-3 completo, con dos jugadores ya arrastrados
 * fuera de su zona, y se pasa a 4-4-2.
 */
const estado = () => useAlineacionStore.getState().historial.presente;
const zonasFantasma = () => {
  const { formacionId, titulares } = estado();
  return obtenerFormacion(formacionId)!
    .zonas.filter((z) => !titulares.some((t) => t.zonaOrigenId === z.id))
    .map((z) => z.id);
};
const titularDe = (jugadorId: string) => estado().titulares.find((t) => t.jugadorId === jugadorId)!;

describe('cambio de formación sin mover a los jugadores', () => {
  let titularesIniciales: JugadorEnCampo[];

  beforeEach(() => {
    sembrarPlantilla();
    // Un jugador por zona del 4-3-3, emparejados por posición natural.
    const libres = [...PLANTILLA_PRUEBA];
    titularesIniciales = obtenerFormacion('4-3-3')!.zonas.map((zona) => {
      const jugador = libres.splice(
        libres.findIndex((j) => j.posicionNatural === zona.posicion),
        1,
      )[0]!;
      return { jugadorId: jugador.id, x: zona.x, y: zona.y, zonaOrigenId: zona.id, esCapitan: false };
    });
    // Dos ya movidos a mano: deben seguir exactamente ahí después del cambio.
    titularesIniciales[5] = { ...titularesIniciales[5]!, x: 47.3, y: 55.1 };
    titularesIniciales[9] = { ...titularesIniciales[9]!, x: 61.8, y: 90.4 };

    const ahora = new Date().toISOString();
    useAlineacionStore.setState({
      id: generarId(),
      nombre: 'Prueba de formación',
      creadaEn: ahora,
      modificadaEn: ahora,
      historial: {
        pasado: [],
        presente: {
          formacionId: '4-3-3',
          titulares: titularesIniciales,
          banquillo: ['test-14'],
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

  it('nadie se mueve ni va al banquillo, y solo se ven los huecos de la formación nueva', () => {
    useAlineacionStore.getState().seleccionarFormacion('4-4-2');

    expect(estado().formacionId).toBe('4-4-2');
    expect(estado().titulares.map(({ jugadorId, x, y }) => ({ jugadorId, x, y }))).toEqual(
      titularesIniciales.map(({ jugadorId, x, y }) => ({ jugadorId, x, y })),
    );
    expect(estado().banquillo).toEqual(['test-14']);
    // 4-4-2 no tiene MCD, EI ni ED; a cambio pide MI, MD y un segundo DC.
    expect(zonasFantasma().sort()).toEqual(['DC-10', 'MD-8', 'MI-5']);
  });

  it('marca fuera del esquema solo a quien se queda sin zona de su posición', () => {
    // Orden invertido: el DFC derecho se procesa antes que el izquierdo.
    useAlineacionStore.setState((s) => ({
      historial: { ...s.historial, presente: { ...s.historial.presente, titulares: [...titularesIniciales].reverse() } },
    }));
    useAlineacionStore.getState().seleccionarFormacion('4-4-2');

    const fuera = estado().titulares.filter((t) => t.fueraDeEsquema);
    expect(fuera.map((t) => t.jugadorId).sort()).toEqual(['test-06', 'test-11', 'test-12']);
    expect(fuera.every((t) => t.zonaOrigenId === undefined)).toBe(true);
    // Los DFC siguen unidos al DFC de su mismo lado, no al primero que aparezca.
    expect(titularDe('test-04').zonaOrigenId).toBe('DFC-2');
    expect(titularDe('test-05').zonaOrigenId).toBe('DFC-3');
  });

  it('asignar una zona fantasma a un jugador fuera del esquema le quita la marca', () => {
    useAlineacionStore.getState().seleccionarFormacion('4-4-2');
    const mi = obtenerFormacion('4-4-2')!.zonas.find((z) => z.id === 'MI-5')!;

    useAlineacionStore.getState().asignarJugador(mi.id, mi.x, mi.y, 'test-11');

    expect(titularDe('test-11')).toMatchObject({ zonaOrigenId: 'MI-5', x: mi.x, y: mi.y });
    expect(titularDe('test-11').fueraDeEsquema).toBeUndefined();
    expect(estado().titulares).toHaveLength(11);
  });

  it('quien entró desde el panel no tiene zona, pero no queda marcado', () => {
    useAlineacionStore.getState().moverDesdeBanquilloACampo('test-14', 20, 30);
    useAlineacionStore.getState().seleccionarFormacion('4-4-2');

    expect(titularDe('test-14')).toMatchObject({ x: 20, y: 30 });
    expect(titularDe('test-14').fueraDeEsquema).toBeUndefined();
  });

  it('en una sustitución, quien entra hereda el puesto fuera del esquema', () => {
    useAlineacionStore.getState().seleccionarFormacion('4-4-2');
    useAlineacionStore.getState().sustituirEnCampo('test-06', 'test-14');

    expect(titularDe('test-14').fueraDeEsquema).toBe(true);
  });

  it('deshacer devuelve la formación, las zonas y quita las marcas', () => {
    useAlineacionStore.getState().seleccionarFormacion('4-4-2');
    useAlineacionStore.getState().deshacer();

    expect(estado().formacionId).toBe('4-3-3');
    expect(estado().titulares).toEqual(titularesIniciales);
  });

  it('vaciar el campo quita a todos los titulares y se puede deshacer', () => {
    useAlineacionStore.getState().vaciarCampo();
    expect(estado().titulares).toHaveLength(0);
    expect(estado().banquillo).toEqual(['test-14']);

    useAlineacionStore.getState().deshacer();
    expect(estado().titulares).toEqual(titularesIniciales);
  });
});
