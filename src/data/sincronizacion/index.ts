import { supabaseConfigurado } from '../../lib/supabaseClient';
import { useAuthStore } from '../../store/authStore';
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
} from '../supabase/alineacionesApi';
import { crearBajador, type CambioBajado } from './bajarCambios';
import { crearSincronizador, type ResumenSincronizacion } from './sincronizar';
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

const bajador = crearBajador({
  local: alineacionRepository,
  remoto: { listarEstados: listarEstadosEnServidor, descargar: descargarDelServidor },
  copiar: (alineacion) => copiaPorConflicto(alineacion),
});

const oyentes = new Set<(cambios: CambioBajado[]) => void>();

const sincronizador = crearSincronizador({
  subidor,
  bajador,
  alBajar: (cambios) => oyentes.forEach((oyente) => oyente(cambios)),
});

/** Solo sincroniza quien puede escribir en la tabla: un entrenador con la cuenta activa (igual que su RLS). */
function puedeSincronizar(): boolean {
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

/** Sube lo pendiente y baja lo de otros dispositivos. `null` si esta cuenta no sincroniza. */
export function sincronizarAhora(): Promise<ResumenSincronizacion | null> {
  return puedeSincronizar() ? sincronizador.sincronizar() : Promise.resolve(null);
}

/** Pide sincronizar; se hace a los 5 s del último pedido. */
export const programarSincronizacion = crearProgramador(() => void sincronizarAhora(), ESPERA_SUBIDA_MS);
