import { describe, expect, it } from 'vitest';
import { obtenerIniciales } from './jugador';
import { PLANTILLA_PRUEBA } from '../test/fixturePlantilla';

describe('obtenerIniciales: lo que lleva la ficha sin foto, en pantalla y en la exportación', () => {
  it('son la inicial del nombre y la del apellido, en mayúsculas', () => {
    expect(obtenerIniciales({ ...PLANTILLA_PRUEBA[0]!, nombre: 'ángel', apellido: 'peñaranda' })).toBe('ÁP');
  });
});
