// Lógica pura de login-usuario: sin nada de Deno ni de Supabase, para probarla con
// Vitest (src/test/loginUsuarioLogica.test.ts). index.ts la usa para hablar con Supabase.

/**
 * Toda respuesta que depende de la cuenta o de la contraseña tarda al menos esto.
 * Sin ello, lo escrito que no es de ninguna cuenta respondería antes que una
 * contraseña incorrecta (que sí llega a Auth), y el tiempo delataría qué cuentas existen.
 */
export const TIEMPO_MINIMO_MS = 800;

const ORIGENES_PERMITIDOS = ['https://cucuta-pizarra-tactica-kappa.vercel.app'];
const ORIGEN_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function cabecerasCors(origen: string | null): Record<string, string> {
  const permitido = origen !== null && (ORIGENES_PERMITIDOS.includes(origen) || ORIGEN_LOCAL.test(origen));
  return {
    ...(permitido ? { 'Access-Control-Allow-Origin': origen } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

/**
 * Lo que pide la app. Cuerpo actual: { identificador, password, datos }, con usuario o
 * correo. El de la app anterior, { usuario, password }, sigue valiendo mientras haya
 * pizarras sin actualizar.
 */
export interface Peticion {
  identificador: string;
  password: string;
  /** Lo manda la app (ipapi.co y el user-agent): solo describe este intento. */
  dispositivo: string | null;
  ip: string | null;
  ciudad: string | null;
  pais: string | null;
}

const MAX_IDENTIFICADOR = 254;
const MAX_PASSWORD = 256;

function textoOpcional(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

/** El cuerpo de la petición, validado; null si no vale. */
export function leerPeticion(cuerpo: unknown): Peticion | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const campos = cuerpo as Record<string, unknown>;
  const crudo = typeof campos.identificador === 'string' ? campos.identificador : campos.usuario;
  const identificador = typeof crudo === 'string' ? crudo.trim() : '';
  const password = typeof campos.password === 'string' ? campos.password : '';
  if (!identificador || !password || identificador.length > MAX_IDENTIFICADOR || password.length > MAX_PASSWORD) {
    return null;
  }
  const datos = typeof campos.datos === 'object' && campos.datos !== null ? (campos.datos as Record<string, unknown>) : {};
  return {
    identificador,
    password,
    dispositivo: textoOpcional(datos.dispositivo, 120),
    ip: textoOpcional(datos.ip, 64),
    ciudad: textoOpcional(datos.ciudad, 120),
    pais: textoOpcional(datos.pais, 120),
  };
}

const PARECE_IP = /^[0-9a-fA-F:.]{2,45}$/;

/** La IP la pone el servidor (la primera de x-forwarded-for); la que manda la app, solo si no viene. */
export function ipDelCliente(reenviadaPor: string | null, ipDeLaApp: string | null): string | null {
  const primera = reenviadaPor?.split(',')[0]?.trim() ?? '';
  if (PARECE_IP.test(primera)) return primera;
  return ipDeLaApp !== null && PARECE_IP.test(ipDeLaApp) ? ipDeLaApp : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El session_id del token que acaba de dar Auth: Actividad lo usa para marcar la sesión actual. */
export function sesionDelToken(token: string): string | null {
  try {
    const carga = token.split('.')[1];
    if (!carga) return null;
    const datos = JSON.parse(atob(carga.replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: unknown };
    return typeof datos.session_id === 'string' && UUID.test(datos.session_id) ? datos.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Si Auth rechazó la contraseña (400 o 422), cuenta como fallido. Si no llegó a
 * comprobarla (sin red, saturado o caído), el intento se descarta y no cuenta.
 */
export function clasificarErrorAuth(error: { status?: unknown }): 'fallido' | 'descartado' {
  return error.status === 400 || error.status === 422 ? 'fallido' : 'descartado';
}

export type Resultado =
  | { tipo: 'tokens'; access_token: string; refresh_token: string }
  | { tipo: 'credenciales' }
  | { tipo: 'bloqueado' }
  | { tipo: 'cuenta-bloqueada' }
  | { tipo: 'servicio' }
  | { tipo: 'datos' }
  | { tipo: 'metodo' }
  | { tipo: 'servidor' };

/** Código HTTP y cuerpo de cada resultado. Ninguno lleva el correo ni el usuario. */
export function respuesta(resultado: Resultado): { estado: number; cuerpo: Record<string, string> } {
  switch (resultado.tipo) {
    case 'tokens':
      return { estado: 200, cuerpo: { access_token: resultado.access_token, refresh_token: resultado.refresh_token } };
    case 'credenciales':
      return { estado: 401, cuerpo: { error: 'credenciales' } };
    case 'bloqueado':
      return { estado: 429, cuerpo: { error: 'bloqueado' } };
    case 'cuenta-bloqueada':
      return { estado: 403, cuerpo: { error: 'cuenta-bloqueada' } };
    case 'servicio':
      return { estado: 503, cuerpo: { error: 'servicio' } };
    case 'datos':
      return { estado: 400, cuerpo: { error: 'datos' } };
    case 'metodo':
      return { estado: 405, cuerpo: { error: 'metodo' } };
    case 'servidor':
      return { estado: 500, cuerpo: { error: 'servidor' } };
  }
}

/** Las respuestas que dependen de la cuenta o de la contraseña esperan TIEMPO_MINIMO_MS. */
export function esperaElMinimo(resultado: Resultado): boolean {
  return resultado.tipo !== 'datos' && resultado.tipo !== 'metodo' && resultado.tipo !== 'servidor';
}

export type Etapa = 'configuracion' | 'reservar' | 'auth' | 'cerrar' | 'cerrar-sesion' | 'inesperado';

const CODIGO_SEGURO = /^[A-Za-z0-9_]{1,40}$/;

/** Solo el código del error (SQLSTATE, código de Auth, estado HTTP o tipo), nunca su mensaje. */
export function codigoDeError(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, status, name } = error as { code?: unknown; status?: unknown; name?: unknown };
  if (typeof code === 'string' && CODIGO_SEGURO.test(code)) return code;
  if (typeof status === 'number' && Number.isInteger(status)) return String(status);
  if (typeof name === 'string' && CODIGO_SEGURO.test(name)) return name;
  return null;
}

/**
 * Lo ÚNICO que la función escribe en sus registros: la etapa que falló y el código del
 * error. Nunca el mensaje ni la pila: el de la base de datos puede citar el valor que lo
 * provocó, y por aquí pasan correos, usuarios y contraseñas. Un test comprueba que no hay
 * otro console.* en la función.
 */
export function anotarError(etapa: Etapa, error?: unknown): void {
  const codigo = codigoDeError(error);
  console.error(`login-usuario: falló "${etapa}"${codigo ? ` (${codigo})` : ''}`);
}
