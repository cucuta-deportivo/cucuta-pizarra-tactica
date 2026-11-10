import { supabaseConfigurado } from '../../lib/supabaseClient';
import type { Alineacion } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { estadoTrasVuelta, useSincronizacionStore } from '../../store/sincronizacionStore';
import { copiaPorConflicto } from '../../utils/copias';
import { generarId } from '../../utils/id';
import { alineacionRepository } from '../repositorio';
import {
  actualizarEnServidor,
  crearEnServidor,
  descargarDelServidor,
  estadoEnServidor,
  listarEstadosEnServidor,
  marcarEliminadaEnServidor,
  ErrorSinConexion,
  ultimaActualizacionEnServidor,
} from '../supabase/alineacionesApi';
import { crearBajador, type CambioBajado } from './bajarCambios';
import { buscarPorMigrar, contarSubidas, crearRespaldo, marcarParaSubir, type PorMigrar } from './migrar';
import { crearSincronizador, type ResumenSincronizacion } from './sincronizar';
import { crearComprobador, iniciarDisparadores } from './disparadores';
import { crearProgramador, crearSubidor } from './subirPendientes';

/** Cuánto se espera tras el último guardado antes de sincronizar: una ráfaga de cambios es una sola vuelta. */
export const ESPERA_SUBIDA_MS = 5000;

const subidor = crearSubidor({
  local: alineacionRepository,
  remoto: {
    crear: crearEnServidor,
    actualizar: actualizarEnServidor,
    marcarEliminada: marcarEliminadaEnServidor,
    estado: estadoEnServidor,
  },
  nuevoId: generarId,
});

/** El último cambio del servidor visto por la bajada de la vuelta en curso. */
let ultimoCambioVisto: string | null = null;

const bajador = crearBajador({
  local: alineacionRepository,
  remoto: {
    // De paso se anota el último cambio que se vio, para la comprobación barata (S1.10).
    listarEstados: async () => {
      const estados = await listarEstadosEnServidor();
      ultimoCambioVisto = estados.reduce<string | null>((max, e) => (max === null || e.actualizadoEn > max ? e.actualizadoEn : max), null);
      return estados;
    },
    descargar: descargarDelServidor,
  },
  copiar: (alineacion) => copiaPorConflicto(alineacion),
});

const oyentes = new Set<(cambios: CambioBajado[]) => void>();

const sincronizador = crearSincronizador({
  subidor,
  bajador,
  alBajar: (cambios) => oyentes.forEach((oyente) => oyente(cambios)),
});

/** Solo sincroniza quien puede escribir en la tabla: un entrenador con la cuenta activa (igual que su RLS). */
export function puedeSincronizar(): boolean {
  const perfil = useAuthStore.getState().perfil;
  return supabaseConfigurado && perfil?.rol === 'entrenador' && perfil.estado === 'activo';
}

/** Avisa de lo que cambió aquí al bajar; devuelve cómo dejar de escuchar. */
export function alBajarCambios(oyente: (cambios: CambioBajado[]) => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

async function contarPendientes(): Promise<number> {
  return (await alineacionRepository.pendientesDeSubir()).length;
}

/** Cuántas alineaciones de este dispositivo tienen cambios sin subir (S1.13: aviso al cerrar sesión). */
export function contarSinSubir(): Promise<number> {
  return contarPendientes();
}

/** Sube lo pendiente y baja lo de otros dispositivos; el indicador lo refleja (S1.9). `null` si esta cuenta no sincroniza. */
export async function sincronizarAhora(): Promise<ResumenSincronizacion | null> {
  if (!puedeSincronizar()) return null;
  // En modo avión no se intenta: supabase-js tardaría hasta 30 s en rendirse al renovar el token (S1.13).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    useSincronizacionStore.setState({ estado: 'sin-conexion', pendientes: await contarPendientes() });
    return null;
  }
  useSincronizacionStore.setState({ estado: 'sincronizando' });
  try {
    const resumen = await sincronizador.sincronizar();
    // Solo una vuelta que terminó al día cuenta como vista: si se cortó a mitad, se vuelve a mirar.
    if (resumen.estado === 'al-dia') comprobador.recordar(ultimoCambioVisto);
    useSincronizacionStore.setState(estadoTrasVuelta(resumen, await contarPendientes(), new Date()));
    return resumen;
  } catch (error) {
    useSincronizacionStore.setState({ estado: 'error', mensaje: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

const programar = crearProgramador(() => void sincronizarAhora(), ESPERA_SUBIDA_MS);

/** Pide sincronizar; se hace a los 5 s del último pedido. Mientras tanto, el indicador ya cuenta lo que falta subir. */
export function programarSincronizacion(): void {
  programar();
  if (puedeSincronizar()) void contarPendientes().then((pendientes) => useSincronizacionStore.setState({ pendientes }));
}

/** S1.8: lo de este dispositivo que todavía no entró en la sincronización. `null` si esta cuenta no sincroniza. */
export function porMigrarAqui(esVacia: (alineacion: Alineacion) => boolean): Promise<PorMigrar | null> {
  return puedeSincronizar() ? buscarPorMigrar(alineacionRepository, esVacia) : Promise.resolve(null);
}

/** S1.8: marca por subir y sincroniza; `alAvanzar` recibe cuántas van subidas. Lo que no suba se reintenta solo. */
export async function migrarAqui(ids: string[], alAvanzar: (subidas: number) => void): Promise<{ subidas: number; total: number }> {
  await marcarParaSubir(alineacionRepository, ids);
  const sondeo = setInterval(() => void contarSubidas(alineacionRepository, ids).then(alAvanzar), 500);
  try {
    await sincronizarAhora();
  } finally {
    clearInterval(sondeo);
  }
  const subidas = await contarSubidas(alineacionRepository, ids);
  alAvanzar(subidas);
  return { subidas, total: ids.length };
}

/** S1.8: descarga el respaldo de todas las alineaciones de este dispositivo (la exportación se carga aparte). */
export async function descargarRespaldoAqui(): Promise<void> {
  const [{ exportarRespaldoAJson }, respaldo] = await Promise.all([import('../../utils/exportar'), crearRespaldo(alineacionRepository)]);
  exportarRespaldoAJson(respaldo);
}

const comprobador = crearComprobador({ contarPendientes, ultimaActualizacion: ultimaActualizacionEnServidor, sincronizar: sincronizarAhora });

/** S1.10: la comprobación barata; sin red, el indicador lo dice. */
export async function comprobarCambios(): Promise<void> {
  if (!puedeSincronizar()) return;
  try {
    await comprobador.comprobar();
  } catch (error) {
    if (error instanceof ErrorSinConexion) useSincronizacionStore.setState({ estado: 'sin-conexion', pendientes: await contarPendientes() });
    else useSincronizacionStore.setState({ estado: 'error', mensaje: error instanceof Error ? error.message : String(error) });
  }
}

/** S1.10: sincroniza al volver la señal, al volver a la pestaña y cada 45 s mientras se ve. Devuelve cómo parar. */
export function iniciarSincronizacionAutomatica(): () => void {
  return iniciarDisparadores({
    sincronizar: () => void sincronizarAhora(),
    comprobar: () => void comprobarCambios(),
    alPerderRed: () => {
      if (puedeSincronizar()) useSincronizacionStore.setState({ estado: 'sin-conexion' });
    },
    entorno: { ventana: window, documento: document },
  });
}
