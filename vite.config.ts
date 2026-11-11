/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { opcionesPwa } from './pwa.config';

export default defineConfig({
  // Service worker para abrir sin señal (S1.11): ver pwa.config.ts.
  plugins: [react(), VitePWA(opcionesPwa)],
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // La Edge Function login-usuario (Deno) importa así supabase-js; en los tests, el paquete instalado.
    alias: { 'npm:@supabase/supabase-js@2': '@supabase/supabase-js' },
  },
});
