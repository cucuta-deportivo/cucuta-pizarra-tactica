import { useDraggable } from '@dnd-kit/core';
import { useEscalaCampo } from '../../hooks/useCampoEscala';
import type { NodoRuta } from '../../types';

export interface DatosArrastreNodo {
  tipoArrastre: 'nodo';
  trayectoriaId: string;
  nodoId: string;
}

/** Lado del área agarrable. 44px es el mínimo cómodo para un dedo en tablet. */
const LADO_TOQUE_PX = 44;
/** Lado del punto que se ve. Pequeño a propósito: marca el sitio sin tapar el campo. */
const LADO_PUNTO_PX = 14;
/** Lado del botón de borrar. Pequeño, pero dentro del área de 44px del nodo. */
const LADO_BORRAR_PX = 16;

interface Props {
  nodo: NodoRuta;
  trayectoriaId: string;
  indice: number;
  color: string;
  onEliminar: () => void;
}

/**
 * Nodo intermedio de una trayectoria. El área que responde al dedo es mucho
 * mayor que el círculo visible (§15 del encargo): agarrar un punto de 14px en
 * una tablet es imposible, pero pintar uno de 44px taparía el campo.
 *
 * Los extremos de la ruta NO usan este componente: no se guardan como nodos
 * porque son la posición de la ficha en cada fase. Para mover el inicio o el
 * final se arrastra la ficha, que es lo que ya se hacía.
 */
export function NodoRutaDraggable({ nodo, trayectoriaId, indice, color, onEliminar }: Props) {
  const { aPixeles } = useEscalaCampo();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `nodo-${nodo.id}`,
    data: { tipoArrastre: 'nodo', trayectoriaId, nodoId: nodo.id } satisfies DatosArrastreNodo,
  });

  const punto = aPixeles(nodo);
  const desplazamiento = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={`Nodo ${indice + 1} de la trayectoria`}
      title="Arrastra para mover el nodo · doble clic para quitarlo"
      onDoubleClick={onEliminar}
      onKeyDown={(evento) => {
        if (evento.key === 'Delete' || evento.key === 'Backspace') {
          evento.preventDefault();
          onEliminar();
        }
      }}
      className="absolute flex cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      style={{
        left: 0,
        top: 0,
        width: LADO_TOQUE_PX,
        height: LADO_TOQUE_PX,
        transform: `${desplazamiento} translate3d(${punto.x}px, ${punto.y}px, 0) translate(-50%, -50%)`,
        zIndex: 21,
        opacity: isDragging ? 0.75 : 1,
      }}
    >
      <span
        aria-hidden="true"
        className="rounded-full border-2 border-black/50 shadow-tarjeta"
        style={{ width: LADO_PUNTO_PX, height: LADO_PUNTO_PX, background: color }}
      />

      {/*
        Acción de borrar siempre visible y no escondida tras un doble toque: en
        tablet el doble toque sobre un elemento arrastrable es poco fiable, como
        ya nos pasó con el balón. `stopPropagation` en el pointerdown evita que
        tocar la ✕ arranque un arrastre del nodo.
      */}
      <button
        type="button"
        aria-label={`Eliminar el nodo ${indice + 1}`}
        title="Eliminar este nodo"
        onPointerDown={(evento) => evento.stopPropagation()}
        onClick={(evento) => {
          evento.stopPropagation();
          onEliminar();
        }}
        className="absolute flex items-center justify-center rounded-full border border-black/50 bg-club-rojo text-[9px] font-bold leading-none text-white shadow-tarjeta"
        style={{ width: LADO_BORRAR_PX, height: LADO_BORRAR_PX, right: 2, top: 2 }}
      >
        ✕
      </button>
    </div>
  );
}
