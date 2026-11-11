// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

/**
 * Seg1 y Seg2: la Edge Function login-usuario (Deno) probada en Node, con un Supabase
 * falso detrás de fetch. Deno.serve y Deno.env se simulan, y el import
 * 'npm:@supabase/supabase-js@2' va al paquete instalado (alias en vite.config.ts).
 * El tiempo mínimo de respuesta baja a 40 ms para que los tests no tarden.
 */
vi.mock('../../supabase/functions/login-usuario/logica.ts', async (original) => ({
  ...(await original<typeof import('../../supabase/functions/login-usuario/logica.ts')>()),
  TIEMPO_MINIMO_MS: 40,
}));

const ENTORNO: Record<string, string | undefined> = {
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-servicio-falsa',
  SUPABASE_ANON_KEY: 'clave-publica-falsa',
};
const CORREO = 'profe@club.co';
const PASSWORD = 'Clave-Secreta-123';
const SESION = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d';

const RESERVAR = '/rest/v1/rpc/reservar_intento_login';
const CERRAR = '/rest/v1/rpc/cerrar_intento_login';
const TOKEN = '/auth/v1/token';
const SALIR = '/auth/v1/logout';

function token(carga: Record<string, unknown>): string {
  const base64url = (valor: unknown) =>
    btoa(JSON.stringify(valor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(carga)}.firma`;
}
const ACCESO = token({ sub: 'u1', session_id: SESION });

type Manejador = (peticion: Request) => Promise<Response>;
type Atender = (cuerpo: unknown) => { estado: number; cuerpo?: unknown } | 'sin-red';
interface Llamada {
  ruta: string;
  cuerpo: unknown;
  apikey: string | null;
  autorizacion: string | null;
}

let manejar: Manejador | undefined;
let servidor: Record<string, Atender>;
let llamadas: Llamada[];
let consola: MockInstance<typeof console.error>;

function reserva(cambios: Record<string, unknown> = {}): Atender {
  return () => ({
    estado: 200,
    cuerpo: { intento_id: 7, esta_bloqueado: false, correo_cuenta: CORREO, estado_cuenta: 'activo', ...cambios },
  });
}
const authBien: Atender = () => ({
  estado: 200,
  cuerpo: {
    access_token: ACCESO,
    refresh_token: 'renovar-1',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'u1', aud: 'authenticated' },
  },
});
const authMal: Atender = () => ({
  estado: 400,
  cuerpo: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
});

function servidorBase(): Record<string, Atender> {
  return {
    [RESERVAR]: reserva(),
    [CERRAR]: () => ({ estado: 204 }),
    [TOKEN]: authBien,
    [SALIR]: () => ({ estado: 204 }),
  };
}

function pedir(cuerpo: unknown, opciones: { metodo?: string; origen?: string; crudo?: string } = {}): Promise<Response> {
  if (!manejar) throw new Error('index.ts no registró su manejador con Deno.serve');
  const metodo = opciones.metodo ?? 'POST';
  return manejar(
    new Request('https://proyecto.supabase.co/functions/v1/login-usuario', {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        Origin: opciones.origen ?? 'http://localhost:5173',
        'x-forwarded-for': '190.24.10.5, 10.0.0.1',
        'user-agent': 'Mozilla/5.0 (iPad)',
      },
      body: metodo === 'POST' ? (opciones.crudo ?? JSON.stringify(cuerpo)) : undefined,
    }),
  );
}

const rutas = () => llamadas.map((llamada) => llamada.ruta);

beforeAll(async () => {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    serve: (manejador: Manejador) => {
      manejar = manejador;
    },
    env: { get: (nombre: string) => ENTORNO[nombre] },
  };
  const ruta = '../../supabase/functions/login-usuario/index.ts';
  await import(/* @vite-ignore */ ruta);
});

beforeEach(() => {
  servidor = servidorBase();
  llamadas = [];
  consola = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    const cabeceras = new Headers(init?.headers);
    const cuerpo: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    llamadas.push({
      ruta: url.pathname + url.search,
      cuerpo,
      apikey: cabeceras.get('apikey'),
      autorizacion: cabeceras.get('Authorization'),
    });
    const atender = servidor[url.pathname];
    const respuesta = atender ? atender(cuerpo) : { estado: 404, cuerpo: { message: 'no existe' } };
    if (respuesta === 'sin-red') throw new TypeError('fetch failed');
    return new Response(respuesta.cuerpo === undefined ? null : JSON.stringify(respuesta.cuerpo), {
      status: respuesta.estado,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('login-usuario: la función decide el bloqueo y anota los intentos (Seg1 y Seg2)', () => {
  it('con usuario y contraseña correctos: reserva el intento, entra y lo anota como éxito con su sesión', async () => {
    const res = await pedir({
      identificador: ' Profe ',
      password: PASSWORD,
      datos: { dispositivo: 'Tablet · iOS · Safari', ciudad: 'Cúcuta', pais: 'Colombia', ip: '1.2.3.4' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: ACCESO, refresh_token: 'renovar-1' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(rutas()).toEqual([RESERVAR, `${TOKEN}?grant_type=password`, CERRAR]);
    // La reserva va con la clave de servicio y la IP que pone el servidor, no la de la app.
    expect(llamadas[0]).toMatchObject({
      apikey: 'clave-servicio-falsa',
      cuerpo: {
        p_identificador: 'Profe',
        p_ip: '190.24.10.5',
        p_user_agent: 'Mozilla/5.0 (iPad)',
        p_dispositivo: 'Tablet · iOS · Safari',
        p_ciudad: 'Cúcuta',
        p_pais: 'Colombia',
      },
    });
    // La contraseña se prueba con la clave pública y el correo que resolvió el servidor.
    expect(llamadas[1]).toMatchObject({ apikey: 'clave-publica-falsa', cuerpo: { email: CORREO, password: PASSWORD } });
    expect(llamadas[2]?.cuerpo).toEqual({ p_intento_id: 7, p_resultado: 'exito', p_session_id: SESION });
  });

  it('con correo y contraseña incorrecta: 401 y el intento se queda como fallido', async () => {
    servidor[TOKEN] = authMal;

    const res = await pedir({ identificador: CORREO, password: 'mala' });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'credenciales' });
    expect(rutas()).toEqual([RESERVAR, `${TOKEN}?grant_type=password`]);
  });

  it('con la cuenta bloqueada no prueba la contraseña: 429', async () => {
    servidor[RESERVAR] = reserva({ esta_bloqueado: true, correo_cuenta: null, estado_cuenta: null });

    const res = await pedir({ identificador: 'profe', password: PASSWORD });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'bloqueado' });
    expect(rutas()).toEqual([RESERVAR]);
  });

  it('lo que no es de ninguna cuenta responde igual que una contraseña incorrecta, sin llamar a Auth', async () => {
    servidor[RESERVAR] = reserva({ correo_cuenta: null, estado_cuenta: null });
    const sinCuenta = await pedir({ identificador: 'nadie', password: 'x' });
    expect(rutas()).toEqual([RESERVAR]);

    servidor = { ...servidorBase(), [TOKEN]: authMal };
    const claveMala = await pedir({ identificador: 'profe', password: 'x' });

    expect([sinCuenta.status, await sinCuenta.json()]).toEqual([claveMala.status, await claveMala.json()]);
  });

  it('si Auth no contesta (caído o sin red), el intento se descarta y responde 503', async () => {
    const fallos: Atender[] = [() => ({ estado: 503, cuerpo: { message: 'caído' } }), () => 'sin-red'];
    for (const fallo of fallos) {
      llamadas = [];
      servidor[TOKEN] = fallo;

      const res = await pedir({ identificador: 'profe', password: PASSWORD });

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'servicio' });
      expect(llamadas.at(-1)).toMatchObject({
        ruta: CERRAR,
        cuerpo: { p_intento_id: 7, p_resultado: 'descartado', p_session_id: null },
      });
    }
  });

  it('cuenta bloqueada por el cuerpo técnico: 403, cierra la sesión recién creada y no anota éxito', async () => {
    servidor[RESERVAR] = reserva({ estado_cuenta: 'bloqueado' });

    const res = await pedir({ identificador: 'profe', password: PASSWORD });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'cuenta-bloqueada' });
    expect(rutas()).toEqual([RESERVAR, `${TOKEN}?grant_type=password`, `${SALIR}?scope=global`]);
    expect(llamadas[2]?.autorizacion).toBe(`Bearer ${ACCESO}`);
  });

  it('acepta el cuerpo de la app anterior ({ usuario, password }) mientras se actualizan las pizarras', async () => {
    const res = await pedir({ usuario: 'profe', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(llamadas[0]?.cuerpo).toMatchObject({ p_identificador: 'profe', p_dispositivo: null, p_ip: '190.24.10.5' });
  });

  it('datos que no valen: 400 sin tocar Supabase; GET: 405; OPTIONS: CORS solo para orígenes permitidos', async () => {
    expect((await pedir({ identificador: 'profe' })).status).toBe(400);
    expect((await pedir(null, { crudo: '{no es json' })).status).toBe(400);
    expect((await pedir(null, { metodo: 'GET' })).status).toBe(405);

    const permitido = await pedir(null, { metodo: 'OPTIONS' });
    expect(permitido.status).toBe(204);
    expect(permitido.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const ajeno = await pedir(null, { metodo: 'OPTIONS', origen: 'https://otro-sitio.com' });
    expect(ajeno.headers.get('Access-Control-Allow-Origin')).toBeNull();

    expect(llamadas).toEqual([]);
  });

  it('si la reserva falla: 500 sin probar la contraseña, y el registro solo dice la etapa y el código', async () => {
    servidor[RESERVAR] = () => ({ estado: 401, cuerpo: { code: '42501', message: `permission denied para ${CORREO}` } });

    const res = await pedir({ identificador: CORREO, password: PASSWORD });

    expect(res.status).toBe(500);
    expect(rutas()).toEqual([RESERVAR]);
    expect(consola.mock.calls).toEqual([['login-usuario: falló "reservar" (42501)']]);
  });

  it('sin las variables de Supabase: 500 y lo dice el registro', async () => {
    const url = ENTORNO.SUPABASE_URL;
    ENTORNO.SUPABASE_URL = undefined;
    try {
      const res = await pedir({ identificador: 'profe', password: PASSWORD });
      expect(res.status).toBe(500);
      expect(consola.mock.calls).toEqual([['login-usuario: falló "configuracion"']]);
    } finally {
      ENTORNO.SUPABASE_URL = url;
    }
  });

  it('espera el tiempo mínimo en las respuestas que dependen de la cuenta', async () => {
    servidor[RESERVAR] = reserva({ correo_cuenta: null, estado_cuenta: null });
    const inicio = performance.now();

    await pedir({ identificador: 'nadie', password: 'x' });

    expect(performance.now() - inicio).toBeGreaterThanOrEqual(35);
  });

  it('nunca escribe en los registros la contraseña, el correo ni el usuario', async () => {
    const preparaciones: Array<() => void> = [
      () => {
        servidor[TOKEN] = () => 'sin-red';
      },
      () => {
        servidor[TOKEN] = () => ({ estado: 500, cuerpo: { message: `fallo con ${CORREO} y ${PASSWORD}` } });
      },
      () => {
        servidor[RESERVAR] = () => ({ estado: 500, cuerpo: { code: 'XX000', message: `fallo con Profe y ${CORREO}` } });
      },
      () => {
        servidor[RESERVAR] = reserva({ estado_cuenta: 'bloqueado' });
        servidor[SALIR] = () => ({ estado: 500, cuerpo: { message: `no se pudo con ${CORREO}` } });
      },
      () => {
        servidor[CERRAR] = () => ({ estado: 500, cuerpo: { code: 'XX000', message: `fallo con ${PASSWORD}` } });
      },
    ];
    for (const preparar of preparaciones) {
      servidor = servidorBase();
      preparar();
      await pedir({ identificador: 'Profe', password: PASSWORD });
    }

    const escrito = consola.mock.calls.flat().join('\n');
    expect(consola.mock.calls.length).toBeGreaterThanOrEqual(preparaciones.length);
    for (const dato of [PASSWORD, CORREO, 'Profe']) expect(escrito).not.toContain(dato);
  });
});
