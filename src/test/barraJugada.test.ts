import { describe, expect, it } from 'vitest';
import {
  anchoOcupado,
  elegirNivel,
  espacioDisponible,
  jugadaArriba,
  pasosAplicados,
  PASOS,
} from '../utils/barraJugada';

/**
 * Qué cabe en la fila de abajo de la barra de la jugada. La prioridad la fijó el
 * usuario: ＋ Fase (siempre), duración, nombre de la fase, mover, duplicar,
 * borrar; Grabar y Movimiento se encogen antes de esconder la duración.
 */
describe('fila de abajo: qué se ve según el sitio', () => {
  it('se esconde de lo que menos importa a lo que más, y ＋ Fase nunca', () => {
    expect(PASOS).toEqual(['borrar', 'duplicar', 'mover', 'nombreFase', 'compactar', 'duracion']);
    expect(PASOS).not.toContain('masFase');
  });

  it('con sitio de sobra no se esconde nada', () => {
    expect(elegirNivel(2000)).toBe(0);
    expect(elegirNivel(748)).toBe(0);
  });

  it('cada paso entra justo cuando falta sitio para el anterior', () => {
    expect(elegirNivel(747)).toBe(1); // fuera borrar
    expect(elegirNivel(681)).toBe(2); // fuera duplicar
    expect(elegirNivel(611)).toBe(3); // fuera mover
    expect(elegirNivel(511)).toBe(4); // fuera el nombre de la fase (va junto a «FASE x/y»)
    expect(elegirNivel(385)).toBe(5); // Grabar y Movimiento, con la palabra debajo
    expect(elegirNivel(295)).toBe(6); // fuera la duración: solo queda ＋ Fase
    expect(elegirNivel(0)).toBe(6);
  });

  it('la duración aguanta hasta después de encoger Grabar y Movimiento', () => {
    const aplicados = pasosAplicados(5);
    expect(aplicados.has('compactar')).toBe(true);
    expect(aplicados.has('duracion')).toBe(false);
  });

  it('no oscila: medir con el nivel elegido da el mismo nivel', () => {
    for (const espacio of [180, 250, 296, 386, 512, 612, 682, 748, 1200]) {
      const nivel = elegirNivel(espacio);
      const anchoBloqueFase = espacio - anchoOcupado(nivel);
      expect(elegirNivel(espacioDisponible(anchoBloqueFase, nivel))).toBe(nivel);
    }
  });
});

describe('fila de arriba: nombre y curva de la jugada junto a las pestañas', () => {
  it('suben solo si a las pestañas les quedan al menos 720 px', () => {
    expect(jugadaArriba(1196, false)).toBe(true); // 1366 de ancho
    expect(jugadaArriba(1010, false)).toBe(false); // 1180 de ancho: se quedan en «Más ▾»
  });

  it('no oscila: con los campos ya arriba, la medida de las pestañas da lo mismo', () => {
    expect(jugadaArriba(1196 - 344, true)).toBe(true);
    expect(jugadaArriba(1010 - 344, true)).toBe(false);
  });
});
