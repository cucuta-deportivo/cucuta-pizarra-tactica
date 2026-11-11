/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Solo para probar en local contra una copia de la Edge Function (p. ej. login-usuario-prueba). */
  readonly VITE_FUNCION_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
