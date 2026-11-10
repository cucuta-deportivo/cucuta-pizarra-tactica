import { create } from 'zustand';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { borrarPlantillaGuardada } from '../data/plantillaLocal';
import { establecerRecordarDispositivo, supabase, supabaseConfigurado } from '../lib/supabaseClient';
import type { EstadoCuenta, Perfil, RolUsuario } from '../types/auth';
import { describirDispositivo } from '../utils/deviceInfo';
import { obtenerDatosIp } from '../utils/ipLookup';

const CLAVE_ULTIMA_ACTIVIDAD = 'pizarra:ultima-actividad';
const LIMITE_INACTIVIDAD_MS = 12 * 60 * 60 * 1000; // 12 h

const MENSAJE_GENERICO = 'Usuario o contraseña incorrectos.';
const MENSAJE_SIN_CONEXION =
  'Sin conexión. Para entrar hace falta señal; si ya habías entrado en este dispositivo con "Recordar", la pizarra se abre sola.';

/** Copia del perfil en el dispositivo, para entrar sin red (S1.13). */
const CLAVE_PERFIL_GUARDADO = 'pizarra:perfil-guardado';
/** Con "red" pero sin respuesta (wifi del estadio sin internet), no se espera más que esto. */
const ESPERA_SIN_RESPUESTA_MS = 8000;
/** La sesión que guarda supabase-js: `sb-<proyecto>-auth-token`. */
const CLAVE_SESION = /^sb-.+-auth-token$/;

export interface DatosRegistro {
  correo: string;
  password: string;
  usuario: string;
  nombreCompleto: string;
  rol: RolUsuario;
  codigoInvitacion: string;
}

export interface ResultadoAuth {
  ok: boolean;
  mensaje?: string;
}

interface AuthState {
  cargando: boolean;
  session: Session | null;
  perfil: Perfil | null;
  enviando: boolean;
  inicializado: boolean;
  enRecuperacion: boolean;
  /** Se entró sin red con la sesión y el perfil guardados en el dispositivo; se valida al volver la señal (S1.13). */
  sinConexion: boolean;
  /** Sin red, con sesión guardada pero sin el perfil en el dispositivo: todavía no se puede entrar. */
  sinDatosSinConexion: boolean;

  inicializar: () => void;
  iniciarSesion: (usuarioOCorreo: string, password: string, recordar: boolean) => Promise<ResultadoAuth>;
  registrar: (datos: DatosRegistro) => Promise<ResultadoAuth>;
  cerrarSesion: () => Promise<void>;
  cerrarOtrasSesiones: () => Promise<void>;
  refrescarPerfil: () => Promise<void>;
  finalizarRecuperacion: () => void;
}

function marcarActividad(): void {
  try {
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now()));
  } catch {
    // sin almacenamiento disponible: el control de inactividad simplemente no aplicará en esta sesión.
  }
}

function inactividadExcedida(): boolean {
  try {
    const ultima = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD) ?? '0');
    return ultima > 0 && Date.now() - ultima > LIMITE_INACTIVIDAD_MS;
  } catch {
    return false;
  }
}

/** Según el navegador. Sin red de verdad no se espera nada del servidor. */
function hayRed(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promesa, new Promise<null>((resolver) => setTimeout(() => resolver(null), ms))]);
}

/** La sesión que supabase-js dejó guardada en el dispositivo, leída sin pedir nada al servidor (S1.13). */
function leerSesionGuardada(): Session | null {
  try {
    for (const almacen of [localStorage, sessionStorage]) {
      const clave = Object.keys(almacen).find((k) => CLAVE_SESION.test(k));
      const texto = clave ? almacen.getItem(clave) : null;
      if (!texto) continue;
      const sesion = JSON.parse(texto) as Session | null;
      if (sesion?.user?.id && sesion.refresh_token) return sesion;
    }
  } catch {
    // nada guardado o ilegible: como si no hubiera sesión.
  }
  return null;
}

/** Sin red, `signOut` no puede avisar al servidor y deja la sesión guardada: se quita aquí. */
function quitarSesionGuardada(): void {
  try {
    for (const almacen of [localStorage, sessionStorage]) {
      for (const clave of Object.keys(almacen)) if (CLAVE_SESION.test(clave)) almacen.removeItem(clave);
    }
  } catch {
    // sin almacenamiento: no hay nada que quitar.
  }
}

