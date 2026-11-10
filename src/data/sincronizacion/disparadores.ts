/**
 * Cuándo se sincroniza sola la app (S1.10), además de al abrir y tras guardar:
 * al volver la señal, al volver a la pestaña y cada cierto tiempo mientras se
 * ve. Sin Realtime: así la tablet ve los cambios de la oficina en menos de un
 * minuto sin recargar.
 */

/** Cada 45 s: con los 5 s que espera quien guarda antes de subir, el cambio se ve en menos de un minuto. */
export const INTERVALO_COMPROBACION_MS = 45_000;

interface Entorno {
  ventana: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  documento: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { visibilityState: DocumentVisibilityState };
}

/** Empieza a escuchar; devuelve cómo parar. */
export function iniciarDisparadores({
  sincronizar,
  comprobar,
  alPerderRed,
  entorno,
  intervaloMs = INTERVALO_COMPROBACION_MS,
}: {
  sincronizar: () => void;
  comprobar: () => void;
  alPerderRed: () => void;
  entorno: Entorno;
  intervaloMs?: number;
}): () => void {
  const { ventana, documento } = entorno;
  let reloj: ReturnType<typeof setInterval> | null = null;

  const arrancarReloj = () => {
    if (reloj === null) reloj = setInterval(comprobar, intervaloMs);
  };
  const pararReloj = () => {
    if (reloj !== null) clearInterval(reloj);
    reloj = null;
  };
  // Oculta (otra pestaña, tablet bloqueada) no gasta datos; al volver, se mira enseguida.
  const alCambiarVisibilidad = () => {
    if (documento.visibilityState === 'visible') {
      comprobar();
      arrancarReloj();
    } else {
      pararReloj();
    }
  };

  ventana.addEventListener('online', sincronizar);
  ventana.addEventListener('offline', alPerderRed);
  documento.addEventListener('visibilitychange', alCambiarVisibilidad);
  if (documento.visibilityState === 'visible') arrancarReloj();

  return () => {
    ventana.removeEventListener('online', sincronizar);
    ventana.removeEventListener('offline', alPerderRed);
    documento.removeEventListener('visibilitychange', alCambiarVisibilidad);
    pararReloj();
  };
}

/**
 * La comprobación periódica, barata: si hay algo por subir, sincroniza; si no,
 * pregunta solo cuándo cambió algo por última vez en el servidor y sincroniza
 * únicamente si no es lo que vio la última vuelta completa.
 */
export function crearComprobador({
  contarPendientes,
  ultimaActualizacion,
  sincronizar,
}: {
  contarPendientes: () => Promise<number>;
  ultimaActualizacion: () => Promise<string | null>;
  sincronizar: () => Promise<unknown>;
}) {
  // `undefined`: todavía no hubo ninguna vuelta completa.
  let vista: string | null | undefined;
  return {
    /** Lo que vio la última vuelta completa que terminó al día. */
    recordar(ultima: string | null): void {
      vista = ultima;
    },
    /** Lanza `ErrorSinConexion` sin red. */
    async comprobar(): Promise<'sincronizada' | 'sin-cambios'> {
      if ((await contarPendientes()) > 0) {
        await sincronizar();
        return 'sincronizada';
      }
      const ultima = await ultimaActualizacion();
      if (vista !== undefined && ultima === vista) return 'sin-cambios';
      await sincronizar();
      return 'sincronizada';
    },
  };
}
