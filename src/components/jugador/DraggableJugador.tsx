import { useDroppable } from '@dnd-kit/core';
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useDragJugador, type OrigenArrastre } from '../../hooks/useDragJugador';
import type { Jugador } from '../../types';
import { TarjetaJugador, type TamanoTarjeta } from './TarjetaJugador';

interface DraggableJugadorProps {
  jugador: Jugador;
  origen: OrigenArrastre;
  xPct?: number;
  yPct?: number;
  esCapitan?: boolean;
  atenuado?: boolean;
  nota?: string;
  fueraDeEsquema?: boolean;
  tamano?: TamanoTarjeta;
  esSlotDestino?: boolean;
  deshabilitado?: boolean;
  onMenuContextual?: (jugadorId: string, clienteX: number, clienteY: number) => void;
}

const UMBRAL_PULSACION_LARGA_MS = 550;

export function DraggableJugador({
  jugador,
  origen,
  xPct,
  yPct,
  esCapitan = false,
  atenuado = false,
  nota,
  fueraDeEsquema = false,
  tamano = 'md',
  esSlotDestino = false,
  deshabilitado = false,
  onMenuContextual,
}: DraggableJugadorProps) {
  const { attributes, listeners, setNodeRef, isDragging, estilo } = useDragJugador(
    jugador.id,
    origen,
    xPct,
    yPct,
    deshabilitado,
  );
  const { setNodeRef: setDroppableRef } = useDroppable({
    id: `slot-${jugador.id}`,
    disabled: !esSlotDestino || deshabilitado,
  });
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Identidad estable a propósito: un callback ref inline se recrea en cada
  // render y React lo desmonta/remonta, lo que le hacía perder a dnd-kit el
  // registro de este droppable justo en medio de un arrastre (ver Campo.tsx).
  const asignarRef = useCallback(
    (nodo: HTMLDivElement | null) => {
      setNodeRef(nodo);
      if (esSlotDestino) setDroppableRef(nodo);
    },
    [setNodeRef, esSlotDestino, setDroppableRef],
  );

  function limpiarTemporizador() {
    if (temporizadorRef.current) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
  }

  function manejarPointerDown(evento: ReactPointerEvent) {
    listeners?.onPointerDown?.(evento);
    if (!onMenuContextual) return;
    const { clientX, clientY } = evento;
    temporizadorRef.current = setTimeout(() => onMenuContextual(jugador.id, clientX, clientY), UMBRAL_PULSACION_LARGA_MS);
  }

  return (
    <div
      ref={asignarRef}
      style={estilo}
      className="touch-none"
      {...attributes}
      {...listeners}
      onPointerDown={manejarPointerDown}
      onPointerUp={limpiarTemporizador}
      onPointerMove={limpiarTemporizador}
      onPointerLeave={limpiarTemporizador}
      onContextMenu={(evento) => {
        evento.preventDefault();
        onMenuContextual?.(jugador.id, evento.clientX, evento.clientY);
      }}
    >
      <TarjetaJugador
        jugador={jugador}
        tamano={tamano}
        esCapitan={esCapitan}
        atenuado={atenuado}
        nota={nota}
        fueraDeEsquema={fueraDeEsquema}
        arrastrando={isDragging}
      />
    </div>
  );
}
