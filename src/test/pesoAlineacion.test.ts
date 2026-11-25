import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { useUiStore } from '../store/uiStore';
import { enKB, PESO_AVISO, PESO_TOPE, pesoEnServidor, TOPE_SERVIDOR } from '../utils/pesoAlineacion';
import type { Trazo } from '../types';

/**
 * F5.4b, paso 3: el peso de la alineación. El tope de 1 MB es nuestro (la
 * restricción `alineaciones_documento_valido` de schema.sql). Se cuenta como lo
 * cuenta Postgres, `octet_length(documento::text)`, y por encima de 900 KB no se
 * añaden fases ni jugadas; editar, mover y borrar sí.
 */
describe('peso como lo cuenta Postgres (jsonb como texto)', () => {
  it('un espacio detrás de cada «:» y cada «,» que separan', () => {
    expect(pesoEnServidor({ a: 1, b: [1, 2], c: { d: 'x' } })).toBe('{"a": 1, "b": [1, 2], "c": {"d": "x"}}'.length);
  });

  it('los «:» y «,» de dentro de un texto no cuentan, tampoco con comillas escapadas', () => {
    const texto = { t: 'a:b,c "q"' };
    expect(pesoEnServidor(texto)).toBe(JSON.stringify(texto).length + 1);
  });

  it('en bytes UTF-8: una tilde ocupa 2 y un emoji 4', () => {
    expect(pesoEnServidor({ n: 'ñ', e: '🎬' })).toBe(new TextEncoder().encode('{"n": "ñ", "e": "🎬"}').length);
  });
});

const estado = () => useAlineacionStore.getState();
const doc = () => estado().historial.presente;
const toasts = () => useUiStore.getState().toasts.map((t) => t.mensaje);

/** Un trazo libre de `puntos` puntos: unos 29 bytes por punto. */
function trazo(puntos: number): Trazo {
  return {
    id: `t-${puntos}-${Math.random()}`,
    tipo: 'libre',
    color: '#D4111E',
    grosor: 2,
    puntos: Array.from({ length: puntos }, (_, i) => ({ x: (i % 100) + 0.1234, y: ((i * 7) % 100) + 0.5678 })),
  };
}

/** Jugada 1 cerrada con un dibujo pesado; la 2, abierta con uno mediano en el campo. */
function prepararPesada(puntosJugada1: number, puntosJugada2: number): string {
  estado().iniciarSecuencia();
  estado().agregarTrazo(trazo(puntosJugada1));
  const uno = doc().secuencia!.id!;
  estado().cerrarJugada();
  estado().nuevaJugada();
  estado().agregarTrazo(trazo(puntosJugada2));
  return uno;
}

describe('aviso a 700 KB y tope a 900 KB', () => {
  let salto = 0;
  beforeEach(() => {
    // Los avisos de «no cabe» van como mucho cada 4 s: cada prueba, en otro momento.
    salto += 1;
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000 + salto * 60_000);
    sembrarPlantilla();
    estado().nuevaAlineacion('Pesada');
    useUiStore.setState({ toasts: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('avisa una vez al pasar de 700 KB y desde 900 KB no deja añadir fases; editar y borrar, sí', () => {
    const uno = prepararPesada(21000, 2000);
    expect(estado().pesoAlineacion()).toBeLessThan(PESO_AVISO);

    const fases = () => doc().secuencia!.frames.length;
    let intentos = 0;
    while (estado().pesoAlineacion() < PESO_TOPE && intentos < 20) {
      estado().agregarFrame();
      intentos += 1;
    }
    expect(toasts().filter((m) => m.includes('ya ocupa'))).toHaveLength(1);
    expect(estado().pesoAlineacion()).toBeGreaterThanOrEqual(PESO_TOPE);
    expect(estado().pesoAlineacion()).toBeLessThan(TOPE_SERVIDOR);

    // En el tope: ni una fase más, con un aviso que dice cuánto ocupa.
    const antes = fases();
    estado().agregarFrame();
    estado().agregarFrameAlFinal();
    estado().duplicarFrame(0);
    expect(fases()).toBe(antes);
    expect(toasts().some((m) => m.includes(`ocupa ${enKB(estado().pesoAlineacion())} KB de 1 MB: no caben más fases`))).toBe(true);

    // Editar sí se puede, y borrar libera sitio.
    estado().renombrarJugada(uno, 'Pesada pero editable');
    expect(doc().jugadas[0]!.nombre).toBe('Pesada pero editable');
    estado().borrarJugada(uno);
    expect(estado().pesoAlineacion()).toBeLessThan(PESO_TOPE);
    estado().agregarFrame();
    expect(fases()).toBe(antes + 1);
  });

  it('en el tope tampoco se crean ni duplican jugadas', () => {
    prepararPesada(21000, 2000);
    while (estado().pesoAlineacion() < PESO_TOPE) estado().agregarFrame();
    const jugadas = doc().jugadas.length;
    const abierta = doc().secuencia!.id!;

    estado().nuevaJugada();
    estado().duplicarJugada(abierta);
    expect(doc().jugadas).toHaveLength(jugadas);
    expect(doc().secuencia!.id).toBe(abierta);
    expect(toasts().some((m) => m.includes('no caben más jugadas'))).toBe(true);
  });

  it('si una sola acción la llevara por encima de 1 MB, se deshace', () => {
    prepararPesada(17600, 6700);
    const peso = estado().pesoAlineacion();
    expect(peso).toBeLessThan(PESO_TOPE);
    const fases = doc().secuencia!.frames.length;

    estado().agregarFrame(); // copiaría el dibujo de la fase dos veces: más de 1 MB
    expect(doc().secuencia!.frames).toHaveLength(fases);
    expect(estado().pesoAlineacion()).toBe(peso);
    expect(toasts().some((m) => m.startsWith('No cabe: la alineación pasaría de 1 MB'))).toBe(true);
  });
});
