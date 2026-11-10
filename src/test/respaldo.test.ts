import { describe, expect, it } from 'vitest';
import { leerArchivoDeAlineaciones, nombreDelRespaldo } from '../utils/exportar';
import { alineacion } from './servidorFalso';

/** S1.8: el respaldo de la migración se puede volver a importar con "Importar JSON". */
describe('archivo de respaldo', () => {
  it('se llama con la fecha del día', () => {
    expect(nombreDelRespaldo(new Date(2026, 10, 9, 23, 50))).toBe('respaldo-alineaciones-2026-11-09.json');
  });

  it('"Importar JSON" distingue una alineación de un respaldo con varias', () => {
    expect(leerArchivoDeAlineaciones(JSON.stringify(alineacion('a', 'Una')))).toMatchObject({ tipo: 'una', alineacion: { nombre: 'Una' } });

    const respaldo = { formato: 'respaldo-pizarra-cucuta', version: 1, creadoEn: '2026-11-09T12:00:00Z', alineaciones: [alineacion('a'), alineacion('b')] };
    const leido = leerArchivoDeAlineaciones(JSON.stringify(respaldo));
    expect(leido.tipo).toBe('respaldo');
    expect(leido.tipo === 'respaldo' && leido.alineaciones.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('un respaldo con alguna alineación rota no se importa a medias', () => {
    const roto = { formato: 'respaldo-pizarra-cucuta', version: 1, creadoEn: '2026-11-09T12:00:00Z', alineaciones: [alineacion('a'), { id: 'b' }] };
    expect(() => leerArchivoDeAlineaciones(JSON.stringify(roto))).toThrow('El respaldo tiene alineaciones con un formato que no se reconoce.');
    expect(() => leerArchivoDeAlineaciones('no es json')).toThrow('El archivo no es un JSON válido.');
  });
});
