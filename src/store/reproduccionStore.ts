import { create } from 'zustand';

export type VelocidadReproduccion = 0.5 | 1 | 1.5 | 2;

export const VELOCIDADES: VelocidadReproduccion[] = [0.5, 1, 1.5, 2];

/**
 * Estado de REPRODUCCIÓN, deliberadamente separado del estado de la jugada
 * (que vive en `alineacionStore` dentro del documento). Aquí solo hay mandos:
 * nada de esto se guarda con el tablero ni entra en el historial.
 *
 * El progreso dentro de una transición NO vive aquí: cambiaría 60 veces por
 * segundo. Lo lleva `CapaReproduccion` en local, con requestAnimationFrame.
 */
interface ReproduccionState {
  reproduciendo: boolean;
  velocidad: VelocidadReproduccion;
  /** Frame que se está reproduciendo; al pausar se vuelca al documento. */
  indiceFrame: number;
  /**
   * Modo grabación: cada tanda de movimientos en el campo cierra un frame sola.
   * Vive aquí y no en el documento a propósito — es estado efímero. Si entrara
   * en el historial, "estar grabando" sería deshacible y se guardaría en disco.
   */
  grabando: boolean;
  /**
   * Instante de la jugada, en milisegundos desde su arranque. Es la posición
   * fina: de aquí salen la fase actual y el avance dentro de ella, y es lo que
   * permite arrastrar la barra a cualquier punto en vez de saltar de fase en fase.
   */
  tiempoMs: number;
  /**
   * El tablero está mostrando un instante intermedio (barra arrastrada) en vez
   * del frame que se edita. Mientras dure, el campo no se puede tocar: lo que se
   * ve es un cálculo, no un estado que se pueda guardar.
   */
  previsualizando: boolean;
  /** Dibujar las flechas de "a dónde va cada uno en la fase siguiente". */
  mostrarTrayectorias: boolean;

  reproducir: () => void;
  pausar: () => void;
  setIndiceFrame: (indice: number) => void;
  setVelocidad: (velocidad: VelocidadReproduccion) => void;
  detener: () => void;
  iniciarGrabacion: () => void;
  detenerGrabacion: () => void;
  setTiempoMs: (ms: number) => void;
  setPrevisualizando: (valor: boolean) => void;
  alternarTrayectorias: () => void;
}

export const useReproduccionStore = create<ReproduccionState>((set) => ({
  reproduciendo: false,
  velocidad: 1,
  indiceFrame: 0,
  grabando: false,
  tiempoMs: 0,
  previsualizando: false,
  mostrarTrayectorias: true,

  // Grabar y reproducir se excluyen: durante la reproducción no se puede
  // arrastrar nada, así que no habría movimientos que grabar.
  reproducir: () => set({ reproduciendo: true, grabando: false, previsualizando: false }),
  pausar: () => set({ reproduciendo: false }),
  setIndiceFrame: (indiceFrame) => set({ indiceFrame }),
  setVelocidad: (velocidad) => set({ velocidad }),
  detener: () => set({ reproduciendo: false, indiceFrame: 0, tiempoMs: 0, previsualizando: false }),
  iniciarGrabacion: () => set({ grabando: true, reproduciendo: false, previsualizando: false }),
  detenerGrabacion: () => set({ grabando: false }),
  setTiempoMs: (tiempoMs) => set({ tiempoMs: Math.max(0, tiempoMs) }),
  setPrevisualizando: (previsualizando) => set({ previsualizando }),
  alternarTrayectorias: () => set((estado) => ({ mostrarTrayectorias: !estado.mostrarTrayectorias })),
}));
