import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  children: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
  /** Franja fija bajo el contenido, que no se desplaza con él (los avisos de la ventana Jugadas). */
  pie?: ReactNode;
}

const ANCHOS: Record<NonNullable<ModalProps['ancho']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

export function Modal({ abierto, onCerrar, titulo, children, ancho = 'md', pie }: ModalProps) {
  useEffect(() => {
    if (!abierto) return;
    function manejarEsc(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }
    document.addEventListener('keydown', manejarEsc);
    return () => document.removeEventListener('keydown', manejarEsc);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animar-entrada-tarjeta"
      role="presentation"
      onPointerDown={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`flex max-h-[85dvh] w-full ${ANCHOS[ancho]} flex-col overflow-hidden rounded-2xl border border-white/10 bg-club-carbon shadow-elevada`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-white">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-full text-club-plata hover:bg-white/10"
          >
            ✕
          </button>
        </div>
        <div className="barra-scroll overflow-y-auto p-5">{children}</div>
        {pie && <div className="shrink-0 border-t border-white/10 px-5 py-3">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}
