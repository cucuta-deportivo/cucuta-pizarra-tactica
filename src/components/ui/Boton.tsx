import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'peligroSuave';
type Tamano = 'sm' | 'md' | 'lg' | 'icono';

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  activo?: boolean;
}

const CLASES_VARIANTE: Record<Variante, string> = {
  primario: 'bg-club-rojo text-white hover:bg-club-rojo-oscuro',
  secundario: 'bg-white/5 text-club-plata hover:bg-white/10',
  fantasma: 'bg-transparent text-club-plata hover:bg-white/10',
  peligro: 'bg-red-950 text-red-200 hover:bg-red-900',
  // Peligroso pero sin llamar la atención: solo el texto en rojo (F5.4b, «Borrar» de la barra de la jugada).
  peligroSuave: 'bg-white/5 text-red-300 hover:bg-red-950/60',
};

const CLASES_TAMANO: Record<Tamano, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  icono: 'h-11 w-11 justify-center px-0',
};

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  { variante = 'secundario', tamano = 'md', activo = false, className = '', children, ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex min-w-[44px] items-center justify-center rounded-lg font-medium',
        'transition-all duration-rapido active:scale-95 disabled:pointer-events-none disabled:opacity-40',
        activo ? 'ring-2 ring-club-rojo bg-club-rojo/20 text-white' : CLASES_VARIANTE[variante],
        CLASES_TAMANO[tamano],
        className,
      ].join(' ')}
      {...resto}
    >
      {children}
    </button>
  );
});
