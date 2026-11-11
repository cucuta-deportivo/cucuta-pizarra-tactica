import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * S1.13: entrar sin red con una sesión ya abierta en el dispositivo. El perfil
 * se guarda cada vez que llega con conexión; sin red se entra con él. La regla
 * de 12 h solo se aplica con conexión. Al volver la señal se valida todo.
 * Cerrar sesión a propósito borra la copia del perfil y la de la plantilla.
 */
const falso = vi.hoisted(() => ({
  red: true,
  /** El token guardado sigue vigente (no hace falta renovarlo para leer la sesión). */
  tokenVigente: true,
  revocada: false,
  /** Cerrar las demás sesiones falla en el servidor. */
  otrasFallan: false,
  sesion: null as unknown,
  perfil: null as unknown,
  oyentes: [] as Array<(evento: string, sesion: unknown) => void>,
}));

vi.mock('../utils/ipLookup', () => ({ obtenerDatosIp: async () => ({ ip: null, ciudad: null, pais: null }) }));

vi.mock('../lib/supabaseClient', async () => {
  const { AuthApiError, AuthRetryableFetchError } = await import('@supabase/supabase-js');
  const sinRed = () => new AuthRetryableFetchError('Failed to fetch', 0);
  const emitir = (evento: string, sesion: unknown) => falso.oyentes.forEach((o) => o(evento, sesion));
  const respuestaRpc = () =>
    Object.assign(Promise.resolve(falso.red ? { data: null, error: null } : { data: null, error: { message: 'Failed to fetch' }, status: 0 }), {
      maybeSingle: async () => (falso.red ? { data: { bloqueado: false }, error: null } : { data: null, error: { message: 'Failed to fetch' }, status: 0 }),
    });
  const supabase = {
    auth: {
      onAuthStateChange: vi.fn((oyente: (evento: string, sesion: unknown) => void) => {
        falso.oyentes.push(oyente);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      }),
      getSession: vi.fn(async () => {
        if (!falso.red && !falso.tokenVigente) return { data: { session: null }, error: sinRed() };
        if (falso.red && falso.revocada) {
          emitir('SIGNED_OUT', null);
          return { data: { session: null }, error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found') };
        }
        return { data: { session: falso.sesion }, error: null };
      }),
      signOut: vi.fn(async (opciones?: { scope?: string }) => {
        if (!falso.red) return { error: sinRed() };
        // Las demás sesiones se cierran en el servidor; la de aquí sigue.
        if (opciones?.scope === 'others') return { error: falso.otrasFallan ? new AuthApiError('fallo', 500, 'unexpected_failure') : null };
        emitir('SIGNED_OUT', null);
        return { error: null };
      }),
      signInWithPassword: vi.fn(async () => ({ data: { session: null, user: null }, error: falso.red ? new AuthApiError('Invalid login credentials', 400, 'invalid_credentials') : sinRed() })),
      setSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            falso.red ? { data: falso.perfil, error: null, status: 200 } : { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 },
        }),
      }),
    })),
    rpc: vi.fn(respuestaRpc),
    functions: { invoke: vi.fn(async () => ({ data: null, error: { message: 'Failed to fetch' } })) },
  };
  return { supabase, supabaseConfigurado: true, establecerRecordarDispositivo: vi.fn() };
});

const CLAVE_SESION = 'sb-prueba-auth-token';
const CLAVE_PERFIL = 'pizarra:perfil-guardado';
const CLAVE_PLANTILLA = 'cucuta.plantillaGuardada.v1';
const CLAVE_ACTIVIDAD = 'pizarra:ultima-actividad';
const usuario = { id: 'u1', email: 'entrenador@club.co' };
const sesionGuardada = { access_token: 'viejo', refresh_token: 'r1', expires_at: 1, token_type: 'bearer', user: usuario };
const perfilActivo = { id: 'u1', usuario: 'profe', nombre_completo: 'Profe Prueba', rol: 'entrenador', estado: 'activo' };

