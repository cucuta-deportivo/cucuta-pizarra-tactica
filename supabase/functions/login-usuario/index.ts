// Inicio de sesión con NOMBRE DE USUARIO, resuelto en el servidor.
//
// Supabase Auth solo acepta correo, así que alguien tiene que traducir
// usuario → correo. Si lo hace el navegador, el correo de cualquier entrenador
// queda a la vista de quien adivine su usuario. Aquí la traducción y el inicio
// de sesión ocurren dentro de Supabase y al navegador solo vuelven los tokens
// de la sesión: ni el correo ni los datos del usuario.
//
// Se despliega con --no-verify-jwt: es un punto de entrada público (quien llama
// todavía no tiene sesión) y la clave publicable del cliente no es un JWT.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGENES_PERMITIDOS = ['https://cucuta-pizarra-tactica-kappa.vercel.app'];
const ORIGEN_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Toda respuesta de credenciales tarda al menos esto. Sin ello, un usuario que
 * no existe respondería antes que uno con la contraseña mal (que sí llega a
 * Auth), y el tiempo delataría qué usuarios existen.
 */
const TIEMPO_MINIMO_MS = 800;

const SIN_SESION = { persistSession: false, autoRefreshToken: false };

function cabecerasCors(origen: string | null): Record<string, string> {
  const permitido = origen !== null && (ORIGENES_PERMITIDOS.includes(origen) || ORIGEN_LOCAL.test(origen));
  return {
    ...(permitido ? { 'Access-Control-Allow-Origin': origen } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

function responder(cuerpo: unknown, estado: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function esperarHasta(instante: number): Promise<void> {
  const resto = instante - Date.now();
  return resto > 0 ? new Promise((r) => setTimeout(r, resto)) : Promise.resolve();
}

Deno.serve(async (peticion) => {
  const cors = cabecerasCors(peticion.headers.get('Origin'));
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (peticion.method !== 'POST') return responder({ error: 'metodo' }, 405, cors);

  const inicio = Date.now();
  let datos: { usuario?: unknown; password?: unknown };
  try {
    datos = await peticion.json();
  } catch {
    return responder({ error: 'datos' }, 400, cors);
  }
  const usuario = typeof datos.usuario === 'string' ? datos.usuario.trim() : '';
  const password = typeof datos.password === 'string' ? datos.password : '';
  // Con '@' el cliente entra por correo directamente; aquí solo llegan usuarios.
  if (!usuario || !password || usuario.includes('@') || usuario.length > 64 || password.length > 256) {
    return responder({ error: 'datos' }, 400, cors);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clavePublica = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !claveServicio || !clavePublica) {
    console.error('login-usuario: faltan variables de entorno de Supabase');
    return responder({ error: 'servidor' }, 500, cors);
  }

  // La clave de servicio la pone Supabase en el servidor; nunca sale de aquí.
  const admin = createClient(url, claveServicio, { auth: SIN_SESION });
  const { data: correo, error: errorCorreo } = await admin.rpc('resolver_correo_por_usuario', { p_usuario: usuario });
  if (errorCorreo) {
    console.error('login-usuario: no se pudo resolver el usuario', errorCorreo.message);
    return responder({ error: 'servidor' }, 500, cors);
  }

  let tokens: { access_token: string; refresh_token: string } | null = null;
  if (typeof correo === 'string' && correo) {
    const publico = createClient(url, clavePublica, { auth: SIN_SESION });
    const { data, error } = await publico.auth.signInWithPassword({ email: correo, password });
    if (!error && data.session) {
      tokens = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
    }
  }

  await esperarHasta(inicio + TIEMPO_MINIMO_MS);
  // Usuario inexistente y contraseña incorrecta responden exactamente igual.
  return tokens ? responder(tokens, 200, cors) : responder({ error: 'credenciales' }, 401, cors);
});
