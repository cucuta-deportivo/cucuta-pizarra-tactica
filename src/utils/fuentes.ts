/** Pesos de Barlow Condensed que usa lo exportado (exportar.ts): del detalle (500) al club y las iniciales (800). */
export const PESOS_BARLOW = ['500', '600', '700', '800'] as const;

/**
 * El lienzo no espera a las fuentes web: si un peso aún no se ha usado en
 * pantalla, el texto saldría en la fuente de respaldo. Se piden todos antes de
 * dibujar; si no hay red y no están guardados, la exportación sigue con el respaldo.
 */
export async function cargarFuentesBarlow(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all(PESOS_BARLOW.map((peso) => document.fonts.load(`${peso} 16px "Barlow Condensed"`))).catch(() => undefined);
}

/**
 * IV10: con red, al abrir la app, se piden esos mismos pesos para que el
 * service worker los guarde (solo guarda lo que pasa por él, y algunos no se
 * usan en pantalla). Así, sin señal, lo exportado sale con su letra aunque en
 * este dispositivo nunca se haya exportado con red.
 */
export function guardarFuentesParaSinRed(): void {
  if (navigator.onLine) void cargarFuentesBarlow();
}