async function cargarStore() {
  vi.resetModules();
  const { useAuthStore } = await import('../store/authStore');
  return useAuthStore;
}

function conRed(hay: boolean) {
  falso.red = hay;
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(hay);
}

const listo = async (store: Awaited<ReturnType<typeof cargarStore>>) => vi.waitFor(() => expect(store.getState().cargando).toBe(false));

describe('entrar sin red con la sesión ya abierta', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.assign(falso, { red: true, tokenVigente: true, revocada: false, sesion: sesionGuardada, perfil: perfilActivo, oyentes: [] });
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesionGuardada));
  });
  afterEach(() => vi.restoreAllMocks());

  it('con conexión, el perfil que llega se guarda en el dispositivo', async () => {
    conRed(true);
    const store = await cargarStore();
    store.getState().inicializar();
    await vi.waitFor(() => expect(store.getState().perfil).toMatchObject({ estado: 'activo' }));

    expect(JSON.parse(localStorage.getItem(CLAVE_PERFIL)!)).toMatchObject({ userId: 'u1', perfil: { usuario: 'profe' } });
    expect(store.getState().sinConexion).toBe(false);
  });

  it('sin red, con la sesión y el perfil guardados, entra enseguida en modo sin conexión', async () => {
    conRed(true);
    const primera = await cargarStore();
    primera.getState().inicializar();
    await vi.waitFor(() => expect(localStorage.getItem(CLAVE_PERFIL)).not.toBeNull());

    conRed(false);
    falso.tokenVigente = false;
    const store = await cargarStore();
    const { supabase } = await import('../lib/supabaseClient');
    vi.mocked(supabase.auth.getSession).mockClear();
    store.getState().inicializar();
    await listo(store);

    expect(store.getState()).toMatchObject({ sinConexion: true, perfil: { estado: 'activo' }, session: { user: { id: 'u1' } } });
    // No se espera a que supabase-js intente renovar el token sin red (tarda hasta 30 s).
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('con "red" pero sin respuesta (el token caducado no se puede renovar), también entra sin conexión', async () => {
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ userId: 'u1', perfil: perfilActivo, guardadoEn: '2026-11-09T10:00:00Z' }));
    conRed(true);
    falso.red = false;
    falso.tokenVigente = false;
    const store = await cargarStore();
    store.getState().inicializar();
    await listo(store);

    expect(store.getState()).toMatchObject({ sinConexion: true, perfil: { estado: 'activo' } });
  });

  it('con el token vigente pero sin red, el perfil no llega y se usa el guardado', async () => {
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ userId: 'u1', perfil: perfilActivo, guardadoEn: '2026-11-09T10:00:00Z' }));
    conRed(true);
    falso.red = false;
    const store = await cargarStore();
    store.getState().inicializar();
    await vi.waitFor(() => expect(store.getState().perfil).toMatchObject({ estado: 'activo' }));

    expect(store.getState().sinConexion).toBe(true);
  });

  it('el perfil guardado de otra cuenta no sirve', async () => {
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ userId: 'otra', perfil: { ...perfilActivo, id: 'otra' }, guardadoEn: '2026-11-09T10:00:00Z' }));
    conRed(false);
    const store = await cargarStore();
    store.getState().inicializar();
    await listo(store);

    expect(store.getState()).toMatchObject({ perfil: null, sinDatosSinConexion: true });
  });

  it('mientras está sin conexión, supabase-js no la saca por no poder renovar el token', async () => {
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ userId: 'u1', perfil: perfilActivo, guardadoEn: '2026-11-09T10:00:00Z' }));
    conRed(false);
    const store = await cargarStore();
    store.getState().inicializar();
    await listo(store);

    falso.oyentes.forEach((o) => o('INITIAL_SESSION', null));
    expect(store.getState()).toMatchObject({ sinConexion: true, session: { user: { id: 'u1' } } });
  });

  it('sin red y sin sesión guardada: a la pantalla de acceso, y al intentar entrar dice que no hay conexión', async () => {
    localStorage.removeItem(CLAVE_SESION);
    conRed(false);
    const store = await cargarStore();
    store.getState().inicializar();
    await listo(store);

    expect(store.getState().session).toBeNull();
    expect(await store.getState().iniciarSesion('profe@club.co', 'clave', true)).toEqual({
      ok: false,
      mensaje: 'Sin conexión. Para entrar hace falta señal; si ya habías entrado en este dispositivo con "Recordar", la pizarra se abre sola.',
    });
  });
});

