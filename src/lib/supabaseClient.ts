import { createClient } from '@supabase/supabase-js';

// `|| undefined` (no `??`) a propósito: una variable de entorno definida pero vacía
// (p. ej. en un hosting donde alguien creó la clave sin rellenar el valor) debe
// degradar igual que si no existiera, no llegar como cadena vacía a createClient()
// y tirar la app entera con "supabaseKey is required".
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || undefined;

export const supabaseConfigurado = Boolean(url && anonKey);

if (!supabaseConfigurado) {
  console.warn(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: el acceso con cuenta (FA6–FA8) queda deshabilitado hasta configurarlas en .env.local.',
  );
}

const CLAVE_RECORDAR_DISPOSITIVO = 'pizarra:recordar-dispositivo';

/** Controla si la sesión sobrevive a cerrar el navegador (FA6 "Recordar este dispositivo"). Llamar antes de iniciar sesión. */
export function establecerRecordarDispositivo(recordar: boolean): void {
  try {
    localStorage.setItem(CLAVE_RECORDAR_DISPOSITIVO, String(recordar));
  } catch {
    // almacenamiento no disponible (p. ej. modo privado estricto): se ignora, cae al comportamiento por defecto.
  }
}

function seRecuerdaEsteDispositivo(): boolean {
  try {
    return localStorage.getItem(CLAVE_RECORDAR_DISPOSITIVO) !== 'false';
  } catch {
    return true;
  }
}

/**
 * Adaptador de almacenamiento que decide en cada operación si la sesión vive
 * en localStorage (sobrevive a cerrar el navegador) o en sessionStorage (se
 * pierde al cerrar la pestaña), según la preferencia guardada por
 * `establecerRecordarDispositivo`. Ambos storages se consultan al leer para
 * no perder una sesión ya guardada si la preferencia cambia entre sesiones.
 */
const almacenSesion = {
  getItem: (clave: string) => {
    try {
      return localStorage.getItem(clave) ?? sessionStorage.getItem(clave);
    } catch {
      return null;
    }
  },
  setItem: (clave: string, valor: string) => {
    try {
      if (seRecuerdaEsteDispositivo()) localStorage.setItem(clave, valor);
      else sessionStorage.setItem(clave, valor);
    } catch {
      // sin almacenamiento disponible: la sesión no persistirá entre recargas, pero la app sigue funcionando.
    }
  },
  removeItem: (clave: string) => {
    try {
      localStorage.removeItem(clave);
      sessionStorage.removeItem(clave);
    } catch {
      // no-op
    }
  },
};

/**
 * Cliente único de Supabase. La clave usada aquí es la pública ("anon" /
 * "publishable"): está pensada para vivir en el bundle del cliente y queda
 * protegida por las políticas de Row Level Security del propio proyecto
 * (ver supabase/schema.sql), nunca por mantenerla en secreto.
 */
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: almacenSesion,
  },
});