function guardarPerfil(perfil: Perfil): void {
  try {
    localStorage.setItem(CLAVE_PERFIL_GUARDADO, JSON.stringify({ userId: perfil.id, perfil, guardadoEn: new Date().toISOString() }));
  } catch {
    // sin almacenamiento: sin red no se podrá entrar, como antes.
  }
}

function leerPerfilGuardado(userId: string): Perfil | null {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_PERFIL_GUARDADO) ?? 'null') as { userId?: string; perfil?: Perfil } | null;
    return guardado?.userId === userId && guardado.perfil ? guardado.perfil : null;
  } catch {
    return null;
  }
}

/** Al cerrar sesión: fuera las copias de la cuenta (perfil y plantilla). Las alineaciones se quedan. */
function borrarCopiasDeLaCuenta(): void {
  try {
    localStorage.removeItem(CLAVE_PERFIL_GUARDADO);
  } catch {
    // sin almacenamiento: no había copia.
  }
  borrarPlantillaGuardada();
}

type LecturaPerfil = { tipo: 'perfil'; perfil: Perfil | null } | { tipo: 'sin-conexion' };

/** El perfil desde Supabase; si llega, se guarda una copia en el dispositivo. Un fallo de red llega con estado 0. */
async function leerPerfil(userId: string): Promise<LecturaPerfil> {
  const { data, error, status } = await supabase.from('perfiles').select('*').eq('id', userId).maybeSingle();
  if (error && status === 0) return { tipo: 'sin-conexion' };
  const perfil = (data as Perfil | null) ?? null;
  if (perfil) guardarPerfil(perfil);
  return { tipo: 'perfil', perfil };
}

async function obtenerPerfil(userId: string): Promise<Perfil | null> {
  const lectura = await leerPerfil(userId);
  return lectura.tipo === 'perfil' ? lectura.perfil : null;
}

async function registrarIntento(
  usuarioIntentado: string,
  resultado: 'exito' | 'fallido' | 'bloqueado',
  sessionId?: string,
): Promise<void> {
  const datosIp = await obtenerDatosIp();
  await supabase.rpc('registrar_intento_login', {
    p_usuario_intentado: usuarioIntentado,
    p_resultado: resultado,
    p_metodo: 'password',
    p_dispositivo: describirDispositivo(navigator.userAgent),
    p_user_agent: navigator.userAgent,
    p_ip: datosIp.ip,
    p_ciudad: datosIp.ciudad,
    p_pais: datosIp.pais,
    p_session_id: sessionId ?? null,
  });
}