describe('la regla de 12 h, solo con conexión', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(falso, { red: true, tokenVigente: true, revocada: false, sesion: sesionGuardada, perfil: perfilActivo, oyentes: [] });
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesionGuardada));
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ userId: 'u1', perfil: perfilActivo, guardadoEn: '2026-11-09T10:00:00Z' }));
    localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now() - 13 * 60 * 60 * 1000));
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin red no cierra la sesión: no se podría volver a entrar', async () => {
    conRed(false);
    const store = await cargarStore();
    const { supabase } = await import('../lib/supabaseClient');
    vi.mocked(supabase.auth.signOut).mockClear();
    store.getState().inicializar();
    await listo(store);

    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(store.getState().sinConexion).toBe(true);
  });

  it('con "red" según el navegador pero sin respuesta del servidor (wifi sin internet), tampoco la cierra', async () => {
    conRed(true);
    falso.red = false;
    const store = await cargarStore();
    const { supabase } = await import('../lib/supabaseClient');
    vi.mocked(supabase.auth.signOut).mockClear();
    store.getState().inicializar();
    await vi.waitFor(() => expect(store.getState().sinConexion).toBe(true));

    // supabase-js quita la sesión del dispositivo aunque el servidor no conteste: no se puede ni intentar.
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(store.getState().session).not.toBeNull();
  });

  it('con red la cierra, solo en este dispositivo y después de subir lo pendiente', async () => {
    conRed(true);
    const store = await cargarStore();
    const { alCerrarPorInactividad } = await import('../store/authStore');
    const { supabase } = await import('../lib/supabaseClient');
    vi.mocked(supabase.auth.signOut).mockClear();
    const orden: string[] = [];
    alCerrarPorInactividad(async () => void orden.push('subir'));
    vi.mocked(supabase.auth.signOut).mockImplementationOnce(async () => {
      orden.push('cerrar');
      return { error: null };
    });
    store.getState().inicializar();

    await vi.waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(orden).toEqual(['subir', 'cerrar']);
  });

  it('abierta sin red tras 12 h y sin tocarla: al volver la señal sube lo pendiente y cierra (opción A)', async () => {
    conRed(false);
    const store = await cargarStore();
    const { alCerrarPorInactividad } = await import('../store/authStore');
    const { supabase } = await import('../lib/supabaseClient');
    const subir = vi.fn(async () => undefined);
    alCerrarPorInactividad(subir);
    store.getState().inicializar();
    await listo(store);
    expect(store.getState().sinConexion).toBe(true);
    vi.mocked(supabase.auth.signOut).mockClear();

    conRed(true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    expect(subir).toHaveBeenCalledWith(expect.objectContaining({ estado: 'activo' }));
    await vi.waitFor(() => expect(store.getState().session).toBeNull());
  });

  it('abierta sin red tras 12 h pero usada: al volver la señal no cierra', async () => {
    conRed(false);
    const store = await cargarStore();
    const { supabase } = await import('../lib/supabaseClient');
    store.getState().inicializar();
    await listo(store);
    // Abrirla no cuenta como uso; tocarla sí.
    expect(Number(localStorage.getItem(CLAVE_ACTIVIDAD))).toBeLessThan(Date.now() - 12 * 60 * 60 * 1000);
    window.dispatchEvent(new Event('pointerdown'));
    vi.mocked(supabase.auth.signOut).mockClear();

    conRed(true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(store.getState().sinConexion).toBe(false));
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(store.getState().session).not.toBeNull();
  });
});

