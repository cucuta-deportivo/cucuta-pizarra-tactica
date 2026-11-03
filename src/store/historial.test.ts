import { describe, expect, it } from 'vitest';
import {
  actualizarHistorial,
  crearHistorial,
  deshacerHistorial,
  rehacerHistorial,
  reiniciarHistorial,
  saltarAFuturo,
  saltarAPasado,
} from './historial';
import { LIMITE_HISTORIAL } from '../utils/constantes';

interface Documento {
  contador: number;
}

describe('pila de deshacer/rehacer', () => {
  it('crea un historial vacío con el presente y la etiqueta indicados', () => {
    const historial = crearHistorial<Documento>({ contador: 0 }, 'Inicio');
    expect(historial).toEqual({ pasado: [], presente: { contador: 0 }, etiquetaPresente: 'Inicio', futuro: [] });
  });

  it('apila el estado y la etiqueta anteriores al aplicar un cambio, y limpia el futuro', () => {
    let historial = crearHistorial<Documento>({ contador: 0 }, 'Inicio');
    historial = actualizarHistorial(
      historial,
      (doc) => {
        doc.contador = 1;
      },
      'Cambio a 1',
    );
    expect(historial.presente.contador).toBe(1);
    expect(historial.etiquetaPresente).toBe('Cambio a 1');
    expect(historial.pasado).toEqual([{ estado: { contador: 0 }, etiqueta: 'Inicio' }]);
    expect(historial.futuro).toEqual([]);
  });

  it('no apila nada si la receta no modifica el documento', () => {
    const historial = crearHistorial<Documento>({ contador: 5 }, 'Inicio');
    const resultado = actualizarHistorial(historial, () => {}, 'Sin cambios');
    expect(resultado).toBe(historial);
  });

  it('deshace y rehace correctamente una secuencia de cambios, conservando las etiquetas', () => {
    let historial = crearHistorial<Documento>({ contador: 0 }, 'Inicio');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 1), 'Paso 1');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 2), 'Paso 2');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 3), 'Paso 3');

    historial = deshacerHistorial(historial);
    expect(historial.presente.contador).toBe(2);
    expect(historial.etiquetaPresente).toBe('Paso 2');
    historial = deshacerHistorial(historial);
    expect(historial.presente.contador).toBe(1);
    expect(historial.etiquetaPresente).toBe('Paso 1');

    historial = rehacerHistorial(historial);
    expect(historial.presente.contador).toBe(2);
    expect(historial.etiquetaPresente).toBe('Paso 2');

    historial = actualizarHistorial(historial, (d) => void (d.contador = 99), 'Paso final');
    expect(historial.presente.contador).toBe(99);
    expect(historial.futuro).toEqual([]);
  });

  it('deshacer sobre un historial vacío no hace nada', () => {
    const historial = crearHistorial<Documento>({ contador: 0 }, 'Inicio');
    expect(deshacerHistorial(historial)).toBe(historial);
  });

  it('rehacer sin futuro no hace nada', () => {
    const historial = crearHistorial<Documento>({ contador: 0 }, 'Inicio');
    expect(rehacerHistorial(historial)).toBe(historial);
  });

  it('limita el historial a LIMITE_HISTORIAL pasos (mínimo 50)', () => {
    expect(LIMITE_HISTORIAL).toBeGreaterThanOrEqual(50);
    let historial = crearHistorial<Documento>({ contador: 0 }, 'Inicio');
    for (let i = 1; i <= LIMITE_HISTORIAL + 10; i++) {
      historial = actualizarHistorial(historial, (d) => void (d.contador = i), `Paso ${i}`);
    }
    expect(historial.pasado).toHaveLength(LIMITE_HISTORIAL);
    expect(historial.presente.contador).toBe(LIMITE_HISTORIAL + 10);
  });

  it('reiniciarHistorial reemplaza el presente sin dejar rastro para deshacer', () => {
    const historial = reiniciarHistorial<Documento>({ contador: 42 }, 'Cargada');
    expect(historial).toEqual({ pasado: [], presente: { contador: 42 }, etiquetaPresente: 'Cargada', futuro: [] });
  });

  it('saltarAPasado salta directamente a un paso antiguo, reapilando lo intermedio en el futuro en el orden correcto', () => {
    let historial = crearHistorial<Documento>({ contador: 0 }, 'P0');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 1), 'P1');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 2), 'P2');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 3), 'P3');

    historial = saltarAPasado(historial, 1); // saltar al paso "P1"
    expect(historial.presente).toEqual({ contador: 1 });
    expect(historial.etiquetaPresente).toBe('P1');
    expect(historial.pasado.map((p) => p.etiqueta)).toEqual(['P0']);
    expect(historial.futuro.map((p) => p.etiqueta)).toEqual(['P2', 'P3']);

    // rehacer dos veces debe recuperar exactamente la secuencia original
    historial = rehacerHistorial(historial);
    historial = rehacerHistorial(historial);
    expect(historial.presente).toEqual({ contador: 3 });
    expect(historial.etiquetaPresente).toBe('P3');
  });

  it('saltarAFuturo salta directamente a un paso ya deshecho', () => {
    let historial = crearHistorial<Documento>({ contador: 0 }, 'P0');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 1), 'P1');
    historial = actualizarHistorial(historial, (d) => void (d.contador = 2), 'P2');
    historial = deshacerHistorial(historial);
    historial = deshacerHistorial(historial);
    expect(historial.futuro.map((p) => p.etiqueta)).toEqual(['P1', 'P2']);

    historial = saltarAFuturo(historial, 1); // saltar directo a "P2"
    expect(historial.presente).toEqual({ contador: 2 });
    expect(historial.etiquetaPresente).toBe('P2');
    expect(historial.pasado.map((p) => p.etiqueta)).toEqual(['P0', 'P1']);
    expect(historial.futuro).toEqual([]);
  });

  it('saltarAPasado/saltarAFuturo con índice fuera de rango no hacen nada', () => {
    const historial = crearHistorial<Documento>({ contador: 0 }, 'Inicio');
    expect(saltarAPasado(historial, 0)).toBe(historial);
    expect(saltarAFuturo(historial, 0)).toBe(historial);
  });
});
