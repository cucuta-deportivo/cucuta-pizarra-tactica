import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useDragEnCampo } from '../../hooks/useDragEnCampo';
import { DIAMETRO_BALON_PX } from '../../utils/constantes';
import type { Balon } from '../../types';

export interface DatosArrastreBalon {
  tipoArrastre: 'balon';
  balonId: string;
  [clave: string]: unknown;
}

interface BalonDraggableProps {
  balon: Balon;
  xPct: number;
  yPct: number;
  deshabilitado?: boolean;
  /** Delta en vivo del jugador que posee este balón, mientras se le arrastra (ver useDragEnCampo). */
  deltaExterno?: { x: number; y: number };
  onDevolverCentro: () => void;
  onLiberar: () => void;
  onMenuContextual: (clienteX: number, clienteY: number) => void;
}

const UMBRAL_PULSACION_LARGA_MS = 550;
const UMBRAL_DOBLE_TOQUE_MS = 300;
const UMBRAL_MOVIMIENTO_DOBLE_TOQUE = 12;

export function BalonDraggable({ balon, xPct, yPct, deshabilitado, deltaExterno, onDevolverCentro, onLiberar, onMenuContextual }: BalonDraggableProps) {
  const { attributes, listeners, setNodeRef, estilo, isDragging } = useDragEnCampo(
    `balon-${balon.id}`,
    xPct,
    yPct,
    { tipoArrastre: 'balon', balonId: balon.id } satisfies DatosArrastreBalon,
    deshabilitado,
    // Anclado, el balón cae dentro de la tarjeta del jugador (z-index 10): por
    // debajo quedaba tapado y no recibía ningún evento — ni doble toque, ni
    // pulsación larga, ni arrastre —, y solo se podía soltar deshaciendo.
    balon.jugadorPoseedorId ? 11 : 6,
    deltaExterno,
  );
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoToqueRef = useRef<{ instante: number; x: number; y: number } | null>(null);

  function limpiarTemporizador(): void {
    if (temporizadorRef.current) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
  }

  function manejarPointerDown(evento: ReactPointerEvent): void {
    listeners?.onPointerDown?.(evento);
    const { clientX, clientY } = evento;

    // El doble toque se detecta a mano sobre los pointer events: dnd-kit llama a
    // preventDefault() en el pointerdown del activador y eso suprime los eventos
    // de ratón sintéticos, así que `onDoubleClick` nunca llega a dispararse sobre
    // un draggable (comprobado: 0 eventos recibidos incluso en fase de captura).
    // Como exige un segundo toque casi en el mismo punto, un arrastre real (que
    // supera el umbral de 8px de dnd-kit) nunca se confunde con un doble toque.
    const anterior = ultimoToqueRef.current;
    const ahora = Date.now();
    const esDobleToque =
      anterior !== null &&
      ahora - anterior.instante < UMBRAL_DOBLE_TOQUE_MS &&
      Math.hypot(clientX - anterior.x, clientY - anterior.y) < UMBRAL_MOVIMIENTO_DOBLE_TOQUE;

    if (esDobleToque) {
      ultimoToqueRef.current = null;
      limpiarTemporizador();
      // Anclado: soltarlo del jugador y dejarlo donde está. Suelto: al centro (FA2).
      if (balon.jugadorPoseedorId) onLiberar();
      else onDevolverCentro();
      return;
    }

    ultimoToqueRef.current = { instante: ahora, x: clientX, y: clientY };
    temporizadorRef.current = setTimeout(() => onMenuContextual(clientX, clientY), UMBRAL_PULSACION_LARGA_MS);
  }

  // Suelto, el relleno lleva la zona táctil a 44 px sin cambiar el dibujo. En
  // posesión no: taparía el centro de la ficha de su jugador y le quitaría los
  // toques; se suelta con doble toque o desde su menú.
  return (
    <div
      ref={setNodeRef}
      style={estilo}
      className={`touch-none ${balon.jugadorPoseedorId ? '' : 'p-[11px]'}`}
      {...attributes}
      {...listeners}
      onPointerDown={manejarPointerDown}
      onPointerUp={limpiarTemporizador}
      onPointerMove={limpiarTemporizador}
      onPointerLeave={limpiarTemporizador}
      onContextMenu={(evento) => {
        evento.preventDefault();
        onMenuContextual(evento.clientX, evento.clientY);
      }}
    >
      <svg
        width={DIAMETRO_BALON_PX}
        height={DIAMETRO_BALON_PX * 1.35}
        viewBox="0 0 24 32"
        className={`pointer-events-none ${isDragging ? 'drop-shadow-[0_6px_6px_rgba(0,0,0,0.5)]' : 'drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]'}`}
        aria-hidden="true"
      >
        <ellipse cx="12" cy="27" rx="7" ry="2.4" fill="#000000" opacity="0.35" />
        <circle cx="12" cy="12" r="10" fill="#F5F5F5" stroke="#111111" strokeWidth="0.75" />
        <polygon points="12,6 15,8.3 14,11.8 10,11.8 9,8.3" fill="#111111" />
        <path d="M12 6 L9.5 4 M12 6 L14.5 4 M10 11.8 L7 13 M14 11.8 L17 13 M9 8.3 L5.5 8" stroke="#111111" strokeWidth="0.6" fill="none" />
      </svg>
    </div>
  );
}
