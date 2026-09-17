import type {
  ColorObjeto,
  Herramienta,
  PaletaRival,
  PresetCuadricula,
  Posicion,
  TemaCancha,
  TipoObjeto,
} from '../types';

export const ETIQUETAS_POSICION: Record<Posicion, string> = {
  POR: 'Portero',
  LD: 'Lateral derecho',
  DFC: 'Defensa central',
  LI: 'Lateral izquierdo',
  MCD: 'Mediocentro defensivo',
  MC: 'Mediocentro',
  MCO: 'Mediocentro ofensivo',
  MD: 'Interior/Carrilero derecho',
  MI: 'Interior/Carrilero izquierdo',
  ED: 'Extremo derecho',
  EI: 'Extremo izquierdo',
  SD: 'Segundo delantero',
  DC: 'Delantero centro',
};

export const ORDEN_POSICION: Posicion[] = [
  'POR',
  'LD',
  'LI',
  'DFC',
  'MCD',
  'MC',
  'MD',
  'MI',
  'MCO',
  'ED',
  'EI',
  'SD',
  'DC',
];

export const PALETA_DIBUJO: string[] = [
  '#D4111E',
  '#FFFFFF',
  '#FFC107',
  '#2DD4BF',
  '#3B82F6',
  '#111111',
];

export const GROSORES_DIBUJO: Array<1 | 2 | 3> = [1, 2, 3];

export const HERRAMIENTAS_DIBUJO: Array<{ id: Herramienta; etiqueta: string }> = [
  { id: 'libre', etiqueta: 'Trazo libre' },
  { id: 'flecha', etiqueta: 'Flecha' },
  { id: 'discontinua', etiqueta: 'Línea discontinua' },
  { id: 'zona', etiqueta: 'Zona' },
  { id: 'texto', etiqueta: 'Texto' },
  { id: 'borrador', etiqueta: 'Borrador' },
];

export const CAPACIDAD_BANQUILLO = 12;
export const LIMITE_HISTORIAL = 50;
export const DEBOUNCE_AUTOGUARDADO_MS = 1000;
/**
 * Grabación de jugadas: pausa sin tocar el campo que cierra el frame en curso.
 * Los movimientos más seguidos que esto se agrupan en un mismo paso, para que
 * una línea entera se pueda mover a la vez sin que cada jugador abra su frame.
 */
export const PAUSA_GRABACION_MS = 700;
export const LARGO_CAMPO_M = 105;
export const ANCHO_CAMPO_M = 68;

// --- Anexo A: objetos de entrenamiento (FA1) ---

export const LIMITE_OBJETOS = 60;
export const AVISO_LIMITE_OBJETOS = 50;

export const ETIQUETAS_OBJETO: Record<TipoObjeto, string> = {
  cono: 'Cono',
  cono_plano: 'Cono plano / seta',
  pica: 'Pica',
  escalera: 'Escalera de coordinación',
  mini_porteria: 'Mini-portería',
  aro: 'Aro',
  maniqui: 'Maniquí',
};

export const TIPOS_OBJETO: TipoObjeto[] = ['cono', 'cono_plano', 'pica', 'escalera', 'mini_porteria', 'aro', 'maniqui'];

export const TIPOS_OBJETO_ROTABLES: ReadonlySet<TipoObjeto> = new Set<TipoObjeto>(['maniqui', 'mini_porteria']);

export const COLORES_OBJETO: Record<ColorObjeto, string> = {
  naranja: '#F97316',
  amarillo: '#FACC15',
  blanco: '#F5F5F5',
  rojo: '#D4111E',
  negro: '#111111',
};

export const ORDEN_COLOR_OBJETO: ColorObjeto[] = ['naranja', 'amarillo', 'blanco', 'rojo', 'negro'];

// --- Anexo A: balón (FA2) ---

export const LIMITE_BALONES = 5;
export const DIAMETRO_BALON_PX = 22;
/** Desplazamiento visual (en % del campo) del balón anclado respecto al jugador que lo posee — "en su pie derecho". */
export const OFFSET_BALON_ANCLADO = { x: 2.5, y: 2.2 };

// --- Anexo A: cuadrícula y zonas (FA3) ---

export interface DefinicionPresetCuadricula {
  etiqueta: string;
  columnas: number;
  filas: number;
}

export const DEFINICION_PRESETS_CUADRICULA: Record<Exclude<PresetCuadricula, 'personalizada'>, DefinicionPresetCuadricula> = {
  off: { etiqueta: 'Sin cuadrícula', columnas: 0, filas: 0 },
  tercios: { etiqueta: 'Tercios', columnas: 1, filas: 3 },
  'carriles-5': { etiqueta: '5 carriles', columnas: 5, filas: 1 },
  'juego-posicion': { etiqueta: 'Juego de posición (5×4)', columnas: 5, filas: 4 },
  'zonas-12': { etiqueta: '12 zonas', columnas: 3, filas: 4 },
  'zonas-18': { etiqueta: '18 zonas', columnas: 3, filas: 6 },
  mitades: { etiqueta: 'Mitades', columnas: 1, filas: 2 },
};

export const ETIQUETAS_CARRILES_5 = ['LI', 'II', 'C', 'ID', 'LD'];

export const OPACIDAD_CUADRICULA_DEFECTO = 0.18;
export const OPACIDAD_CUADRICULA_MAXIMA = 0.6;

// --- Anexo A: equipo rival (FA4) ---

export const PALETA_RIVAL: Record<PaletaRival, { principal: string; texto: string }> = {
  blanco: { principal: '#E5E7EB', texto: '#111111' },
  gris: { principal: '#6B7280', texto: '#FFFFFF' },
  azul: { principal: '#3B82F6', texto: '#FFFFFF' },
};

export const ETIQUETAS_PALETA_RIVAL: Record<PaletaRival, string> = {
  blanco: 'Blanco',
  gris: 'Gris pizarra',
  azul: 'Azul acero',
};

// --- Anexo A: identidad de cancha (FA5) ---

export const ETIQUETAS_TEMA_CANCHA: Record<TemaCancha, string> = {
  estadio: 'Estadio',
  neutro: 'Neutro',
  entrenamiento: 'Entrenamiento',
  tactico: 'Táctico',
};
