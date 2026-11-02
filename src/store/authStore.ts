import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { establecerRecordarDispositivo, supabase, supabaseConfigurado } from '../lib/supabaseClient';
import type { EstadoCuenta, Perfil, RolUsuario } from '../types/auth';
import { describirDispositivo } from '../utils/deviceInfo';
import { obtenerDatosIp } from '../utils/ipLookup';

const CLAVE_ULTIMA_ACTIVIDAD = 'pizarra:ultima-actividad';
const LIMITE_INACTIVIDAD_MS = 12 * 60 * 60 * 1000; // 12 h

const MENSAJE_GENERICO = 'Usuario o contraseña incorrectos.';

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

async function obtenerPerfil(userId: string): Promise<Perfil | null> {
  const { data } = await supabase.from('perfiles').select('*').eq('id', userId).maybeSingle();
  return (data as Perfil | null) ?? null;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  cargando: true,
  session: null,
  perfil: null,
  enviando: false,
  inicializado: false,
  enRecuperacion: false,

  inicializar: () => {
    if (get().inicializado || !supabaseConfigurado) {
      set({ cargando: false });
      return;
    }
    set({ inicializado: true });

    if (inactividadExcedida()) {
      void supabase.auth.signOut();
    }
    marcarActividad();
    for (const evento of ['pointerdown', 'keydown']) {
      window.addEventListener(evento, marcarActividad, { passive: true });
    }

    supabase.auth.onAuthStateChange((evento, session) => {
      set({ session, cargando: false, enRecuperacion: evento === 'PASSWORD_RECOVERY' ? true : get().enRecuperacion });
      if (session) {
        void obtenerPerfil(session.user.id).then((perfil) => set({ perfil }));
      } else {
        set({ perfil: null });
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, cargando: false });
      if (data.session) void obtenerPerfil(data.session.user.id).then((perfil) => set({ perfil }));
    });
  },

  iniciarSesion: async (usuarioOCorreo, password, recordar) => {
    set({ enviando: true });
    try {
      const { data: bloqueo } = await supabase
        .rpc('verificar_bloqueo_usuario', { p_usuario: usuarioOCorreo })
        .maybeSingle<{ bloqueado: boolean; intentos_recientes: number }>();
      if (bloqueo?.bloqueado) {
        await registrarIntento(usuarioOCorreo, 'bloqueado');
        return { ok: false, mensaje: 'Demasiados intentos fallidos. Vuelve a intentarlo en 15 minutos.' };
      }

      let correo = usuarioOCorreo;
      if (!correo.includes('@')) {
        const { data } = await supabase.rpc('resolver_correo_por_usuario', { p_usuario: usuarioOCorreo });
        if (!data) {
          await registrarIntento(usuarioOCorreo, 'fallido');
          return { ok: false, mensaje: MENSAJE_GENERICO };
        }
        correo = data as string;
      }

      establecerRecordarDispositivo(recordar);
      const { data: inicio, error } = await supabase.auth.signInWithPassword({ email: correo, password });
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

  cerrarSesion: async () => {
    await supabase.auth.signOut();
    set({ session: null, perfil: null });
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
}));

export type { EstadoCuenta };
