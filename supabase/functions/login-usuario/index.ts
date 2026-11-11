// Inicio de sesión con usuario O correo, decidido en el servidor (Seg1 y Seg2).
//
// Supabase Auth solo acepta correo, así que con usuario alguien tiene que traducir
// usuario → correo. Si lo hace el navegador, el correo de cualquier entrenador
// queda a la vista de quien adivine su usuario. Aquí la traducción y el inicio
// de sesión ocurren dentro de Supabase y al navegador solo vuelven los tokens
// de la sesión: ni el correo ni los datos del usuario.
//
// Aquí también se decide el bloqueo por intentos fallidos y se anota cada intento.
// Antes lo hacía la app, y cualquiera podía anotar intentos falsos a nombre de otro.
// Cada intento: reservar_intento_login (dice si hay bloqueo y lo anota como fallido)
// → Auth comprueba la contraseña → cerrar_intento_login (éxito, o descartado si Auth
// no contestó). Ver supabase/schema.sql.
//
// Nunca escribe en los registros la contraseña, el correo ni el usuario: solo
// anotarError(etapa, error), que deja la etapa y el código del error (logica.ts).
//
// Se despliega con --no-verify-jwt: es un punto de entrada público (quien llama
// todavía no tiene sesión) y la clave publicable del cliente no es un JWT.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  anotarError,
  cabecerasCors,
  clasificarErrorAuth,
  esperaElMinimo,
  ipDelCliente,
  leerPeticion,
  respuesta,
  sesionDelToken,
  TIEMPO_MINIMO_MS,
  type Peticion,
  type Resultado,
} from './logica.ts';

const SIN_SESION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Lo que devuelve reservar_intento_login (supabase/schema.sql). */
interface Reserva {
  intento_id: number;
  esta_bloqueado: boolean;
  correo_cuenta: string | null;
  estado_cuenta: string | null;
}

function responder(resultado: Resultado, cors: Record<string, string>): Response {
  const { estado, cuerpo } = respuesta(resultado);
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function esperarHasta(instante: number): Promise<void> {
  const resto = instante - Date.now();
  return resto > 0 ? new Promise((r) => setTimeout(r, resto)) : Promise.resolve();
}

async function iniciarSesion(datos: Peticion, cabeceras: Headers): Promise<Resultado> {
  const url = Deno.env.get('SUPABASE_URL');
  const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clavePublica = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !claveServicio || !clavePublica) {
    anotarError('configuracion');
    return { tipo: 'servidor' };
  }

  // La clave de servicio la pone Supabase en el servidor; nunca sale de aquí.
  const admin = createClient(url, claveServicio, { auth: SIN_SESION });
  const { data: reserva, error: errorReserva } = await admin
    .rpc('reservar_intento_login', {
      p_identificador: datos.identificador,
      p_ip: ipDelCliente(cabeceras.get('x-forwarded-for'), datos.ip),
      p_user_agent: cabeceras.get('user-agent'),
      p_dispositivo: datos.dispositivo,
      p_ciudad: datos.ciudad,
      p_pais: datos.pais,
    })
    .single<Reserva>();
  if (errorReserva || !reserva) {
    anotarError('reservar', errorReserva);
    return { tipo: 'servidor' };
  }
  if (reserva.esta_bloqueado) return { tipo: 'bloqueado' };
  // Sin cuenta: queda como fallido y responde exactamente igual que una contraseña incorrecta.
  if (!reserva.correo_cuenta) return { tipo: 'credenciales' };

  const intentoId = reserva.intento_id;
  async function cerrar(resultado: 'exito' | 'descartado', sesion: string | null = null): Promise<void> {
    const { error } = await admin.rpc('cerrar_intento_login', {
      p_intento_id: intentoId,
      p_resultado: resultado,
      p_session_id: sesion,
    });
    if (error) anotarError('cerrar', error);
  }

  const publico = createClient(url, clavePublica, { auth: SIN_SESION });
  const { data, error } = await publico.auth.signInWithPassword({
    email: reserva.correo_cuenta,
    password: datos.password,
  });
  if (error || !data.session) {
    if (error && clasificarErrorAuth(error) === 'descartado') {
      // Auth no llegó a comprobar la contraseña: no fue un intento real y no cuenta.
      anotarError('auth', error);
      await cerrar('descartado');
      return { tipo: 'servicio' };
    }
    return { tipo: 'credenciales' }; // queda como fallido
  }

  const { access_token, refresh_token } = data.session;
  if (reserva.estado_cuenta === 'bloqueado') {
    // Cuenta bloqueada por el cuerpo técnico: se cierra la sesión recién creada y el
    // intento queda como fallido, como hacía la app.
    const { error: errorSalida } = await admin.auth.admin.signOut(access_token, 'global');
    if (errorSalida) anotarError('cerrar-sesion', errorSalida);
    return { tipo: 'cuenta-bloqueada' };
  }

  await cerrar('exito', sesionDelToken(access_token));
  return { tipo: 'tokens', access_token, refresh_token };
}

Deno.serve(async (peticion) => {
  const cors = cabecerasCors(peticion.headers.get('Origin'));
  if (peticion.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (peticion.method !== 'POST') return responder({ tipo: 'metodo' }, cors);

  const inicio = Date.now();
  try {
    let cuerpo: unknown;
    try {
      cuerpo = await peticion.json();
    } catch {
      return responder({ tipo: 'datos' }, cors);
    }
    const datos = leerPeticion(cuerpo);
    if (!datos) return responder({ tipo: 'datos' }, cors);

    const resultado = await iniciarSesion(datos, peticion.headers);
    if (esperaElMinimo(resultado)) await esperarHasta(inicio + TIEMPO_MINIMO_MS);
    return responder(resultado, cors);
  } catch (error) {
    // Sin capturar, Supabase guardaría el mensaje y la pila, que podrían llevar datos de la petición.
    anotarError('inesperado', error);
    return responder({ tipo: 'servidor' }, cors);
  }
});
