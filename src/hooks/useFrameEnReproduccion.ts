import { useAlineacionStore } from '../store/alineacionStore';
import { useReproduccionStore } from '../store/reproduccionStore';
import type { FrameTactico } from '../types';

/**
 * La fase que se está viendo mientras la jugada se anima (reproduciendo o con la
 * barra arrastrada); `undefined` mientras se edita, que es cuando manda el
 * documento. Dibujos y celdas pintadas viven en cada fase, así que durante la
 * animación hay que mostrar los de la fase que se ve, no los de la que se edita.
 * Se dirige con el índice de fase (cambia una vez por tramo) y no con el reloj,
 * que cambiaría 60 veces por segundo y re-renderizaría todo el campo.
 *
 * Vive aparte de `Campo` para que la prueba del reinicio de la jugada use este
 * mismo cálculo y no una copia.
 */
export function useFrameEnReproduccion(): FrameTactico | undefined {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);
  const previsualizando = useReproduccionStore((s) => s.previsualizando);
  const indiceFrame = useReproduccionStore((s) => s.indiceFrame);
  return reproduciendo || previsualizando ? secuencia?.frames[indiceFrame] : undefined;
}
