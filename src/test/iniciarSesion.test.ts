import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Seg1 y Seg2: la app entra siempre por la Edge Function login-usuario, con usuario o con
 * correo, y ya no comprueba bloqueos ni anota intentos desde el navegador.
 */
const supa = vi.hoisted(() => ({
  invoke: vi.fn(),
  setSession: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  rpc: vi.fn(),
  perfil: {} as Record<string, unknown>,
}));

vi.mock('../lib/supabaseClient', () => ({
  supabaseConfigurado: true,
  establecerRecordarDispositivo: vi.fn(),
  supabase: {
    functions: { invoke: supa.invoke },
    auth: {
      setSession: supa.setSession,
      signInWithPassword: supa.signInWithPassword,
      signOut: supa.signOut,
      onAuthStateChange: vi.fn(),
    },
    rpc: supa.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: supa.perfil, error: null, status: 200 }) }) }),
    }),
  },
}));
vi.mock('../utils/ipLookup', () => ({
  obtenerDatosIp: vi.fn(async () => ({ ip: '190.24.10.5', ciudad: 'Cúcuta', pais: 'Colombia' })),
}));

import { useAuthStore } from '../store/authStore';

const TOKENS = { access_token: 'acceso', refresh_token: 'renovar' };
const SESION = { user: { id: 'u1' }, access_token: 'acceso', refresh_token: 'renovar' };
const PERFIL_ACTIVO = { id: 'u1', usuario: 'profe', nombre_completo: 'Profe', rol: 'entrenador', estado: 'activo', creado_en: '' };
const SIN_CONEXION =
  'Sin conexión. Para entrar hace falta señal; si ya habías entrado en este dispositivo con "Recordar", la pizarra se abre sola.';

function laFuncionResponde(estado: number) {
  supa.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: new Response(null, { status: estado }) } });
}

describe('iniciarSesion: siempre por la Edge Function (Seg1 y Seg2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    supa.invoke.mockResolvedValue({ data: TOKENS, error: null });
    supa.setSession.mockResolvedValue({ data: { session: SESION }, error: null });
    supa.perfil = { ...PERFIL_ACTIVO };
    useAuthStore.setState({ session: null, perfil: null, enviando: false });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('con usuario: la función recibe el intento con sus datos y la app abre la sesión sin anotar nada', async () => {
    expect(await useAuthStore.getState().iniciarSesion('profe', 'clave', true)).toEqual({ ok: true });

    expect(supa.invoke).toHaveBeenCalledWith('login-usuario', {
      body: {
        identificador: 'profe',
        password: 'clave',
        datos: { dispositivo: expect.any(String), ip: '190.24.10.5', ciudad: 'Cúcuta', pais: 'Colombia' },
      },
    });
    expect(supa.setSession).toHaveBeenCalledWith(TOKENS);
    expect(supa.rpc).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ session: SESION, perfil: { usuario: 'profe' }, enviando: false });
  });

  it('con correo: también por la función, nunca directo a Auth', async () => {
    expect(await useAuthStore.getState().iniciarSesion('profe@club.co', 'clave', false)).toEqual({ ok: true });

    expect(supa.invoke).toHaveBeenCalledWith(
      'login-usuario',
      expect.objectContaining({ body: expect.objectContaining({ identificador: 'profe@club.co' }) }),
    );
    expect(supa.signInWithPassword).not.toHaveBeenCalled();
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'Usuario o contraseña incorrectos.'],
    [400, 'Usuario o contraseña incorrectos.'],
    [429, 'Demasiados intentos fallidos. Vuelve a intentarlo en 15 minutos.'],
    [403, 'Esta cuenta está bloqueada. Contacta a un entrenador del cuerpo técnico.'],
    [503, 'No se pudo comprobar la contraseña. Inténtalo de nuevo en un momento.'],
    [500, 'No se pudo comprobar la contraseña. Inténtalo de nuevo en un momento.'],
  ])('si la función responde %i: "%s", sin abrir sesión', async (estado, mensaje) => {
    laFuncionResponde(estado);

    expect(await useAuthStore.getState().iniciarSesion('profe', 'clave', true)).toEqual({ ok: false, mensaje });
    expect(supa.setSession).not.toHaveBeenCalled();
    expect(supa.rpc).not.toHaveBeenCalled();
    expect(useAuthStore.getState().enviando).toBe(false);
  });

  it('sin respuesta de la función (wifi sin internet): "Sin conexión", no "contraseña incorrecta"', async () => {
    supa.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') } });

    expect(await useAuthStore.getState().iniciarSesion('profe', 'clave', true)).toEqual({ ok: false, mensaje: SIN_CONEXION });
    expect(supa.setSession).not.toHaveBeenCalled();
  });

  it('cuenta bloqueada justo al entrar: cierra la sesión y lo dice', async () => {
    supa.perfil = { ...PERFIL_ACTIVO, estado: 'bloqueado' };

    expect(await useAuthStore.getState().iniciarSesion('profe', 'clave', true)).toEqual({
      ok: false,
      mensaje: 'Esta cuenta está bloqueada. Contacta a un entrenador del cuerpo técnico.',
    });
    expect(supa.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('VITE_FUNCION_LOGIN cambia la función, para probar en local contra una copia', async () => {
    vi.stubEnv('VITE_FUNCION_LOGIN', 'login-usuario-prueba');

    await useAuthStore.getState().iniciarSesion('profe', 'clave', true);

    expect(supa.invoke).toHaveBeenCalledWith('login-usuario-prueba', expect.anything());
  });
});
