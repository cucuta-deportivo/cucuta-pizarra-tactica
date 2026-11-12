import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cargarFuentesBarlow, guardarFuentesParaSinRed } from '../utils/fuentes';

/**
 * IV10: el service worker solo guarda las fuentes que pasan por él. Al abrir
 * la app con red se piden los pesos de Barlow que usa lo exportado, para que
 * sin señal no salga en la letra de respaldo.
 */
const load = vi.fn(async () => []);

describe('las fuentes de la exportación', () => {
  beforeEach(() => {
    load.mockClear();
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pide los cuatro pesos de Barlow Condensed, también el 800', async () => {
    await cargarFuentesBarlow();
    expect(load.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      '500 16px "Barlow Condensed"',
      '600 16px "Barlow Condensed"',
      '700 16px "Barlow Condensed"',
      '800 16px "Barlow Condensed"',
    ]);
  });

  it('al abrir con red los pide, para que queden guardados', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    guardarFuentesParaSinRed();
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('al abrir sin red no los pide: no hay de dónde traerlos', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    guardarFuentesParaSinRed();
    expect(load).not.toHaveBeenCalled();
  });

  it('si una fuente no llega, no rompe nada (la exportación sigue con el respaldo)', async () => {
    load.mockRejectedValueOnce(new Error('sin red'));
    await expect(cargarFuentesBarlow()).resolves.toBeUndefined();
  });
});