describe('al volver la señal se valida todo', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(falso, { red: false, tokenVigente: false, revocada: false, sesion: sesionGuardada, perfil: perfilActivo, oyentes: [] });
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesionGuardada));
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ userId: 'u1', perfil: perfilActivo, guardadoEn: '2026-11-09T10:00:00Z' }));
    localStorage.setItem(CLAVE_PLANTILLA, JSON.stringify({ categorias: [], porCategoria: {} }));
  });
  afterEach(() => vi.restoreAllMocks());

  async function sinConexion() {
    conRed(false);
    const store = await cargarStore();
    store.getState().inicializar();
    await listo(store);
    expect(store.getState().sinConexion).toBe(true);
    return store;
  }

  it('con la sesión renovada y la cuenta activa, deja el modo sin conexión', async () => {
    const store = await sinConexion();
    conRed(true);
    falso.sesion = { ...sesionGuardada, access_token: 'nuevo', expires_at: 9_999_999_999 };

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(store.getState().sinConexion).toBe(false));
    expect(store.getState()).toMatchObject({ session: { access_token: 'nuevo' }, perfil: { estado: 'activo' } });
  });

  it('si la cuenta fue bloqueada, la pantalla de cuenta bloqueada', async () => {
    const store = await sinConexion();
    conRed(true);
    falso.perfil = { ...perfilActivo, estado: 'bloqueado' };

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(store.getState().perfil).toMatchObject({ estado: 'bloqueado' }));
  });

  it('si la sesión ya no vale, a la pantalla de acceso, sin la copia del perfil ni la de la plantilla', async () => {
    const store = await sinConexion();
    conRed(true);
    falso.revocada = true;

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(store.getState().session).toBeNull());
    expect(store.getState()).toMatchObject({ perfil: null, sinConexion: false });
    expect(localStorage.getItem(CLAVE_PERFIL)).toBeNull();
    expect(localStorage.getItem(CLAVE_PLANTILLA)).toBeNull();
  });
});

describe('cerrar sesión a propósito', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(falso, { red: true, tokenVigente: true, revocada: false, sesion: sesionGuardada, perfil: perfilActivo, oyentes: [] });
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesionGuardada));
    localStorage.setItem(CLAVE_PLANTILLA, JSON.stringify({ categorias: [], porCategoria: {} }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('cierra solo la sesión de este dispositivo y borra la copia del perfil y la de la plantilla', async () => {
    conRed(true);
    const store = await cargarStore();
    const { supabase } = await import('../lib/supabaseClient');
    store.getState().inicializar();
    await vi.waitFor(() => expect(localStorage.getItem(CLAVE_PERFIL)).not.toBeNull());
    vi.mocked(supabase.auth.signOut).mockClear();

    await store.getState().cerrarSesion();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(store.getState()).toMatchObject({ session: null, perfil: null });
    expect(localStorage.getItem(CLAVE_PERFIL)).toBeNull();
    expect(localStorage.getItem(CLAVE_PLANTILLA)).toBeNull();
  });

  it('"en todos los dispositivos": primero cierra las demás en el servidor y después la de aquí', async () => {
    conRed(true);
    const store = await cargarStore();
    const { supabase } = await import('../lib/supabaseClient');
    store.getState().inicializar();
    await vi.waitFor(() => expect(store.getState().perfil).not.toBeNull());
    vi.mocked(supabase.auth.signOut).mockClear();

    expect(await store.getState().cerrarSesionEnTodos()).toEqual({ ok: true });
    expect(vi.mocked(supabase.auth.signOut).mock.calls).toEqual([[{ scope: 'others' }], [{ scope: 'local' }]]);
    expect(store.getState().session).toBeNull();
  });

  it('"en todos los dispositivos" sin red, o si el servidor falla: lo dice y no cierra la de aquí', async () => {
    conRed(true);
    const store = await cargarStore();
    const { supabase } = await import('../lib/supabaseClient');
    store.getState().inicializar();
    await vi.waitFor(() => expect(store.getState().perfil).not.toBeNull());

    falso.otrasFallan = true;
    expect(await store.getState().cerrarSesionEnTodos()).toEqual({
      ok: false,
      mensaje: 'No se pudo cerrar la sesión en los demás dispositivos. Inténtalo otra vez con señal.',
    });
    expect(store.getState().session).not.toBeNull();

    conRed(false);
    vi.mocked(supabase.auth.signOut).mockClear();
    expect(await store.getState().cerrarSesionEnTodos()).toEqual({
      ok: false,
      mensaje: 'Sin conexión: para cerrar la sesión en los demás dispositivos hace falta señal.',
    });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(store.getState().session).not.toBeNull();
  });

  it('sin red también: quita la sesión del dispositivo aunque el servidor no responda', async () => {
    localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ userId: 'u1', perfil: perfilActivo, guardadoEn: '2026-11-09T10:00:00Z' }));
    conRed(false);
    const store = await cargarStore();
    store.getState().inicializar();
    await listo(store);

    await store.getState().cerrarSesion();
    expect(store.getState()).toMatchObject({ session: null, perfil: null, sinConexion: false });
    expect(localStorage.getItem(CLAVE_SESION)).toBeNull();
    expect(localStorage.getItem(CLAVE_PERFIL)).toBeNull();
  });
});

