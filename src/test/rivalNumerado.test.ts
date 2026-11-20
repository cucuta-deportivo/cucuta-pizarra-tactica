import { beforeEach, describe, expect, it } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { FORMACIONES, numeroRivalDeZona, obtenerFormacion } from '../data/formaciones';
import { ubicarZonaEnLado } from '../utils/anexoA';

/**
 * F5.2: al elegir la formación del rival salen los 11 colocados y numerados con
 * la numeración clásica aprobada por el cuerpo técnico (1 portero, 2 lateral
 * derecho, 3 lateral izquierdo, 4 y 5 centrales, 6 medio defensivo, 8 y 10
 * medios, 7 y 11 bandas, 9 delantero centro). Nuestro equipo nunca se coloca solo.
 */
const estado = () => useAlineacionStore.getState();
const doc = () => estado().historial.presente;

describe('tabla de números del rival', () => {
  it('cada formación da del 1 al 11 sin repetir, uno por zona', () => {
    for (const formacion of FORMACIONES) {
      const numeros = formacion.zonas.map((z) => numeroRivalDeZona(formacion.id, z.id));
      expect([...numeros].sort((a, b) => a! - b!), formacion.id).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    }
  });

  it('sigue la tabla aprobada en los casos que el criterio no fija', () => {
    // 4-4-2: centrales 4 (derecho) y 5; dos delanteros 9 (derecho) y 10; medios sin pivote 6 y 8.
    expect(['LD-4', 'DFC-3', 'DFC-2', 'LI-1', 'MC-7', 'MC-6', 'DC-10', 'DC-9'].map((z) => numeroRivalDeZona('4-4-2', z))).toEqual([
      2, 4, 5, 3, 6, 8, 9, 10,
    ]);
    // 3-5-2: el central del medio lleva el 6 y los medios de los lados, 7 y 11.
    expect(['DFC-2', 'MC-7', 'MC-5'].map((z) => numeroRivalDeZona('3-5-2', z))).toEqual([6, 7, 11]);
    // 3-4-3: los carrileros, 2 y 3.
    expect(['MD-7', 'MI-4'].map((z) => numeroRivalDeZona('3-4-3', z))).toEqual([2, 3]);
  });
});

describe('rival colocado y numerado (F5.2)', () => {
  beforeEach(() => {
    sembrarPlantilla();
    estado().nuevaAlineacion();
  });

  it('al activar el rival salen los 11 en sus zonas, numerados y en su mitad; los nuestros no se colocan', () => {
    estado().activarRival('4-3-3');
    const rival = doc().rival!;
    expect(rival.jugadores).toHaveLength(11);
    for (const zona of obtenerFormacion('4-3-3')!.zonas) {
      const jugador = rival.jugadores.find((j) => j.zonaOrigenId === zona.id)!;
      const lugar = ubicarZonaEnLado(zona, { espejo: true, mediaCancha: true });
      expect(jugador).toMatchObject({ dorsal: numeroRivalDeZona('4-3-3', zona.id), posicion: zona.posicion, x: lugar.x, y: lugar.y });
    }
    expect(doc().titulares).toEqual([]);
  });

  it('cambiar la formación del rival los vuelve a colocar y numerar, y quita los marcajes', () => {
    estado().activarRival('4-4-2');
    estado().agregarMarcaje('test-09', doc().rival!.jugadores[0]!.id);
    expect(doc().marcajes).toHaveLength(1);

    estado().seleccionarFormacionRival('3-5-2');
    const jugadores = doc().rival!.jugadores;
    expect(jugadores).toHaveLength(11);
    expect(jugadores.find((j) => j.zonaOrigenId === 'DFC-2')).toMatchObject({ dorsal: 6, posicion: 'DFC' });
    expect(doc().marcajes).toEqual([]);
  });

  it('cambiar dorsal y apellido de un rival; con el apellido vacío se quita, y se deshace', () => {
    estado().activarRival('4-4-2');
    const id = doc().rival!.jugadores.find((j) => j.zonaOrigenId === 'DC-10')!.id;

    estado().actualizarJugadorRival(id, 23, 'Gómez');
    expect(doc().rival!.jugadores.find((j) => j.id === id)).toMatchObject({ dorsal: 23, apellido: 'Gómez' });

    estado().actualizarJugadorRival(id, 23, '');
    expect(doc().rival!.jugadores.find((j) => j.id === id)!.apellido).toBeUndefined();

    estado().deshacer();
    expect(doc().rival!.jugadores.find((j) => j.id === id)).toMatchObject({ dorsal: 23, apellido: 'Gómez' });
  });

  it('con una jugada, el dorsal cambia en todas sus fases y en la pizarra guardada', () => {
    estado().activarRival('4-4-2');
    const id = doc().rival!.jugadores[0]!.id;
    estado().iniciarSecuencia();
    estado().agregarFrame();

    estado().actualizarJugadorRival(id, 30, '');
    const secuencia = doc().secuencia!;
    estado().irAFrame(0);
    for (const lista of [doc().rival!.jugadores, ...secuencia.frames.map((f) => f.jugadoresRival), secuencia.pizarra!.jugadoresRival]) {
      expect(lista.find((j) => j.id === id)!.dorsal).toBe(30);
    }
  });
});
