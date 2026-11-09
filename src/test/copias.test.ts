import { afterEach, describe, expect, it, vi } from 'vitest';
import { copiaPorConflicto, nombreDeCopia, tipoDeDispositivo } from '../utils/copias';
import { alineacion } from './servidorFalso';

/** S1.7: cuando lo de aquí pasa a copia, el nombre dice de dónde y de cuándo es. */
describe('nombre de la copia por conflicto', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lleva el dispositivo, el día, el mes abreviado y la hora', () => {
    expect(nombreDeCopia('Sub-20 vs Rival', 'tablet', new Date(2026, 10, 6, 18, 40))).toBe('Sub-20 vs Rival (copia tablet 6 nov 18:40)');
    expect(nombreDeCopia('Titular', 'computador', new Date(2026, 0, 3, 9, 5))).toBe('Titular (copia computador 3 ene 09:05)');
  });

  it('una pantalla táctil sin ratón es una tablet; lo demás, un computador', () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: consulta === '(pointer: coarse)' }));
    expect(tipoDeDispositivo()).toBe('tablet');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(tipoDeDispositivo()).toBe('computador');
    vi.stubGlobal('matchMedia', undefined);
    expect(tipoDeDispositivo()).toBe('computador');
  });

  it('la copia es otra alineación con el mismo contenido y la fecha en que se hizo', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const original = { ...alineacion('a', 'Titular'), notas: 'Presión alta' };
    const fecha = new Date(2026, 10, 9, 20, 15);

    const copia = copiaPorConflicto(original, fecha);
    expect(copia.id).not.toBe('a');
    expect(copia).toMatchObject({
      nombre: 'Titular (copia computador 9 nov 20:15)',
      notas: 'Presión alta',
      creadaEn: fecha.toISOString(),
      modificadaEn: fecha.toISOString(),
    });
  });
});