export const useAuthStore = create<AuthState>((set, get) => {
  function usarPerfil(perfil: Perfil | null): void {
    // Mientras se cierra la sesión por inactividad, una segunda lectura del perfil no la vuelve a mostrar.
    if (cerrandoPorInactividad) return;
    set({ perfil, sinConexion: false, sinDatosSinConexion: false });
  }

  /** Sin respuesta del servidor, el perfil guardado en el dispositivo. Si el de verdad llega tarde, se usa ese. */
  /**
   * 12 h sin uso al abrir (S1.13): la sesión se cierra, pero solo cuando el servidor contesta. Con un
   * wifi sin internet el navegador dice que hay red, y supabase-js quita la sesión del dispositivo
   * aunque el servidor no conteste: sin conexión no se podría volver a entrar.
   */
  let inactividadPorRevisar = false;
  let cerrandoPorInactividad = false;

  async function cerrarPorInactividad(): Promise<void> {
    cerrandoPorInactividad = true;
    await supabase.auth.signOut();
    set({ session: null, perfil: null, sinConexion: false, sinDatosSinConexion: false });
    cerrandoPorInactividad = false;
  }

  async function cargarPerfil(userId: string): Promise<void> {
    const lectura = leerPerfil(userId);
    const pronto = await conLimite(lectura, ESPERA_SIN_RESPUESTA_MS);
    if (pronto?.tipo === 'perfil') {
      if (inactividadPorRevisar) {
        inactividadPorRevisar = false;
        await cerrarPorInactividad();
        return;
      }
      usarPerfil(pronto.perfil);
      return;
    }
    // Se abrió sin conexión: la regla de 12 h no se aplica en esta apertura.
    inactividadPorRevisar = false;
    const guardado = leerPerfilGuardado(userId);
    set({ perfil: guardado, sinConexion: true, sinDatosSinConexion: !guardado });
    if (pronto === null) {
      void lectura.then((tarde) => {
        if (tarde.tipo === 'perfil') usarPerfil(tarde.perfil);
      });
    }
  }

  /** Entra con lo guardado en el dispositivo, sin preguntar al servidor. `false` si no hay sesión guardada. */
  function entrarSinConexion(): boolean {
    inactividadPorRevisar = false;
    const sesion = leerSesionGuardada();
    if (!sesion) return false;
    const perfil = leerPerfilGuardado(sesion.user.id);
    set({ session: sesion, perfil, sinConexion: true, sinDatosSinConexion: !perfil, cargando: false });
    return true;
  }

  /** Al volver la señal: supabase-js renueva el token y se vuelve a leer el perfil (activa o bloqueada). */
  async function revalidar(): Promise<void> {
    if (!get().sinConexion && !get().sinDatosSinConexion) return;
    const { data, error } = await supabase.auth.getSession();
    if (error && isAuthRetryableFetchError(error)) return;
    if (!data.session) {
      // La sesión ya no vale (contraseña cambiada, otras sesiones cerradas): a la pantalla de acceso.
      borrarCopiasDeLaCuenta();
      set({ session: null, perfil: null, sinConexion: false, sinDatosSinConexion: false });
      return;
    }
    set({ session: data.session });
    await cargarPerfil(data.session.user.id);
  }

  return {
    cargando: true,
    session: null,
    perfil: null,
    enviando: false,
    inicializado: false,
    enRecuperacion: false,
    sinConexion: false,
    sinDatosSinConexion: false,

    inicializar: () => {
      if (get().inicializado || !supabaseConfigurado) {
        set({ cargando: false });
        return;
      }
      set({ inicializado: true });

      const conRed = hayRed();
      // La regla de 12 h solo con conexión (S1.13): se comprueba cuando el servidor contesta (cargarPerfil).
      inactividadPorRevisar = inactividadExcedida();
      marcarActividad();
      for (const evento of ['pointerdown', 'keydown']) {
        window.addEventListener(evento, marcarActividad, { passive: true });
      }

      supabase.auth.onAuthStateChange((evento, session) => {
        if (evento === 'SIGNED_OUT') borrarCopiasDeLaCuenta();
        // Sin conexión, supabase-js no puede renovar el token y avisa "sin sesión": no es que se haya cerrado.
        if (!session && evento !== 'SIGNED_OUT' && get().sinConexion) return;
        set({
          session,
          cargando: false,
          enRecuperacion: evento === 'PASSWORD_RECOVERY' ? true : get().enRecuperacion,
          ...(evento === 'SIGNED_OUT' ? { sinConexion: false, sinDatosSinConexion: false } : {}),
        });
        if (session) void cargarPerfil(session.user.id);
        else set({ perfil: null });
      });

      window.addEventListener('online', () => void revalidar());

      // Sin red se entra con lo guardado, sin esperar a que supabase-js intente renovar el token (tarda hasta 30 s).
      if (!conRed) {
        if (!entrarSinConexion()) set({ session: null, cargando: false });
        return;
      }

      void conLimite(supabase.auth.getSession(), ESPERA_SIN_RESPUESTA_MS).then((resultado) => {
        const sinRespuesta = resultado === null || (resultado.error !== null && isAuthRetryableFetchError(resultado.error));
        if (sinRespuesta && entrarSinConexion()) return;
        const session = resultado?.data.session ?? null;
        set({ session, cargando: false });
        if (session) void cargarPerfil(session.user.id);
      });
    },

    iniciarSesion: async (usuarioOCorreo, password, recordar) => {
      // Sin red no se puede comprobar la contraseña: se dice eso, no "contraseña incorrecta" (S1.13).
      if (!hayRed()) return { ok: false, mensaje: MENSAJE_SIN_CONEXION };
      set({ enviando: true });
      try {
        const { data: bloqueo } = await supabase
          .rpc('verificar_bloqueo_usuario', { p_usuario: usuarioOCorreo })
          .maybeSingle<{ bloqueado: boolean; intentos_recientes: number }>();
        if (bloqueo?.bloqueado) {
          await registrarIntento(usuarioOCorreo, 'bloqueado');
          return { ok: false, mensaje: 'Demasiados intentos fallidos. Vuelve a intentarlo en 15 minutos.' };
        }

        // Antes de crear la sesión: decide en qué almacenamiento se guarda.
        establecerRecordarDispositivo(recordar);
        let respuesta;
        if (usuarioOCorreo.includes('@')) {
          respuesta = await supabase.auth.signInWithPassword({ email: usuarioOCorreo, password });
        } else {
          // Con usuario, el correo se resuelve y la sesión se abre en el servidor
          // (Edge Function `login-usuario`): el navegador nunca ve el correo.
          const { data: tokens } = await supabase.functions.invoke<{ access_token: string; refresh_token: string }>(
            'login-usuario',
            { body: { usuario: usuarioOCorreo, password } },
          );
          if (!tokens) {
            await registrarIntento(usuarioOCorreo, 'fallido');
            return { ok: false, mensaje: MENSAJE_GENERICO };
          }
          respuesta = await supabase.auth.setSession(tokens);
        }
        const { data: inicio, error } = respuesta;
        if (error && isAuthRetryableFetchError(error)) return { ok: false, mensaje: MENSAJE_SIN_CONEXION };
        if (error || !inicio.session) {
          await registrarIntento(usuarioOCorreo, 'fallido');
          return { ok: false, mensaje: MENSAJE_GENERICO };
        }

        const perfil = await obtenerPerfil(inicio.session.user.id);
        if (perfil?.estado === 'bloqueado') {
          await registrarIntento(usuarioOCorreo, 'fallido');
          await supabase.auth.signOut();
          return { ok: false, mensaje: 'Esta cuenta está bloqueada. Contacta a un entrenador del cuerpo técnico.' };
        }

        set({ session: inicio.session, perfil });
        marcarActividad();
        await registrarIntento(usuarioOCorreo, 'exito');
        return { ok: true };
      } finally {
        set({ enviando: false });
      }
    },

    registrar: async (datos) => {
      set({ enviando: true });
      try {
        const { data, error } = await supabase.auth.signUp({
          email: datos.correo,
          password: datos.password,
          options: {
            data: {
              usuario: datos.usuario,
              nombre_completo: datos.nombreCompleto,
              rol: datos.rol,
              codigo_invitacion: datos.codigoInvitacion || undefined,
            },
          },
        });

        if (error) {
          const texto = error.message.toLowerCase();
          if (texto.includes('already registered') || texto.includes('already exists')) {
            return { ok: false, mensaje: 'Ese correo ya tiene una cuenta.' };
          }
          if (texto.includes('usuario') || texto.includes('duplicate')) {
            return { ok: false, mensaje: 'Ese nombre de usuario ya está en uso.' };
          }
          return { ok: false, mensaje: 'No se pudo completar el registro. Inténtalo de nuevo.' };
        }

        if (data.session) {
          const perfil = await obtenerPerfil(data.session.user.id);
          set({ session: data.session, perfil });
        }
        return { ok: true };
      } finally {
        set({ enviando: false });
      }
    },

    // A propósito: fuera las copias de la cuenta (perfil y plantilla); las alineaciones se quedan (S1.13).
    cerrarSesion: async () => {
      borrarCopiasDeLaCuenta();
      const { error } = hayRed() ? await supabase.auth.signOut() : { error: new Error('Sin conexión') };
      // Sin red (o si el servidor falla), supabase-js deja la sesión guardada: se quita del dispositivo igual.
      if (error) quitarSesionGuardada();
      set({ session: null, perfil: null, sinConexion: false, sinDatosSinConexion: false });
    },

    cerrarOtrasSesiones: async () => {
      await supabase.auth.signOut({ scope: 'others' });
    },

    refrescarPerfil: async () => {
      const session = get().session;
      if (!session) return;
      const perfil = await obtenerPerfil(session.user.id);
      set({ perfil });
    },

    finalizarRecuperacion: () => set({ enRecuperacion: false }),
  };
});

export type { EstadoCuenta };
