import { describe, expect, it } from 'vitest';
import {
  aplicarRutas,
  avanceDeRuta,
  duracionDeRuta,
  destinoDeTrayectoria,
  muestrearRuta,
  posicionEnRuta,
  puntosDeControl,
  recorridoHasta,
  segmentoEnPunto,
  trayectoriaDe,
} from './trayectorias';
import type { TrayectoriaMovimiento } from '../types';
import { ANCHO_CAMPO_M, LARGO_CAMPO_M } from './constantes';

const nodo = (id: string, x: number, y: number) => ({ id, x, y });

/**
 * Las longitudes de ruta van en METROS reales (cancha de 105 x 68), no en las
 * unidades normalizadas 0-100. Los tests miden con la misma vara.
 */
const metros = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(((b.x - a.x) / 100) * ANCHO_CAMPO_M, ((b.y - a.y) / 100) * LARGO_CAMPO_M);

/** Avance sin easing y sin duración propia: el caso simple para los tests de geometría. */
const avanceLineal = (progresoLineal: number) => ({ progresoLineal, duracionTramoMs: 1000, curva: (t: number) => t });

describe('puntos de control', () => {
  it('la ruta va del origen a los nodos intermedios y de ahí al destino', () => {
    const control = puntosDeControl({ x: 0, y: 0 }, [nodo('n1', 10, 20)], { x: 30, y: 0 });
    expect(control).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: 0 },
    ]);
  });
});

