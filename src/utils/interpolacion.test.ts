import { describe, expect, it } from 'vitest';
import {
  CURVAS_EASING,
  DURACION_MAXIMA_MS,
  DURACION_MINIMA_MS,
  DURACION_TRANSICION_MS,
  duracionDeFrame,
  duracionTotal,
  interpolar,
  interpolarAngulo,
  interpolarPorId,
  suavizar,
  tiempoHastaFrame,
  ubicacionEnTiempo,
  formatearTiempo,
} from './interpolacion';
import type { TipoEasing } from '../types';

describe('duración por fase', () => {
  it('una fase sin duración usa la de por defecto (jugadas guardadas antes de existir esto)', () => {
    expect(duracionDeFrame({})).toBe(DURACION_TRANSICION_MS);
    expect(duracionDeFrame(undefined)).toBe(DURACION_TRANSICION_MS);
  });

  it('respeta la duración de la fase', () => {
    expect(duracionDeFrame({ duracionMs: 2500 })).toBe(2500);
  });

  it('recorta valores imposibles en vez de romper la reproducción', () => {
    expect(duracionDeFrame({ duracionMs: 10 })).toBe(DURACION_MINIMA_MS);
    expect(duracionDeFrame({ duracionMs: 999999 })).toBe(DURACION_MAXIMA_MS);
    expect(duracionDeFrame({ duracionMs: Number.NaN })).toBe(DURACION_TRANSICION_MS);
  });

  it('la duración total ignora la última fase: no hay transición después de ella', () => {
    expect(duracionTotal([{ duracionMs: 1000 }, { duracionMs: 2000 }, { duracionMs: 500 }])).toBe(3000);
    expect(duracionTotal([{ duracionMs: 1000 }])).toBe(0);
    expect(duracionTotal([])).toBe(0);
  });
});

describe('curvas de easing', () => {
  const tipos = Object.keys(CURVAS_EASING) as TipoEasing[];

  it('todas empiezan en 0 y acaban en 1', () => {
    for (const tipo of tipos) {
      expect(CURVAS_EASING[tipo](0)).toBeCloseTo(0);
      expect(CURVAS_EASING[tipo](1)).toBeCloseTo(1);
    }
  });

  it('la lineal no deforma el tiempo', () => {
    expect(CURVAS_EASING.lineal(0.37)).toBeCloseTo(0.37);
  });

  it('arranque suave va por detrás y frenada suave por delante', () => {
    expect(CURVAS_EASING.entrada(0.5)).toBeLessThan(0.5);
    expect(CURVAS_EASING.salida(0.5)).toBeGreaterThan(0.5);
  });

  it('sin indicar curva se usa la suave', () => {
    expect(suavizar(0.25)).toBeCloseTo(CURVAS_EASING['entrada-salida'](0.25));
  });
});

describe('interpolación', () => {
  it('interpola valores sueltos', () => {
    expect(interpolar(20, 40, 0.5)).toBe(30);
  });

  it('la rotación va por el camino corto y no da la vuelta entera', () => {
    // De 350° a 10° son 20° hacia adelante, no 340° hacia atrás.
    expect(interpolarAngulo(350, 10, 0.5)).toBeCloseTo(360);
    expect(interpolarAngulo(10, 350, 0.5)).toBeCloseTo(0);
    expect(interpolarAngulo(0, 90, 0.5)).toBeCloseTo(45);
  });

  it('interpola la rotación de los objetos que la tienen', () => {
    const desde = [{ id: 'a', x: 0, y: 0, rotacion: 0 }];
    const hasta = [{ id: 'a', x: 10, y: 20, rotacion: 90 }];
    expect(interpolarPorId(desde, hasta, (o) => o.id, 0.5)[0]).toMatchObject({ x: 5, y: 10, rotacion: 45 });
  });

  it('lo que no está en el destino se queda quieto', () => {
    const desde = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 7, y: 7 }];
    const hasta = [{ id: 'a', x: 10, y: 10 }];
    const salida = interpolarPorId(desde, hasta, (o) => o.id, 1);
    expect(salida[0]).toMatchObject({ x: 10, y: 10 });
    expect(salida[1]).toMatchObject({ x: 7, y: 7 });
  });
});

describe('posición en el tiempo (scrubbing)', () => {
  // 3 fases: dos transiciones de 1000 y 2000 ms. La última no aporta tiempo.
  const frames = [{ duracionMs: 1000 }, { duracionMs: 2000 }, { duracionMs: 500 }];

  it('la duración total suma solo las transiciones', () => {
    expect(duracionTotal(frames)).toBe(3000);
  });

  it('el arranque de cada fase cae donde debe', () => {
    expect(tiempoHastaFrame(frames, 0)).toBe(0);
    expect(tiempoHastaFrame(frames, 1)).toBe(1000);
    expect(tiempoHastaFrame(frames, 2)).toBe(3000);
  });

  it('un instante cualquiera da fase y avance dentro de ella', () => {
    expect(ubicacionEnTiempo(frames, 0)).toEqual({ indice: 0, progreso: 0 });
    expect(ubicacionEnTiempo(frames, 500)).toEqual({ indice: 0, progreso: 0.5 });
    // Justo en la frontera se entra ya en la fase siguiente.
    expect(ubicacionEnTiempo(frames, 1000)).toEqual({ indice: 1, progreso: 0 });
    expect(ubicacionEnTiempo(frames, 2000)).toEqual({ indice: 1, progreso: 0.5 });
  });

  it('fuera de rango se queda en los extremos en vez de romperse', () => {
    expect(ubicacionEnTiempo(frames, -500)).toEqual({ indice: 0, progreso: 0 });
    expect(ubicacionEnTiempo(frames, 99999)).toEqual({ indice: 2, progreso: 0 });
  });

  it('una jugada de una sola fase no tiene recorrido', () => {
    expect(duracionTotal([{ duracionMs: 1000 }])).toBe(0);
    expect(ubicacionEnTiempo([{ duracionMs: 1000 }], 0)).toEqual({ indice: 0, progreso: 0 });
  });

  it('el cronómetro se lee como en una mesa de edición', () => {
    expect(formatearTiempo(0)).toBe('00:00.00');
    expect(formatearTiempo(1240)).toBe('00:01.24');
    expect(formatearTiempo(6000)).toBe('00:06.00');
    expect(formatearTiempo(65430)).toBe('01:05.43');
  });
});
