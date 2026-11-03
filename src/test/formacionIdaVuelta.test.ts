import { beforeEach, describe, expect, it } from 'vitest';
import { PLANTILLA_PRUEBA, sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { obtenerFormacion } from '../data/formaciones';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia, zonasSinJugador } from '../utils/anexoA';
import type { JugadorEnCampo } from '../types';

/**
 * Cambios de formación de ida y vuelta (fallo encontrado en Brave tras el paso 6).
 * En cada paso se comprueban siempre las mismas reglas:
 *  1. Cada jugador aparece una sola vez en el campo (y no a la vez en el banquillo).
 *  2. Cada zona tiene como máximo un jugador y cada jugador como máximo una zona,
 *     siempre de la formación actual.
 *  3. Al volver a una formación, cada jugador recupera su zona de la misma
 *     posición si sigue libre.
 *  4. Las zonas fantasma (las que dibuja el campo) son exactamente las que no tienen jugador.
 */
const store = () => useAlineacionStore.getState();
const estado = () => store().historial.presente;

function comprobarReglas(): void {
  const { titulares, banquillo, formacionId } = estado();
  const zonas = obtenerFormacion(formacionId)!.zonas;

  const ids = titulares.map((t) => t.jugadorId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.filter((id) => banquillo.includes(id))).toEqual([]);

  const ocupadas = titulares.flatMap((t) => (t.zonaOrigenId ? [t.zonaOrigenId] : []));
  expect(new Set(ocupadas).size).toBe(ocupadas.length);
  expect(ocupadas.filter((id) => !zonas.some((z) => z.id === id))).toEqual([]);

  const fantasmas = zonasSinJugador(zonas, titulares).map((z) => z.id).sort();
  expect(fantasmas).toEqual(zonas.filter((z) => !ocupadas.includes(z.id)).map((z) => z.id).sort());
}

/** Zona de cada jugador, para comparar con la del principio. */
const zonaDeCada = () => Object.fromEntries(estado().titulares.map((t) => [t.jugadorId, t.zonaOrigenId]));
const posiciones = () => estado().titulares.map(({ jugadorId, x, y }) => ({ jugadorId, x, y }));

function cambiar(formacionId: string): void {
  store().seleccionarFormacion(formacionId);
  comprobarReglas();
}

/** Un jugador de la plantilla por zona, emparejados por posición natural. */
function onceEn(formacionId: string): JugadorEnCampo[] {
  const libres = [...PLANTILLA_PRUEBA];
  return obtenerFormacion(formacionId)!.zonas.map((zona) => {
    const indice = libres.findIndex((j) => j.posicionNatural === zona.posicion);
    const jugador = libres.splice(indice >= 0 ? indice : 0, 1)[0]!;
    return { jugadorId: jugador.id, x: zona.x, y: zona.y, zonaOrigenId: zona.id, esCapitan: false };
  });
}

