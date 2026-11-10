import { describe, expect, it } from 'vitest';
import {
  ErrorSinConexion,
  ErrorSupabase,
  desdeFila,
  filaParaSubir,
  interpretarError,
  resultadoDeAlta,
  resultadoDeSubida,
  type FilaAlineacion,
} from '../data/supabase/alineacionesApi';
import { PLANTILLA_PRUEBA } from './fixturePlantilla';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import type { Alineacion, FichaJugador } from '../types';

/**
 * S1.5: `alineacionesApi.ts` es el único sitio que conoce las columnas de la
 * tabla `alineaciones`. Aquí se prueba lo que no necesita red: cómo se arma la
 * fila que se sube, cómo se lee la que vuelve y cómo se interpretan las
 * respuestas. Las llamadas reales se prueban contra Supabase en S1.6.
 */
const ficha: FichaJugador = {
  id: 'test-09',
  categoriaId: 'sub20',
  nombre: 'Nombre9',
  apellido: 'Apellido9',
  dorsal: 9,
  posicionNatural: 'DC',
  posicionesSecundarias: [],
  fotoPath: 'sub20/test-09.webp',
};

function alineacion(cambios: Partial<Alineacion> = {}): Alineacion {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nombre: 'Titular del sábado',
    formacionId: '4-3-3',
    titulares: [{ jugadorId: 'test-09', x: 50, y: 84, esCapitan: true }],
    banquillo: [],
    trazos: [],
    notas: '',
    creadaEn: '2026-10-01T10:00:00.000Z',
    modificadaEn: '2026-11-08T18:00:00.000Z',
    objetos: [],
    balones: [],
    cuadricula: cuadriculaVacia(),
    rival: null,
    marcajes: [],
    cancha: canchaVacia(),
    jugadoresPersonalizados: [{ ...PLANTILLA_PRUEBA[0]!, id: 'personalizado-1', categoriaId: '', fotoUrl: 'https://enlace-firmado.example/x' }],
    secuencia: null,
    categoriaId: 'sub20',
    fichas: [ficha],
    ...cambios,
  };
}

function filaDelServidor(alineacionSubida: Alineacion, cambios: Partial<FilaAlineacion> = {}): FilaAlineacion {
  return {
    ...filaParaSubir(alineacionSubida, 'cambio-1'),
    version: 4,
    eliminada_en: null,
    actualizado_en: '2026-11-08T18:00:05.000Z',
    ...cambios,
  };
}

describe('la fila que se sube', () => {
  it('lleva el documento entero y copia nombre, formación y categoría para listar sin descargarlo', () => {
    const fila = filaParaSubir(alineacion(), 'cambio-1');

    expect(fila).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      nombre: 'Titular del sábado',
      formacion: '4-3-3',
      categoria_id: 'sub20',
      ultimo_cambio: 'cambio-1',
    });
    expect(fila.documento.titulares).toEqual(alineacion().titulares);
    expect(fila.documento.fichas).toEqual([ficha]);
  });

  it('nunca sube enlaces firmados de fotos', () => {
    const fila = filaParaSubir(alineacion(), 'cambio-1');

    expect(JSON.stringify(fila)).not.toContain('enlace-firmado');
    expect(fila.documento.jugadoresPersonalizados?.[0]?.fotoUrl).toBeNull();
  });

  it('conserva la fecha de creación de la alineación', () => {
    expect(filaParaSubir(alineacion(), 'cambio-1').creado_en).toBe('2026-10-01T10:00:00.000Z');
  });

  it('una alineación sin categoría sube sin categoría', () => {
    expect(filaParaSubir(alineacion({ categoriaId: undefined }), 'cambio-1').categoria_id).toBeNull();
  });
});

describe('la fila que vuelve del servidor', () => {
  it('es la misma alineación (sin enlaces firmados), con su versión y su último cambio', () => {
    const subida = filaParaSubir(alineacion(), 'cambio-1').documento;

    expect(desdeFila(filaDelServidor(alineacion()))).toEqual({
      alineacion: subida,
      version: 4,
      eliminada: false,
      ultimoCambio: 'cambio-1',
    });
  });

  it('marcada como borrada, vuelve como borrada', () => {
    expect(desdeFila(filaDelServidor(alineacion(), { eliminada_en: '2026-11-08T19:00:00.000Z' })).eliminada).toBe(true);
  });
});

describe('respuestas del servidor', () => {
  it('una edición aceptada devuelve la nueva versión; si no tocó ninguna fila, hay que mirar el estado', () => {
    expect(resultadoDeSubida([{ version: 5 }])).toEqual({ tipo: 'subida', version: 5 });
    expect(resultadoDeSubida([])).toEqual({ tipo: 'sin-cambio' });
  });

  it('un alta con un id que ya existe no es un error: se mira el estado', () => {
    expect(resultadoDeAlta({ data: [{ version: 1 }], error: null, status: 201 })).toEqual({ tipo: 'subida', version: 1 });
    expect(resultadoDeAlta({ data: null, error: { message: 'duplicate key value', code: '23505' }, status: 409 })).toEqual({ tipo: 'ya-existe' });
  });

  it('sin red es "sin conexión", no un error del entrenador', () => {
    const error = interpretarError({ error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 });
    expect(error).toBeInstanceOf(ErrorSinConexion);
  });

  it('los demás errores conservan el código de Supabase', () => {
    const error = interpretarError({ error: { message: 'new row violates row-level security policy', code: '42501' }, status: 403 });
    expect(error).toBeInstanceOf(ErrorSupabase);
    expect(error).toMatchObject({ codigo: '42501', estado: 403 });
  });
});
