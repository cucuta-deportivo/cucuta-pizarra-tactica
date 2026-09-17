import { useEffect, useRef } from 'react';
import { useEscalaCampo } from '../../hooks/useCampoEscala';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { usePizarraCampoStore } from '../../store/pizarraCampoStore';
import { dibujarTrazo } from '../../utils/renderTrazos';
import { posicionEfectivaBalon } from '../../utils/balon';
import { muestrearRuta, puntosDeControl, trayectoriaDe } from '../../utils/trayectorias';
import type { PuntoNormalizado, TipoDestinoRuta, TrayectoriaMovimiento } from '../../types';

/** Movimientos por debajo de este umbral (en % de campo) no se señalan: son ruido de arrastre. */
const MINIMO_DESPLAZAMIENTO = 1.5;

const COLOR_JUGADOR = '#FFFFFF';
const COLOR_RIVAL = '#9AA3AE';
const COLOR_BALON = '#D4111E';
const COLOR_OBJETO = '#F59E0B';
/** Radio del punto que marca cada nodo intermedio. */
const RADIO_NODO_PX = 3.5;

/**
 * Flechas de "a dónde va cada cosa en el paso siguiente". Solo se ven mientras
 * se edita la jugada: durante la reproducción sobran, porque el movimiento ya
 * se está viendo.
 *
 * El origen se toma del documento en pantalla y no del frame guardado, para que
 * la flecha siga al jugador mientras se arrastra en vez de esperar a que el
 * frame se vuelque. El destino sí sale del frame siguiente, que es lo único que
 * define hacia dónde va.
 *
 * Dibuja con `dibujarTrazo`, el mismo motor que usa la pizarra: aquí no hay un
 * sistema de dibujo nuevo, solo trazos sintéticos que nunca se guardan.
 */
export function CapaTrayectorias() {
  const documento = useAlineacionStore((s) => s.historial.presente);
  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);
  const mostrarTrayectorias = useReproduccionStore((s) => s.mostrarTrayectorias);
  // Los nodos que se pintan aquí son la referencia visual de la curva; los
  // agarrables los pone Campo encima. Solo se marcan en la ruta en edición (§6).
  const sujetoTrayectoria = usePizarraCampoStore((s) => s.sujetoTrayectoria);
  const { aPixeles, ancho, alto } = useEscalaCampo();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const secuencia = documento.secuencia;
  const siguiente = secuencia?.frames[secuencia.indiceActivo + 1];
  // Las rutas viven en el frame donde ARRANCAN, no en el de destino.
  const rutas = secuencia?.frames[secuencia.indiceActivo]?.trayectorias;
  const visible = Boolean(siguiente) && !reproduciendo && mostrarTrayectorias;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(ancho * dpr));
    canvas.height = Math.max(1, Math.round(alto * dpr));
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${alto}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    if (!visible || !siguiente) return;

    function flecha(desde: PuntoNormalizado, hasta: PuntoNormalizado, color: string, grosor: 1 | 2 | 3, opacidad: number): void {
      if (Math.hypot(hasta.x - desde.x, hasta.y - desde.y) < MINIMO_DESPLAZAMIENTO) return;
      ctx!.globalAlpha = opacidad;
      dibujarTrazo(ctx!, { id: 'trayectoria', tipo: 'flecha', puntos: [desde, hasta], color, grosor }, aPixeles);
      ctx!.globalAlpha = 1;
    }

    /**
     * Recorrido por nodos: el cuerpo se pinta como polilínea muestreada de la
     * curva y la punta como una flecha entre las dos últimas muestras, para que
     * apunte en la dirección real de llegada y no hacia el último nodo.
     */
    function ruta(
      desde: PuntoNormalizado,
      hasta: PuntoNormalizado,
      trayectoria: TrayectoriaMovimiento,
      color: string,
      grosor: 1 | 2 | 3,
      opacidad: number,
      seleccionada: boolean,
    ): void {
      const muestreada = muestrearRuta(puntosDeControl(desde, trayectoria.nodos, hasta), trayectoria.interpolacion);
      if (muestreada.longitud < MINIMO_DESPLAZAMIENTO) return;

      ctx!.globalAlpha = opacidad;
      dibujarTrazo(ctx!, { id: 'ruta', tipo: 'libre', puntos: muestreada.puntos, color, grosor }, aPixeles);

      const puntos = muestreada.puntos;
      const punta = puntos[puntos.length - 1]!;
      const previo = puntos[Math.max(0, puntos.length - 6)]!;
      dibujarTrazo(ctx!, { id: 'punta', tipo: 'flecha', puntos: [previo, punta], color, grosor }, aPixeles);

      if (!seleccionada) {
        ctx!.globalAlpha = 1;
        return;
      }
      // Los nodos, como circulitos sobre la línea.
      ctx!.fillStyle = color;
      for (const nodo of trayectoria.nodos) {
        const px = aPixeles(nodo);
        ctx!.beginPath();
        ctx!.arc(px.x, px.y, RADIO_NODO_PX, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    /** Con recorrido por nodos manda ese; sin él, la recta de siempre. */
    function dibujar(
      desde: PuntoNormalizado,
      hasta: PuntoNormalizado,
      tipo: TipoDestinoRuta,
      id: string,
      color: string,
      grosor: 1 | 2 | 3,
      opacidad: number,
    ): void {
      const trayectoria = trayectoriaDe(siguiente ? rutas : undefined, tipo, id);
      if (trayectoria && trayectoria.nodos.length > 0) {
        // Con la ruta oculta no se cae a la flecha recta: el recorrido sigue
        // existiendo y mandando en la reproducción, solo que no se dibuja (§24).
        if (!trayectoria.mostrarRuta) return;
        const seleccionada =
          sujetoTrayectoria?.tipo === tipo && sujetoTrayectoria?.id === id && trayectoria.mostrarNodos !== false;
        ruta(desde, hasta, trayectoria, color, grosor, opacidad, seleccionada);
        return;
      }
      flecha(desde, hasta, color, grosor, opacidad);
    }

    for (const titular of documento.titulares) {
      const destino = siguiente.titulares.find((t) => t.jugadorId === titular.jugadorId);
      if (destino) dibujar(titular, destino, 'titular', titular.jugadorId, COLOR_JUGADOR, 2, 0.55);
    }

    for (const rival of documento.rival?.jugadores ?? []) {
      const destino = siguiente.jugadoresRival.find((r) => r.id === rival.id);
      if (destino) dibujar(rival, destino, 'rival', rival.id, COLOR_RIVAL, 1, 0.45);
    }

    for (const objeto of documento.objetos) {
      const destino = siguiente.objetos.find((o) => o.id === objeto.id);
      if (destino) dibujar(objeto, destino, 'objeto', objeto.id, COLOR_OBJETO, 1, 0.5);
    }

    for (const balon of documento.balones) {
      const destino = siguiente.balones.find((b) => b.id === balon.id);
      if (!destino) continue;
      dibujar(
        posicionEfectivaBalon(balon, documento.titulares),
        posicionEfectivaBalon(destino, siguiente.titulares),
        'balon',
        balon.id,
        COLOR_BALON,
        3,
        0.9,
      );
    }
  }, [documento, siguiente, rutas, sujetoTrayectoria, visible, ancho, alto, aPixeles]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" style={{ zIndex: 4 }} aria-hidden="true" />;
}
