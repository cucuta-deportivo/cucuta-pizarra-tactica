import { create } from 'zustand';
import type { ColorObjeto, PresetCuadricula, PuntoNormalizado, TipoDestinoRuta, TipoObjeto } from '../types';
import { ORDEN_COLOR_OBJETO, TIPOS_OBJETO } from '../utils/constantes';

export type HerramientaDistribucion = 'ninguna' | 'fila' | 'slalom' | 'rejilla';

interface PizarraCampoState {
  modoObjetoActivo: boolean;
  tipoObjetoActivo: TipoObjeto;
  colorObjetoActivo: ColorObjeto;
  herramientaDistribucion: HerramientaDistribucion;
  nDistribucion: number;
  puntoDistribucionA: PuntoNormalizado | null;
  ultimoPresetCuadricula: PresetCuadricula;
  /** Objeto de campo seleccionado (para el atajo Del/Backspace); vive aquí, no en Campo, para que el atajo global lo alcance. */
  objetoSeleccionadoId: string | null;
  /** Herramienta "Movimiento": tocar el campo va añadiendo nodos a la ruta del sujeto. */
  modoTrayectoriaActivo: boolean;
  /**
   * De quién se está editando la ruta. Sin sujeto, la herramienta solo espera a
   * que se toque una ficha; con él, cada toque en el campo añade un nodo.
   */
  sujetoTrayectoria: { tipo: TipoDestinoRuta; id: string } | null;

  activarModoObjeto: (tipo: TipoObjeto) => void;
  desactivarModoObjeto: () => void;
  setColorObjetoActivo: (color: ColorObjeto) => void;
  setHerramientaDistribucion: (h: HerramientaDistribucion) => void;
  setNDistribucion: (n: number) => void;
  setPuntoDistribucionA: (p: PuntoNormalizado | null) => void;
  setUltimoPresetCuadricula: (p: PresetCuadricula) => void;
  setObjetoSeleccionadoId: (id: string | null) => void;
  activarModoTrayectoria: () => void;
  desactivarModoTrayectoria: () => void;
  setSujetoTrayectoria: (sujeto: { tipo: TipoDestinoRuta; id: string } | null) => void;
}

export const usePizarraCampoStore = create<PizarraCampoState>((set) => ({
  modoObjetoActivo: false,
  tipoObjetoActivo: TIPOS_OBJETO[0]!,
  colorObjetoActivo: ORDEN_COLOR_OBJETO[0]!,
  herramientaDistribucion: 'ninguna',
  nDistribucion: 6,
  puntoDistribucionA: null,
  ultimoPresetCuadricula: 'juego-posicion',
  objetoSeleccionadoId: null,
  modoTrayectoriaActivo: false,
  sujetoTrayectoria: null,

  activarModoObjeto: (tipo) => set({ modoObjetoActivo: true, tipoObjetoActivo: tipo, modoTrayectoriaActivo: false }),
  desactivarModoObjeto: () =>
    set({ modoObjetoActivo: false, herramientaDistribucion: 'ninguna', puntoDistribucionA: null }),
  setColorObjetoActivo: (color) => set({ colorObjetoActivo: color }),
  setHerramientaDistribucion: (herramientaDistribucion) => set({ herramientaDistribucion, puntoDistribucionA: null }),
  setNDistribucion: (nDistribucion) => set({ nDistribucion }),
  setPuntoDistribucionA: (puntoDistribucionA) => set({ puntoDistribucionA }),
  setUltimoPresetCuadricula: (ultimoPresetCuadricula) => set({ ultimoPresetCuadricula }),
  setObjetoSeleccionadoId: (objetoSeleccionadoId) => set({ objetoSeleccionadoId }),
  // Activar Movimiento apaga el modo objeto: las dos herramientas capturan los
  // toques del campo y tenerlas a la vez dejaría el tablero impredecible.
  activarModoTrayectoria: () =>
    set({ modoTrayectoriaActivo: true, modoObjetoActivo: false, sujetoTrayectoria: null }),
  desactivarModoTrayectoria: () => set({ modoTrayectoriaActivo: false, sujetoTrayectoria: null }),
  setSujetoTrayectoria: (sujetoTrayectoria) => set({ sujetoTrayectoria }),
}));
