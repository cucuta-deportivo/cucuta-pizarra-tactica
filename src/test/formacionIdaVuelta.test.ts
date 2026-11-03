import { beforeEach, describe, expect, it } from 'vitest';
import { PLANTILLA_PRUEBA, sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { obtenerFormacion } from '../data/formaciones';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia, zonaBajoPunto, zonasSinJugador } from '../utils/anexoA';
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

/**
 * Soltar a un jugador sin zona (entró desde el panel o está fuera del esquema)
 * sobre una zona fantasma libre: la ocupa, de cualquier posición, y se queda
 * exactamente donde se soltó. Quien ya tiene zona no cambia de zona.
 */
describe('soltar sobre una zona fantasma', () => {
  const titularDe = (id: string) => estado().titulares.find((t) => t.jugadorId === id);
  const fantasmas = () => zonasSinJugador(obtenerFormacion(estado().formacionId)!.zonas, estado().titulares).map((z) => z.id);

  beforeEach(() => {
    sembrarPlantilla();
    // El ED (test-12) espera en el banquillo; su zona ED-10 está libre.
    prepararDocumento('4-3-3', onceEn('4-3-3').filter((t) => t.jugadorId !== 'test-12'), ['test-12']);
    comprobarReglas();
  });

  it('desde el panel: ocupa la zona, se queda donde se soltó y la zona deja de ser fantasma', () => {
    store().moverDesdeBanquilloACampo('test-12', 81.3, 77.9, 'ED-10');
    comprobarReglas();
    expect(titularDe('test-12')).toMatchObject({ zonaOrigenId: 'ED-10', x: 81.3, y: 77.9 });
    expect(fantasmas()).not.toContain('ED-10');

    store().deshacer();
    comprobarReglas();
    expect(titularDe('test-12')).toBeUndefined();
    expect(estado().banquillo).toContain('test-12');
    expect(fantasmas()).toContain('ED-10');
  });

  it('fuera del esquema: ocupa una zona de otra posición y deja de estar fuera; deshacer lo devuelve', () => {
    cambiar('4-4-2'); // el MCD (test-06) queda fuera
    store().moverJugador('test-06', 15.2, 46.7, 'MI-5');
    comprobarReglas();
    expect(titularDe('test-06')).toMatchObject({ zonaOrigenId: 'MI-5', x: 15.2, y: 46.7 });
    expect(titularDe('test-06')!.fueraDeEsquema).toBeUndefined();
    expect(titularDe('test-06')!.zonaPerdida).toBeUndefined();

    store().deshacer();
    comprobarReglas();
    expect(titularDe('test-06')).toMatchObject({ fueraDeEsquema: true, zonaPerdida: { posicion: 'MCD' } });
    expect(fantasmas()).toContain('MI-5');
  });

  it('un jugador que ya tiene zona no cambia de zona al soltarlo sobre otra libre', () => {
    cambiar('4-4-2'); // el DC (test-09) queda en DC-9 y DC-10 libre
    store().moverJugador('test-09', 62, 80, 'DC-10');
    comprobarReglas();
    expect(titularDe('test-09')).toMatchObject({ zonaOrigenId: 'DC-9', x: 62, y: 80 });
    expect(fantasmas()).toContain('DC-10');
  });

  it('no ocupa una zona que ya tiene jugador ni una que no es de la formación actual', () => {
    store().moverDesdeBanquilloACampo('test-12', 50, 6, 'POR-0');
    expect(titularDe('test-12')!.zonaOrigenId).toBeUndefined();
    cambiar('4-4-2'); // el MCD queda fuera; MCD-5 no existe en 4-4-2
    store().moverJugador('test-06', 50, 42, 'MCD-5');
    comprobarReglas();
    expect(titularDe('test-06')).toMatchObject({ fueraDeEsquema: true });
    expect(titularDe('test-06')!.zonaOrigenId).toBeUndefined();
  });

  it('zonaBajoPunto: elige la zona cuyo círculo contiene el punto, la más cercana si hay varias', () => {
    const zonas = obtenerFormacion('4-3-3')!.zonas; // MC-6 (30,52) y MC-7 (70,52)
    const aPixeles = (p: { x: number; y: number }) => ({ x: p.x * 10, y: p.y * 10 });
    expect(zonaBajoPunto(zonas, { x: 310, y: 530 }, aPixeles, 28)?.id).toBe('MC-6');
    expect(zonaBajoPunto(zonas, { x: 330, y: 520 }, aPixeles, 28)?.id).toBe(undefined); // a 30 px: fuera del círculo
    expect(zonaBajoPunto(zonas, { x: 500, y: 425 }, aPixeles, 28)?.id).toBe('MCD-5');
  });
});
