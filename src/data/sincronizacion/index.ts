import { supabaseConfigurado } from '../../lib/supabaseClient';
import { useAuthStore } from '../../store/authStore';
import { generarId } from '../../utils/id';
import { alineacionRepository } from '../repositorio';
import {
  actualizarEnServidor,
  crearEnServidor,
  estadoEnServidor,
  marcarEliminadaEnServidor,
} from '../supabase/alineacionesApi';
import { crearProgramador, crearSubidor } from './subirPendientes';

/** Cuánto se espera tras el último guardado antes de subir: una ráfaga de cambios es una sola subida. */
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

/** Solo sube quien puede escribir en la tabla: un entrenador con la cuenta activa (igual que su RLS). */
function puedeSincronizar(): boolean {
  const perfil = useAuthStore.getState().perfil;
  return supabaseConfigurado && perfil?.rol === 'entrenador' && perfil.estado === 'activo';
}

/** Pide subir lo pendiente; se hace a los 5 s del último pedido. */
export const programarSubida = crearProgramador(() => {
  if (puedeSincronizar()) void subidor.subir();
}, ESPERA_SUBIDA_MS);