function prepararDocumento(formacionId: string, titulares: JugadorEnCampo[], banquillo: string[] = []): void {
  const ahora = new Date().toISOString();
  useAlineacionStore.setState({
    id: generarId(),
    nombre: 'Prueba ida y vuelta',
    creadaEn: ahora,
    modificadaEn: ahora,
    historial: {
      pasado: [],
      presente: {
        formacionId,
        titulares,
        banquillo,
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
}

describe('cambio de formación de ida y vuelta', () => {
  beforeEach(() => {
    sembrarPlantilla();
    prepararDocumento('4-3-3', onceEn('4-3-3'), ['test-13']);
    comprobarReglas();
  });

  it('4-3-3 → 4-4-2 → 4-3-3: cada uno recupera su zona y nadie se mueve', () => {
    const zonas = zonaDeCada();
    const antes = posiciones();
    cambiar('4-4-2');
    cambiar('4-3-3');
    expect(zonaDeCada()).toEqual(zonas);
    expect(estado().titulares.filter((t) => t.fueraDeEsquema)).toEqual([]);
    expect(posiciones()).toEqual(antes);
  });

  it('4-3-3 → 3-5-2 → 4-4-2 → 4-3-3: cada uno recupera su zona', () => {
    const zonas = zonaDeCada();
    cambiar('3-5-2');
    cambiar('4-4-2');
    cambiar('4-3-3');
    expect(zonaDeCada()).toEqual(zonas);
  });

  it('con jugadores movidos a mano: recuperan su zona y siguen donde los dejó el entrenador', () => {
    const zonas = zonaDeCada();
    store().moverJugador('test-06', 41.5, 63.2); // MCD, que queda fuera en 4-4-2
    store().moverJugador('test-09', 57.1, 91.4); // DC, que sigue dentro
    const antes = posiciones();
    cambiar('4-4-2');
    cambiar('4-3-3');
    expect(zonaDeCada()).toEqual(zonas);
    expect(posiciones()).toEqual(antes);
  });

  it('con un jugador que entró desde el panel: él no toma zona ni se marca; los demás recuperan la suya', () => {
    store().moverDesdeBanquilloACampo('test-13', 70, 60);
    const zonas = zonaDeCada();
    cambiar('4-4-2');
    cambiar('4-3-3');
    expect(zonaDeCada()).toEqual(zonas);
    const delPanel = estado().titulares.find((t) => t.jugadorId === 'test-13')!;
    expect(delPanel.zonaOrigenId).toBeUndefined();
    expect(delPanel.fueraDeEsquema).toBeUndefined();
  });

  it('con Deshacer y Rehacer entre los cambios', () => {
    const zonas = zonaDeCada();
    cambiar('4-4-2');
    store().deshacer();
    comprobarReglas();
    expect(zonaDeCada()).toEqual(zonas);
    store().rehacer();
    comprobarReglas();
    cambiar('4-3-3');
    expect(zonaDeCada()).toEqual(zonas);
    store().deshacer();
    comprobarReglas();
    store().rehacer();
    comprobarReglas();
    expect(zonaDeCada()).toEqual(zonas);
  });

  it('recargando la alineación guardada entre los cambios', async () => {
    const zonas = zonaDeCada();
    const id = store().id;
    cambiar('4-4-2');
    await store().guardarAhora();
    await store().cargarAlineacion(id);
    comprobarReglas();
    cambiar('4-3-3');
    await store().guardarAhora();
    await store().cargarAlineacion(id);
    comprobarReglas();
    expect(zonaDeCada()).toEqual(zonas);
  });

  it('con el rival activado', () => {
    const zonas = zonaDeCada();
    store().activarRival('4-4-2');
    cambiar('4-4-2');
    cambiar('4-3-3');
    expect(zonaDeCada()).toEqual(zonas);
  });

  it('pasando por una formación que sí tiene su posición, el que estaba fuera entra en ella', () => {
    cambiar('4-4-2'); // MCD, EI y ED quedan fuera
    cambiar('4-2-3-1'); // tiene MCD, EI y ED
    const porJugador = zonaDeCada();
    expect(porJugador['test-06']).toMatch(/^MCD-/);
    expect(porJugador['test-11']).toBe('EI-7');
    expect(porJugador['test-12']).toBe('ED-9');
  });

  it('si su posición ya está ocupada por alguien dentro del esquema, sigue fuera', () => {
    prepararDocumento('4-2-3-1', onceEn('4-2-3-1'));
    const zonas = zonaDeCada();
    const [primerMcd, segundoMcd] = estado().titulares.filter((t) => t.zonaOrigenId?.startsWith('MCD-')).map((t) => t.jugadorId);
    cambiar('4-3-3'); // un solo MCD: entra el primero, el segundo queda fuera
    expect(zonaDeCada()[primerMcd!]).toBe('MCD-5');
    expect(estado().titulares.find((t) => t.jugadorId === segundoMcd)!.fueraDeEsquema).toBe(true);
    cambiar('4-2-3-1'); // de vuelta, cada MCD recupera la suya
    expect(zonaDeCada()).toEqual(zonas);
  });
});
