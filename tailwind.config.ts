import type { Config } from 'tailwindcss';
import { COLOR, DURACION, RADIO } from './src/tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Los nombres se conservan para no tocar las clases de toda la app; lo
        // que cambia son los valores, que ahora salen del archivo de tokens.
        club: {
          rojo: COLOR.marca.rojo,
          'rojo-ficha': COLOR.marca.rojoFicha,
          'rojo-oscuro': '#8C0B14',
          naranja: COLOR.interaccion.naranja,
          negro: COLOR.superficie.fondo,
          carbon: COLOR.superficie.panel,
          grafito: COLOR.superficie.panelSecundario,
          plata: COLOR.texto.secundario,
          hueso: COLOR.texto.principal,
          cesped: COLOR.campo.cespedBase,
          'cesped-claro': COLOR.campo.cespedFranja,
          etiqueta: COLOR.campo.etiquetaSecundaria,
        },
      },
      borderRadius: {
        sm: RADIO.sm,
        md: RADIO.md,
        lg: RADIO.lg,
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        sans: ['"Archivo"', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        rapido: DURACION.rapida,
        base: DURACION.base,
        // 'lento' se recorta a 180ms: el encargo acota las transiciones a 120-180.
        lento: DURACION.lenta,
      },
      boxShadow: {
        tarjeta: '0 6px 16px -4px rgba(0,0,0,0.55)',
        elevada: '0 14px 28px -6px rgba(0,0,0,0.65)',
      },
      height: {
        dvh: '100dvh',
      },
      minHeight: {
        dvh: '100dvh',
      },
    },
  },
  plugins: [],
} satisfies Config;
