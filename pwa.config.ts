import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * Service worker de la pizarra (S1.11). Guarda los archivos de la app y las
 * fuentes, para que abra sin señal en el banquillo. NUNCA guarda nada de
 * Supabase: ni datos, ni fotos (las sirve con enlaces firmados y privados), ni
 * la sesión. Con una versión nueva pregunta antes de recargar: nunca lo hace
 * sola, porque puede haber un partido en curso.
 *
 * Las funciones de `urlPattern` se copian tal cual dentro del service worker:
 * no pueden usar nada de fuera de ellas.
 */
export const opcionesPwa: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  // Se registra a mano (src/pwa/registrar.ts), después del primer pintado.
  injectRegister: false,
  manifest: {
    name: 'Pizarra Táctica · Cúcuta Deportivo',
    short_name: 'Pizarra Cúcuta',
    description: 'Pizarra táctica del cuerpo técnico de las categorías formativas del Cúcuta Deportivo.',
    lang: 'es-CO',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#111111',
    icons: [
      { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    navigateFallback: 'index.html',
    runtimeCaching: [
      // Primero y explícito: Supabase va siempre a la red.
      { urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: 'NetworkOnly' },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'fuentes-hojas' },
      },
      {
        urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
        handler: 'CacheFirst',
        options: {
          cacheName: 'fuentes',
          expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
};
