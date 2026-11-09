import { create } from 'zustand';
import { generarId } from '../utils/id';

export type TipoToast = 'info' | 'exito' | 'error';

export interface Toast {
  id: string;
  tipo: TipoToast;
  mensaje: string;
  accion?: { etiqueta: string; ejecutar: () => void };
  /** No se cierra solo: para avisos que no se pueden perder (por ejemplo, que el trabajo quedó en una copia). */
  fijo?: boolean;
}

export type OrientacionForzada = 'auto' | 'vertical' | 'horizontal';

interface UiState {
  toasts: Toast[];
  mostrarToast: (toast: Omit<Toast, 'id'>) => void;
  cerrarToast: (id: string) => void;

  drawerPlantillaAbierto: boolean;
  abrirDrawerPlantilla: () => void;
  cerrarDrawerPlantilla: () => void;

  pantallaCompleta: boolean;
  setPantallaCompleta: (valor: boolean) => void;

  orientacionForzada: OrientacionForzada;
  setOrientacionForzada: (valor: OrientacionForzada) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  mostrarToast: (toast) => {
    const id = generarId();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (toast.tipo !== 'error' && !toast.fijo) {
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
    }
  },
  cerrarToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  drawerPlantillaAbierto: false,
  abrirDrawerPlantilla: () => set({ drawerPlantillaAbierto: true }),
  cerrarDrawerPlantilla: () => set({ drawerPlantillaAbierto: false }),

  pantallaCompleta: false,
  setPantallaCompleta: (valor) => set({ pantallaCompleta: valor }),

  orientacionForzada: 'auto',
  setOrientacionForzada: (valor) => set({ orientacionForzada: valor }),
}));