describe('las pantallas', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(falso, { red: false, tokenVigente: false, revocada: false, sesion: sesionGuardada, perfil: perfilActivo, oyentes: [] });
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesionGuardada));
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin red y sin datos de la cuenta en el dispositivo, lo dice en vez de quedarse cargando', async () => {
    conRed(false);
    vi.resetModules();
    const { AuthGate } = await import('../components/auth/AuthGate');
    render(<AuthGate>contenido de la pizarra</AuthGate>);

    expect(await screen.findByText(/Para usar la pizarra sin señal hay que haber entrado una vez con señal/)).toBeInTheDocument();
    expect(screen.queryByText('contenido de la pizarra')).toBeNull();
  });

  it('el aviso de cerrar sesión con alineaciones sin subir deja elegir entre cerrar igual o cancelar', async () => {
    const { ConfirmarCierreSesion } = await import('../components/auth/ConfirmarCierreSesion');
    const usuario = userEvent.setup();
    const cerrarIgual = vi.fn();
    const cancelar = vi.fn();
    const { rerender } = render(<ConfirmarCierreSesion sinSubir={2} onCerrarIgual={cerrarIgual} onCancelar={cancelar} />);

    expect(screen.getByText('Hay 2 alineaciones sin subir; se subirán cuando vuelvas a entrar.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancelar).toHaveBeenCalled();
    await usuario.click(screen.getByRole('button', { name: 'Cerrar igual' }));
    expect(cerrarIgual).toHaveBeenCalled();

    rerender(<ConfirmarCierreSesion sinSubir={1} onCerrarIgual={cerrarIgual} onCancelar={cancelar} />);
    expect(screen.getByText('Hay 1 alineación sin subir; se subirá cuando vuelvas a entrar.')).toBeInTheDocument();
  });

  it('cerrar en todos los dispositivos explica qué hace, aunque no haya nada sin subir', async () => {
    const { ConfirmarCierreSesion } = await import('../components/auth/ConfirmarCierreSesion');
    render(<ConfirmarCierreSesion sinSubir={0} enTodos onCerrarIgual={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.getByText('Cerrar sesión en todos los dispositivos')).toBeInTheDocument();
    expect(screen.getByText(/aquí y en todos los dispositivos donde hayas entrado; por ejemplo, una tablet perdida o robada/)).toBeInTheDocument();
    // El token de acceso de los demás no se puede anular: vale hasta que caduca (1 h por defecto en Supabase).
    expect(screen.getByText(/puede tardar hasta una hora/)).toBeInTheDocument();
    expect(screen.queryByText(/sin subir/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar en todos' })).toBeInTheDocument();
  });
});
