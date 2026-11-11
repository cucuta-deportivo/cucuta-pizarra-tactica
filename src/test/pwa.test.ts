import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeCaching } from 'workbox-build';
import { opcionesPwa } from '../../pwa.config';
import { avisarVersionNueva } from '../pwa/avisoVersion';
import { useUiStore } from '../store/uiStore';

/**
 * S1.11: el service worker guarda solo los archivos de la app y las fuentes. Nada
 * de Supabase (ni datos, ni fotos, ni sesión). Con una versión nueva, pregunta:
 * nunca recarga sola, porque puede haber un partido en curso.
 */
const reglas = (opcionesPwa.workbox?.runtimeCaching ?? []) as RuntimeCaching[];

/** La primera regla que atiende esa dirección, como hace Workbox. */
function reglaPara(direccion: string): RuntimeCaching | undefined {
  const url = new URL(direccion);
  return reglas.find((regla) => typeof regla.urlPattern === 'function' && regla.urlPattern({ url } as never));
}

describe('qué guarda el service worker', () => {
  it('nada de Supabase: datos, fotos firmadas, sesión y funciones van siempre a la red', () => {
    for (const direccion of [
      'https://abcd.supabase.co/rest/v1/alineaciones?select=*',
      'https://abcd.supabase.co/storage/v1/object/sign/jugadores/sub20/7.webp?token=x',
      'https://abcd.supabase.co/auth/v1/token?grant_type=refresh_token',
      'https://abcd.supabase.co/functions/v1/login-usuario',
    ]) {
      expect(reglaPara(direccion)?.handler).toBe('NetworkOnly');
    }
  });

  it('las fuentes de Google sí, para que la pizarra se vea igual sin señal', () => {
    expect(reglaPara('https://fonts.googleapis.com/css2?family=Barlow+Condensed')?.handler).toBe('StaleWhileRevalidate');
    expect(reglaPara('https://fonts.gstatic.com/s/barlowcondensed/v12/a.woff2')?.handler).toBe('CacheFirst');
  });

  it('cualquier otra dirección de fuera no se guarda', () => {
    expect(reglaPara('https://ejemplo.com/imagen.png')).toBeUndefined();
  });

  it('de la app, solo sus archivos; al navegar sin señal, abre la app', () => {
    expect(opcionesPwa.workbox?.globPatterns).toEqual(['**/*.{js,css,html,svg,png,ico,webmanifest}']);
    expect(opcionesPwa.workbox?.navigateFallback).toBe('index.html');
  });

  it('pregunta antes de usar una versión nueva', () => {
    expect(opcionesPwa.registerType).toBe('prompt');
    expect(opcionesPwa.injectRegister).toBe(false);
  });

  it('se puede instalar en la pantalla de inicio, con los colores del club', () => {
    const manifest = opcionesPwa.manifest;
    expect(manifest).toMatchObject({ display: 'standalone', lang: 'es-CO', theme_color: '#111111', background_color: '#111111' });
    const iconos = manifest ? manifest.icons ?? [] : [];
    expect(iconos.map((i) => [i.sizes, i.purpose ?? 'any'])).toEqual([
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]);
  });
});

describe('versión nueva', () => {
  beforeEach(() => useUiStore.setState({ toasts: [] }));

  it('avisa con un aviso fijo y solo actualiza si se toca "Actualizar"', () => {
    const actualizar = vi.fn();
    avisarVersionNueva(actualizar);

    const [aviso] = useUiStore.getState().toasts;
    expect(aviso).toMatchObject({ mensaje: 'Hay una versión nueva.', fijo: true, accion: { etiqueta: 'Actualizar' } });
    expect(actualizar).not.toHaveBeenCalled();

    aviso?.accion?.ejecutar();
    expect(actualizar).toHaveBeenCalledTimes(1);
  });
});
