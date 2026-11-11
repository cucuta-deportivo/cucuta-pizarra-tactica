import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  anotarError,
  cabecerasCors,
  clasificarErrorAuth,
  codigoDeError,
  esperaElMinimo,
  ipDelCliente,
  leerPeticion,
  respuesta,
  sesionDelToken,
  type Resultado,
} from '../../supabase/functions/login-usuario/logica.ts';
import fuenteIndex from '../../supabase/functions/login-usuario/index.ts?raw';
import fuenteLogica from '../../supabase/functions/login-usuario/logica.ts?raw';

/** Seg1 y Seg2: la parte pura de la Edge Function login-usuario. */

function token(carga: Record<string, unknown>): string {
  const base64url = (valor: unknown) =>
    btoa(JSON.stringify(valor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(carga)}.firma`;
}

describe('leerPeticion', () => {
  it('lee el cuerpo actual, con usuario o correo, y recorta los espacios', () => {
    expect(
      leerPeticion({
        identificador: '  Profe@Club.co ',
        password: ' con espacios ',
        datos: { dispositivo: 'Tablet · iOS · Safari', ip: '190.24.10.5', ciudad: 'Cúcuta', pais: 'Colombia' },
      }),
    ).toEqual({
      identificador: 'Profe@Club.co',
      password: ' con espacios ',
      dispositivo: 'Tablet · iOS · Safari',
      ip: '190.24.10.5',
      ciudad: 'Cúcuta',
      pais: 'Colombia',
    });
  });

  it('acepta el cuerpo de la app anterior ({ usuario, password }) y los datos son opcionales', () => {
    expect(leerPeticion({ usuario: 'profe', password: 'x' })).toEqual({
      identificador: 'profe',
      password: 'x',
      dispositivo: null,
      ip: null,
      ciudad: null,
      pais: null,
    });
  });

  it('rechaza lo que falta, lo que no es texto y lo demasiado largo', () => {
    expect(leerPeticion(null)).toBeNull();
    expect(leerPeticion('texto')).toBeNull();
    expect(leerPeticion({ identificador: 'profe' })).toBeNull();
    expect(leerPeticion({ identificador: '   ', password: 'x' })).toBeNull();
    expect(leerPeticion({ identificador: 7, password: 'x' })).toBeNull();
    expect(leerPeticion({ identificador: 'a'.repeat(255), password: 'x' })).toBeNull();
    expect(leerPeticion({ identificador: 'profe', password: 'x'.repeat(257) })).toBeNull();
  });

  it('ignora los datos que no son texto y recorta los largos', () => {
    const peticion = leerPeticion({ identificador: 'profe', password: 'x', datos: { ip: 5, ciudad: 'c'.repeat(300), pais: '' } });
    expect(peticion).toMatchObject({ ip: null, pais: null });
    expect(peticion?.ciudad).toHaveLength(120);
  });
});

describe('ipDelCliente', () => {
  it('usa la primera IP de x-forwarded-for, que pone el servidor', () => {
    expect(ipDelCliente('190.24.10.5, 10.0.0.1', '1.2.3.4')).toBe('190.24.10.5');
    expect(ipDelCliente('2800:e2:5f00::1', null)).toBe('2800:e2:5f00::1');
  });

  it('solo si no viene, la que manda la app; y nada que no parezca una IP', () => {
    expect(ipDelCliente(null, '1.2.3.4')).toBe('1.2.3.4');
    expect(ipDelCliente('desconocida', '<script>')).toBeNull();
  });
});

describe('sesionDelToken', () => {
  it('saca el session_id del token de Auth', () => {
    expect(sesionDelToken(token({ sub: 'u1', session_id: '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d' }))).toBe(
      '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d',
    );
  });

  it('devuelve null si el token no vale o no trae una sesión', () => {
    expect(sesionDelToken('no-es-un-token')).toBeNull();
    expect(sesionDelToken('a.%%%.c')).toBeNull();
    expect(sesionDelToken(token({ session_id: 'no-es-uuid' }))).toBeNull();
  });
});

describe('clasificarErrorAuth', () => {
  it('contraseña rechazada (400 o 422): fallido', () => {
    expect(clasificarErrorAuth({ status: 400 })).toBe('fallido');
    expect(clasificarErrorAuth({ status: 422 })).toBe('fallido');
  });

  it('Auth no la comprobó (sin red, saturado o caído): descartado', () => {
    for (const status of [0, 429, 500, 503, undefined]) expect(clasificarErrorAuth({ status })).toBe('descartado');
  });
});

describe('respuesta', () => {
  it('cada resultado con su código, y ningún cuerpo lleva el correo ni el usuario', () => {
    const casos: Array<[Resultado, number]> = [
      [{ tipo: 'tokens', access_token: 'a', refresh_token: 'r' }, 200],
      [{ tipo: 'credenciales' }, 401],
      [{ tipo: 'bloqueado' }, 429],
      [{ tipo: 'cuenta-bloqueada' }, 403],
      [{ tipo: 'servicio' }, 503],
      [{ tipo: 'datos' }, 400],
      [{ tipo: 'metodo' }, 405],
      [{ tipo: 'servidor' }, 500],
    ];
    for (const [resultado, estado] of casos) expect(respuesta(resultado).estado).toBe(estado);
    expect(respuesta({ tipo: 'tokens', access_token: 'a', refresh_token: 'r' }).cuerpo).toEqual({
      access_token: 'a',
      refresh_token: 'r',
    });
  });

  it('solo esperan el tiempo mínimo las respuestas que dependen de la cuenta o la contraseña', () => {
    expect(esperaElMinimo({ tipo: 'credenciales' })).toBe(true);
    expect(esperaElMinimo({ tipo: 'bloqueado' })).toBe(true);
    expect(esperaElMinimo({ tipo: 'tokens', access_token: 'a', refresh_token: 'r' })).toBe(true);
    expect(esperaElMinimo({ tipo: 'datos' })).toBe(false);
    expect(esperaElMinimo({ tipo: 'servidor' })).toBe(false);
  });
});

describe('cabecerasCors', () => {
  it('permite producción y localhost, y a nadie más', () => {
    expect(cabecerasCors('https://cucuta-pizarra-tactica-kappa.vercel.app')['Access-Control-Allow-Origin']).toBe(
      'https://cucuta-pizarra-tactica-kappa.vercel.app',
    );
    expect(cabecerasCors('http://localhost:5173')['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(cabecerasCors('https://otro-sitio.com')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(cabecerasCors(null)['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('registros de la función', () => {
  afterEach(() => vi.restoreAllMocks());

  it('codigoDeError toma el código, el estado o el tipo, nunca el mensaje', () => {
    expect(codigoDeError({ code: '42501', message: 'permiso denegado a profe@club.co' })).toBe('42501');
    expect(codigoDeError({ status: 503, message: 'caído' })).toBe('503');
    expect(codigoDeError(new TypeError('fetch failed para profe@club.co'))).toBe('TypeError');
    expect(codigoDeError({ code: 'profe@club.co' })).toBeNull();
    expect(codigoDeError('texto suelto')).toBeNull();
  });

  it('anotarError solo deja la etapa y el código', () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    anotarError('reservar', { code: '42501', message: 'falló con profe@club.co y la clave Secreta-123' });
    anotarError('configuracion');
    expect(consola.mock.calls).toEqual([['login-usuario: falló "reservar" (42501)'], ['login-usuario: falló "configuracion"']]);
  });

  it('en la función no hay otra llamada a console que la de anotarError', () => {
    const llamadaAConsola = /console\s*\.\s*[a-z]+\s*\(/g;
    expect(fuenteIndex.match(llamadaAConsola)).toBeNull();
    expect(fuenteLogica.match(llamadaAConsola)).toEqual(['console.error(']);
  });
});
