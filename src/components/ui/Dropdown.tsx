import { useEffect, useRef, useState, type ReactNode } from 'react';

interface DropdownProps {
  gatillo: (estado: { abierto: boolean; alternar: () => void }) => ReactNode;
  children: (cerrar: () => void) => ReactNode;
  alineacion?: 'izquierda' | 'derecha';
  /** Hacia dónde se abre. Arriba, para lo que vive pegado al borde de abajo (la barra de la jugada). */
  hacia?: 'abajo' | 'arriba';
  className?: string;
}

export function Dropdown({ gatillo, children, alineacion = 'izquierda', hacia = 'abajo', className = '' }: DropdownProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function manejarClicFuera(evento: PointerEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    function manejarEsc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('pointerdown', manejarClicFuera);
    document.addEventListener('keydown', manejarEsc);
    return () => {
      document.removeEventListener('pointerdown', manejarClicFuera);
      document.removeEventListener('keydown', manejarEsc);
    };
  }, [abierto]);

  return (
    <div ref={contenedorRef} className={`relative ${className}`}>
      {gatillo({ abierto, alternar: () => setAbierto((a) => !a) })}
      {abierto && (
        <div
          className={`absolute z-40 animar-entrada-tarjeta ${hacia === 'arriba' ? 'bottom-full mb-2' : 'mt-2'} ${
            alineacion === 'derecha' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}
