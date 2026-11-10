import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * S1.13: en modo avión no se intenta sincronizar. Intentarlo dejaba el indicador
 * en "Sincronizando…" hasta 30 s (lo que supabase-js tarda en rendirse al
 * renovar el token sin red); ahora dice "Sin conexión" al momento.
 */
vi.mock('../lib/supabaseClient', () => ({ supabase: {}, supabaseConfigurado: true, establecerRecordarDispositivo: vi.fn() }));

const api = vi.hoisted(() => ({ llamadas: 0 }));
vi.mock('../data/supabase/alineacionesApi', async (original) => {
  const real = await original<typeof import('../data/supabase/alineacionesApi')>();
  const contar = <T>(valor: T) => async () => {
    api.llamadas += 1;
    return valor;
  };
  return {
    ...real,
    crearEnServidor: contar({ tipo: 'subida', version: 1 }),
    actualizarEnServidor: contar({ tipo: 'subida', version: 1 }),
    marcarEliminadaEnServidor: contar({ tipo: 'subida', version: 1 }),
    estadoEnServidor: contar(null),
    listarEstadosEnServidor: contar([]),
    descargarDelServidor: contar([]),
    ultimaActualizacionEnServidor: contar(null),
  };
});

describe('sincronizar en modo avión', () => {
  afterEach(() => vi.restoreAllMocks());

  it('no lo intenta: el indicador dice "Sin conexión" con lo que falta subir', async () => {
    const { useAuthStore } = await import('../store/authStore');
    const { useSincronizacionStore } = await import('../store/sincronizacionStore');
    const { alineacionRepository } = await import('../data/repositorio');
    const { sincronizarAhora } = await import('../data/sincronizacion');
    const { alineacion } = await import('./servidorFalso');
    useAuthStore.setState({ perfil: { id: 'u1', usuario: 'profe', nombre_completo: 'Profe', rol: 'entrenador', estado: 'activo', creado_en: '' } });
    await alineacionRepository.guardar(alineacion('a', 'Sin red'));
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);

    await sincronizarAhora();

    expect(api.llamadas).toBe(0);
    expect(useSincronizacionStore.getState()).toMatchObject({ estado: 'sin-conexion', pendientes: 1 });
  });
});