describe('muestreo de la curva', () => {
  it('sin nodos intermedios es un segmento recto', () => {
    const ruta = muestrearRuta([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(ruta.puntos).toHaveLength(2);
    expect(ruta.longitud).toBeCloseTo(metros({ x: 0, y: 0 }, { x: 10, y: 0 }));
  });

  it('la curva pasa por los nodos que el entrenador colocó', () => {
    const control = puntosDeControl({ x: 0, y: 0 }, [nodo('n1', 50, 50)], { x: 100, y: 0 });
    const ruta = muestrearRuta(control, 'catmull-rom');
    const pasaCerca = ruta.puntos.some((p) => Math.hypot(p.x - 50, p.y - 50) < 0.6);
    expect(pasaCerca).toBe(true);
  });

  it('con nodos, la curva es más larga que la recta: se desvía de verdad', () => {
    const control = puntosDeControl({ x: 0, y: 0 }, [nodo('n1', 50, 40)], { x: 100, y: 0 });
    expect(muestrearRuta(control, 'catmull-rom').longitud).toBeGreaterThan(metros({ x: 0, y: 0 }, { x: 100, y: 0 }));
  });

  it('en modo lineal no se suaviza: la longitud es la de la polilínea', () => {
    const control = puntosDeControl({ x: 0, y: 0 }, [nodo('n1', 50, 50)], { x: 100, y: 0 });
    const ruta = muestrearRuta(control, 'lineal');
    expect(ruta.puntos).toHaveLength(3);
    expect(ruta.longitud).toBeCloseTo(metros({ x: 0, y: 0 }, { x: 50, y: 50 }) * 2);
  });

  it('nodos duplicados no rompen la curva', () => {
    const control = puntosDeControl({ x: 0, y: 0 }, [nodo('a', 10, 10), nodo('b', 10, 10)], { x: 20, y: 0 });
    const ruta = muestrearRuta(control, 'catmull-rom');
    expect(Number.isFinite(ruta.longitud)).toBe(true);
    expect(ruta.puntos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('posición a lo largo de la ruta', () => {
  const control = puntosDeControl({ x: 0, y: 0 }, [nodo('n1', 50, 40)], { x: 100, y: 0 });
  const ruta = muestrearRuta(control, 'catmull-rom');

  it('los extremos son exactamente el origen y el destino', () => {
    expect(posicionEnRuta(ruta, 0)).toMatchObject({ x: 0, y: 0 });
    expect(posicionEnRuta(ruta, 1)).toMatchObject({ x: 100, y: 0 });
  });

  it('fuera de rango se queda en los extremos', () => {
    expect(posicionEnRuta(ruta, -1)).toMatchObject({ x: 0, y: 0 });
    expect(posicionEnRuta(ruta, 5)).toMatchObject({ x: 100, y: 0 });
  });

  /**
   * El test que de verdad importa: avanzar por DISTANCIA y no por parámetro de
   * curva. Si esto falla, el jugador acelera y frena entre nodos sin motivo.
   */
  it('avanza a velocidad constante: pasos de tiempo iguales recorren distancias iguales', () => {
    const PASOS = 20;
    const distancias: number[] = [];
    let anterior = posicionEnRuta(ruta, 0);
    for (let i = 1; i <= PASOS; i += 1) {
      const actual = posicionEnRuta(ruta, i / PASOS);
      distancias.push(metros(anterior, actual));
      anterior = actual;
    }
    const esperada = ruta.longitud / PASOS;
    for (const d of distancias) {
      expect(Math.abs(d - esperada) / esperada).toBeLessThan(0.05);
    }
  });

  it('una ruta de longitud cero no divide por cero', () => {
    const quieta = muestrearRuta([{ x: 10, y: 10 }, { x: 10, y: 10 }]);
    expect(posicionEnRuta(quieta, 0.5)).toMatchObject({ x: 10, y: 10 });
  });
});

describe('asignación de trayectorias a su dueño', () => {
  const rutas: TrayectoriaMovimiento[] = [
    { id: 't1', jugadorId: 'j7', nodos: [nodo('n', 50, 50)], interpolacion: 'catmull-rom', mostrarRuta: true },
    { id: 't2', balonId: 'b1', nodos: [nodo('n', 20, 20)], interpolacion: 'lineal', mostrarRuta: true },
  ];

  it('encuentra la ruta de cada tipo de elemento', () => {
    expect(trayectoriaDe(rutas, 'titular', 'j7')?.id).toBe('t1');
    expect(trayectoriaDe(rutas, 'balon', 'b1')?.id).toBe('t2');
    expect(trayectoriaDe(rutas, 'rival', 'j7')).toBeUndefined();
    expect(trayectoriaDe(undefined, 'titular', 'j7')).toBeUndefined();
  });

  it('el identificador va al campo que corresponde', () => {
    expect(destinoDeTrayectoria('titular', 'x')).toEqual({ jugadorId: 'x' });
    expect(destinoDeTrayectoria('rival', 'x')).toEqual({ jugadorRivalId: 'x' });
    expect(destinoDeTrayectoria('balon', 'x')).toEqual({ balonId: 'x' });
  });
});

describe('aplicar rutas sobre las posiciones interpoladas', () => {
  const desde = [{ jugadorId: 'j7', x: 0, y: 0 }, { jugadorId: 'j9', x: 0, y: 50 }];
  const hasta = [{ jugadorId: 'j7', x: 100, y: 0 }, { jugadorId: 'j9', x: 100, y: 50 }];
  const rutas: TrayectoriaMovimiento[] = [
    { id: 't1', jugadorId: 'j7', nodos: [nodo('n', 50, 40)], interpolacion: 'catmull-rom', mostrarRuta: true },
  ];
  const recto = [{ jugadorId: 'j7', x: 50, y: 0 }, { jugadorId: 'j9', x: 50, y: 50 }];

  it('solo cambia la posición de quien tiene ruta', () => {
    const salida = aplicarRutas(recto, desde, hasta, (j) => j.jugadorId, rutas, 'titular', avanceLineal(0.5));
    // j7 se desvía hacia su nodo; j9 sigue en la recta.
    expect(salida[0]!.y).toBeGreaterThan(10);
    expect(salida[1]).toMatchObject({ x: 50, y: 50 });
  });

  it('sin rutas devuelve lo interpolado tal cual', () => {
    expect(aplicarRutas(recto, desde, hasta, (j) => j.jugadorId, undefined, 'titular', avanceLineal(0.5))).toBe(recto);
    expect(aplicarRutas(recto, desde, hasta, (j) => j.jugadorId, [], 'titular', avanceLineal(0.5))).toBe(recto);
  });

  it('una ruta sin nodos intermedios no altera la recta', () => {
    const vacia: TrayectoriaMovimiento[] = [
      { id: 't', jugadorId: 'j7', nodos: [], interpolacion: 'catmull-rom', mostrarRuta: true },
    ];
    const salida = aplicarRutas(recto, desde, hasta, (j) => j.jugadorId, vacia, 'titular', avanceLineal(0.5));
    expect(salida[0]).toMatchObject({ x: 50, y: 0 });
  });

  it('en los extremos coincide con el origen y el destino', () => {
    const inicio = aplicarRutas(recto, desde, hasta, (j) => j.jugadorId, rutas, 'titular', avanceLineal(0));
    const fin = aplicarRutas(recto, desde, hasta, (j) => j.jugadorId, rutas, 'titular', avanceLineal(1));
    expect(inicio[0]).toMatchObject({ x: 0, y: 0 });
    expect(fin[0]).toMatchObject({ x: 100, y: 0 });
  });
});

describe('extremos de la curva', () => {
  /**
   * Con puntos fantasma duplicados, el primer y el último tramo degeneraban a
   * recta: la curva solo se doblaba por el medio. Se comprueba que el arranque
   * y la llegada también curvan.
   */
  it('el primer y el último tramo también curvan', () => {
    const control = puntosDeControl({ x: 0, y: 0 }, [nodo('n1', 30, 30), nodo('n2', 70, 30)], { x: 100, y: 0 });
    const ruta = muestrearRuta(control, 'catmull-rom');

    // Un punto al 10% del recorrido no puede estar sobre la recta origen→primer nodo.
    const temprano = posicionEnRuta(ruta, 0.1);
    const sobreLaRecta = (temprano.x / 30) * 30;
    expect(Math.abs(temprano.y - sobreLaRecta)).toBeGreaterThan(0.3);

    // Y la curva completa es más larga que la polilínea recta entre los mismos puntos.
    const recta = muestrearRuta(control, 'lineal');
    expect(ruta.longitud).toBeGreaterThan(recta.longitud * 1.001);
  });

  it('con dos puntos de control sigue siendo una recta exacta', () => {
    const ruta = muestrearRuta(puntosDeControl({ x: 0, y: 0 }, [], { x: 100, y: 0 }), 'catmull-rom');
    expect(ruta.longitud).toBeCloseTo(metros({ x: 0, y: 0 }, { x: 100, y: 0 }));
    expect(posicionEnRuta(ruta, 0.5)).toMatchObject({ x: 50, y: 0 });
  });
});

describe('insertar un nodo tocando la línea', () => {
  const control = puntosDeControl({ x: 0, y: 0 }, [nodo('n1', 50, 0)], { x: 100, y: 0 });
  const ruta = muestrearRuta(control, 'catmull-rom');

  it('un toque en la primera mitad cae en el primer tramo', () => {
    expect(segmentoEnPunto(ruta, { x: 25, y: 0 })?.indiceSegmento).toBe(0);
  });

  it('un toque en la segunda mitad cae en el segundo tramo', () => {
    expect(segmentoEnPunto(ruta, { x: 75, y: 0 })?.indiceSegmento).toBe(1);
  });

  it('devuelve también a qué distancia quedó, para poder exigir cercanía', () => {
    const lejos = segmentoEnPunto(ruta, { x: 50, y: 40 });
    expect(lejos!.distancia).toBeGreaterThan(30);
    const encima = segmentoEnPunto(ruta, { x: 50, y: 0 });
    expect(encima!.distancia).toBeLessThan(2);
  });

  it('con una ruta recta sin nodos, todo cae en el único tramo', () => {
    const recta = muestrearRuta(puntosDeControl({ x: 0, y: 0 }, [], { x: 100, y: 0 }));
    expect(segmentoEnPunto(recta, { x: 30, y: 0 })?.indiceSegmento).toBe(0);
  });

  /** Insertar en el tramo `i` deja el nodo nuevo en la posición `i` de la lista. */
  it('el índice de tramo sirve directamente para colocar el nodo en la lista', () => {
    const nodos = [nodo('a', 30, 0), nodo('b', 70, 0)];
    const conDos = muestrearRuta(puntosDeControl({ x: 0, y: 0 }, nodos, { x: 100, y: 0 }), 'catmull-rom');
    // Tocar entre a y b (tramo 1) debe insertar entre ellos.
    const indice = segmentoEnPunto(conDos, { x: 50, y: 0 })!.indiceSegmento;
    expect(indice).toBe(1);
    const resultado = [...nodos];
    resultado.splice(indice, 0, nodo('nuevo', 50, 0));
    expect(resultado.map((n) => n.id)).toEqual(['a', 'nuevo', 'b']);
  });
});

describe('duración propia de cada trayectoria', () => {
  const conDuracion = (ms?: number): TrayectoriaMovimiento => ({
    id: 't', jugadorId: 'j7', nodos: [nodo('n', 50, 40)], interpolacion: 'catmull-rom', mostrarRuta: true, duracionMs: ms,
  });
  const lineal = (t: number) => t;

  it('sin duración propia, tarda lo que dure el tramo', () => {
    expect(duracionDeRuta(conDuracion(undefined), 2000)).toBe(2000);
  });

  it('con duración propia más corta, manda la suya', () => {
    expect(duracionDeRuta(conDuracion(800), 2000)).toBe(800);
  });

  it('nunca se pasa de lo que dura el tramo: si no, saltaría al cruzar de fase', () => {
    expect(duracionDeRuta(conDuracion(5000), 2000)).toBe(2000);
  });

  it('valores imposibles caen en la duración del tramo', () => {
    expect(duracionDeRuta(conDuracion(0), 2000)).toBe(2000);
    expect(duracionDeRuta(conDuracion(-100), 2000)).toBe(2000);
    expect(duracionDeRuta(conDuracion(Number.NaN), 2000)).toBe(2000);
  });

  it('quien tarda menos llega antes y se queda esperando', () => {
    const ruta = conDuracion(1000);
    const ctx = (p: number) => ({ progresoLineal: p, duracionTramoMs: 2000, curva: lineal });
    // A mitad del tramo (1000ms) ya ha completado su recorrido entero.
    expect(avanceDeRuta(ruta, ctx(0.5))).toBeCloseTo(1);
    // Y a partir de ahí se queda en 1: no se pasa del destino.
    expect(avanceDeRuta(ruta, ctx(0.9))).toBeCloseTo(1);
    // A un cuarto del tramo va por la mitad de SU recorrido.
    expect(avanceDeRuta(ruta, ctx(0.25))).toBeCloseTo(0.5);
  });

  it('sin duración propia avanza al ritmo del tramo', () => {
    const ruta = conDuracion(undefined);
    expect(avanceDeRuta(ruta, { progresoLineal: 0.5, duracionTramoMs: 2000, curva: lineal })).toBeCloseTo(0.5);
  });

  it('dos actores del mismo tramo avanzan a ritmos distintos', () => {
    const rapido = conDuracion(1000);
    const lento = conDuracion(2000);
    const ctx = { progresoLineal: 0.5, duracionTramoMs: 2000, curva: lineal };
    expect(avanceDeRuta(rapido, ctx)).toBeCloseTo(1);
    expect(avanceDeRuta(lento, ctx)).toBeCloseTo(0.5);
  });

  it('la curva de la jugada se aplica sobre el reloj propio, no sobre el del tramo', () => {
    const ruta = conDuracion(1000);
    const cuadratica = (t: number) => t * t;
    // progreso 0.25 del tramo = 0.5 del recorrido propio → 0.5² = 0.25
    expect(avanceDeRuta(ruta, { progresoLineal: 0.25, duracionTramoMs: 2000, curva: cuadratica })).toBeCloseTo(0.25);
  });

  it('llegar antes se ve en la posición: está en el destino a mitad del tramo', () => {
    const desde = [{ jugadorId: 'j7', x: 0, y: 0 }];
    const hasta = [{ jugadorId: 'j7', x: 100, y: 0 }];
    const salida = aplicarRutas(
      [{ jugadorId: 'j7', x: 50, y: 0 }], desde, hasta, (j) => j.jugadorId,
      [conDuracion(1000)], 'titular',
      { progresoLineal: 0.5, duracionTramoMs: 2000, curva: lineal },
    );
    expect(salida[0]).toMatchObject({ x: 100, y: 0 });
  });
});

describe('estela: trozo ya recorrido', () => {
  const ruta = muestrearRuta(puntosDeControl({ x: 0, y: 0 }, [nodo('n', 50, 30)], { x: 100, y: 0 }), 'catmull-rom');

  it('al principio no hay nada que dejar atrás', () => {
    expect(recorridoHasta(ruta, 0)).toEqual([]);
  });

  it('al final la estela cubre la ruta entera', () => {
    const completa = recorridoHasta(ruta, 1);
    expect(completa.length).toBe(ruta.puntos.length);
    expect(completa[completa.length - 1]).toMatchObject({ x: 100, y: 0 });
  });

  it('a mitad de camino cubre aproximadamente la mitad de la longitud', () => {
    const trozo = recorridoHasta(ruta, 0.5);
    let largo = 0;
    for (let i = 1; i < trozo.length; i += 1) {
      largo += metros(trozo[i - 1]!, trozo[i]!);
    }
    expect(largo / ruta.longitud).toBeGreaterThan(0.45);
    expect(largo / ruta.longitud).toBeLessThan(0.55);
  });

  it('la estela termina justo bajo el actor, no en la muestra anterior', () => {
    const trozo = recorridoHasta(ruta, 0.37);
    expect(trozo[trozo.length - 1]).toEqual(posicionEnRuta(ruta, 0.37));
  });

  it('una ruta sin longitud no produce estela', () => {
    expect(recorridoHasta(muestrearRuta([{ x: 5, y: 5 }, { x: 5, y: 5 }]), 0.5)).toEqual([]);
  });
});

describe('la longitud se mide en metros, no en unidades normalizadas', () => {
  /**
   * La cancha es 105 × 68: el mismo avance numérico a lo largo es más metros
   * que a lo ancho. Antes se repartía el tiempo con la distancia sin pesar, y
   * un jugador en diagonal cambiaba de velocidad hasta un 10% sin motivo.
   */
  it('recorrer 50 a lo largo son más metros que recorrer 50 a lo ancho', () => {
    const aLoLargo = muestrearRuta([{ x: 50, y: 0 }, { x: 50, y: 50 }]).longitud;
    const aLoAncho = muestrearRuta([{ x: 0, y: 50 }, { x: 50, y: 50 }]).longitud;
    expect(aLoLargo).toBeCloseTo((50 / 100) * LARGO_CAMPO_M);
    expect(aLoAncho).toBeCloseTo((50 / 100) * ANCHO_CAMPO_M);
    expect(aLoLargo).toBeGreaterThan(aLoAncho);
  });

  it('una carrera de 20 metros mide 20, se haga en el eje que se haga', () => {
    const largoDe = (a: { x: number; y: number }, b: { x: number; y: number }) => muestrearRuta([a, b]).longitud;
    const veinteALoLargo = largoDe({ x: 50, y: 10 }, { x: 50, y: 10 + (20 / LARGO_CAMPO_M) * 100 });
    const veinteALoAncho = largoDe({ x: 10, y: 50 }, { x: 10 + (20 / ANCHO_CAMPO_M) * 100, y: 50 });
    expect(veinteALoLargo).toBeCloseTo(20);
    expect(veinteALoAncho).toBeCloseTo(20);
  });

  it('en una diagonal, el tiempo se reparte por metros recorridos', () => {
    // Recta pura en diagonal: cada paso de tiempo igual debe cubrir los mismos metros.
    const ruta = muestrearRuta([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
    const PASOS = 10;
    let anterior = posicionEnRuta(ruta, 0);
    for (let i = 1; i <= PASOS; i += 1) {
      const actual = posicionEnRuta(ruta, i / PASOS);
      expect(metros(anterior, actual)).toBeCloseTo(ruta.longitud / PASOS, 4);
      anterior = actual;
    }
  });
});
