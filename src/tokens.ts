/**
 * Tokens de diseño — único origen de verdad del aspecto visual.
 *
 * Ningún componente debe llevar un color literal: todos salen de aquí, y
 * `tailwind.config.ts` también los importa para que las clases utilitarias y los
 * estilos en línea hablen del mismo sitio.
 *
 * Este archivo no importa nada del proyecto a propósito: lo consume la
 * configuración de Tailwind, que se evalúa fuera del bundle de la aplicación.
 */

export const COLOR = {
  /** Superficies, de la más honda a la más elevada. */
  superficie: {
    fondo: '#101514',
    panel: '#171D1B',
    panelSecundario: '#202724',
  },

  texto: {
    principal: '#F2F2F2',
    secundario: '#A7ADA9',
  },

  /** Identidad del club. Nunca se usa para indicar selección: eso es naranja. */
  marca: {
    rojo: '#D4111E',
    /** Variante de la ficha sobre césped: algo más apagada para no vibrar sobre el verde. */
    rojoFicha: '#C4121F',
  },

  /** Estado activo, selección y tiradores. El único color que significa "esto está elegido". */
  interaccion: {
    naranja: '#FF6A00',
  },

  /** Negro puro; solo para la sombra simulada de las fichas. */
  sombra: '#000000',

  campo: {
    cespedBase: '#2E6B3E',
    cespedFranja: '#2A6339',
    /** Las líneas van siempre en blanco; la opacidad la pone `OPACIDAD.lineaCampo`. */
    linea: '#FFFFFF',
    marcaPunto: '#FFFFFF',
    /** Segunda línea bajo el apellido: posiciones del jugador. */
    etiquetaSecundaria: '#C9D2C9',
  },
} as const;

export const OPACIDAD = {
  lineaCampo: 0.45,
  marcaPunto: 0.55,
  /** Círculo que simula la sombra de las fichas. */
  sombraFicha: 0.28,
} as const;

/**
 * Grosor de las líneas del campo en PÍXELES de pantalla. El SVG del campo
 * trabaja en metros de cancha (viewBox 105×68), así que hay que convertirlo
 * antes de usarlo; `LineasCampo` lo hace con la escala que ya calcula para la
 * valla. No es 1.2 unidades de viewBox: eso sería una línea de 1,2 metros.
 */
export const GROSOR = {
  lineaCampoPx: 1.2,
  bordeFicha: 1.5,
  bordeSutil: 1,
} as const;

export const RADIO = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  completo: '9999px',
} as const;

/** Duraciones de transición. Nada por debajo de 120 ms ni por encima de 180 ms. */
export const DURACION = {
  rapida: '120ms',
  base: '150ms',
  lenta: '180ms',
} as const;

/** Desplazamiento del círculo de sombra de la ficha, en píxeles. */
export const SOMBRA_FICHA_OFFSET_PX = 2;
