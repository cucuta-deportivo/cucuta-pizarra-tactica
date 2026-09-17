import { memo } from 'react';
import type { Jugador } from '../../types';
import { COLOR, GROSOR, OPACIDAD, SOMBRA_FICHA_OFFSET_PX } from '../../tokens';

/** `compacto` se usa solo con los dos equipos en pantalla (FA4 "Ambos"), donde 22 tarjetas a 64px saturan el campo. */
export type TamanoTarjeta = 'sm' | 'compacto' | 'md' | 'lg';

interface TarjetaJugadorProps {
  jugador: Jugador;
  tamano?: TamanoTarjeta;
  esCapitan?: boolean;
  seleccionado?: boolean;
  arrastrando?: boolean;
  atenuado?: boolean;
  nota?: string;
  /**
   * Hacia dónde mira, en grados de pantalla (0 = a la derecha). Se dibuja como
   * una marca en el borde y NO girando la tarjeta: rotarla pondría el dorsal y
   * las iniciales del revés, y la identidad visual del club no se toca.
   */
  rotacion?: number;
}

const DIAMETRO: Record<TamanoTarjeta, number> = { sm: 48, compacto: 56, md: 64, lg: 80 };

function obtenerIniciales(jugador: Jugador): string {
  return `${jugador.nombre.charAt(0)}${jugador.apellido.charAt(0)}`.toUpperCase();
}

export const TarjetaJugador = memo(function TarjetaJugador({
  jugador,
  tamano = 'md',
  esCapitan = false,
  seleccionado = false,
  arrastrando = false,
  atenuado = false,
  nota,
  rotacion,
}: TarjetaJugadorProps) {
  const diametro = DIAMETRO[tamano];
  return (
    /*
      El alto del bloque es EXACTAMENTE el del círculo y las etiquetas van
      absolutas por debajo. La tarjeta se ancla con translate(-50%,-50%), así que
      si las etiquetas ocupasen alto de layout el círculo se desplazaría hacia
      arriba respecto a la posición real del jugador — y con dos líneas de texto
      llegaba a montarse sobre la propia ficha.
    */
    <div
      className={`sin-seleccion relative flex items-center justify-center transition-opacity duration-base ${atenuado ? 'opacity-40' : 'opacity-100'}`}
      style={{ width: diametro + 26, height: diametro }}
    >
      {/*
        Sombra SIMULADA: un círculo detrás, desplazado. No es `box-shadow` ni un
        filtro SVG a propósito — la exportación a PNG redibuja las fichas en
        canvas y una sombra de CSS no sobreviviría, así que lo que se ve en
        pantalla y lo que sale en el PNG dejarían de coincidir.
      */}
      <div className="relative" style={{ width: diametro, height: diametro }}>
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            width: diametro,
            height: diametro,
            left: arrastrando ? SOMBRA_FICHA_OFFSET_PX * 2 : SOMBRA_FICHA_OFFSET_PX,
            top: arrastrando ? SOMBRA_FICHA_OFFSET_PX * 2 : SOMBRA_FICHA_OFFSET_PX,
            backgroundColor: COLOR.sombra,
            opacity: OPACIDAD.sombraFicha,
          }}
        />
        <div
          className="relative flex h-full w-full items-center justify-center rounded-full font-display font-extrabold text-white transition-all duration-base"
          style={{
            background: jugador.fotoUrl ? undefined : COLOR.marca.rojoFicha,
            border: `${GROSOR.bordeFicha}px solid ${COLOR.campo.linea}`,
            fontSize: diametro * 0.32,
            // Selección en NARANJA, nunca en rojo: el rojo es identidad de marca.
            // Contorno fino más un halo muy tenue, sin engordar el borde.
            outline: seleccionado ? `2px solid ${COLOR.interaccion.naranja}` : undefined,
            outlineOffset: seleccionado ? 2 : undefined,
            boxShadow: seleccionado ? `0 0 0 6px ${COLOR.interaccion.naranja}22` : undefined,
          }}
        >
        {jugador.fotoUrl ? (
          <img src={jugador.fotoUrl} alt="" className="h-full w-full rounded-full object-cover" draggable={false} />
        ) : (
          obtenerIniciales(jugador)
        )}

        {jugador.dorsal != null && (
          <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-club-negro px-1 font-display text-[11px] font-bold text-white ring-1 ring-white/30">
            {jugador.dorsal}
          </span>
        )}

        {typeof rotacion === 'number' && (
          <span
            aria-hidden="true"
            data-orientacion={Math.round(rotacion)}
            className="pointer-events-none absolute inset-0 flex items-center justify-start"
            style={{ transform: `rotate(${rotacion}deg)` }}
          >
            <span
              className="absolute rounded-full bg-white shadow-tarjeta"
              style={{
                width: diametro * 0.17,
                height: diametro * 0.17,
                left: '100%',
                marginLeft: -diametro * 0.1,
                border: `2px solid ${COLOR.sombra}`,
              }}
            />
          </span>
        )}

        {esCapitan && (
          <span
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-club-negro ring-1 ring-white/40"
            title="Capitán"
            aria-label="Capitán"
          >
            C
          </span>
        )}

        {nota && (
          <span
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] ring-1 ring-white/40"
            title={nota}
            aria-label={`Nota: ${nota}`}
          >
            📝
          </span>
        )}
        </div>
      </div>

      {/*
        Apellido directamente sobre el césped, sin recuadro, y debajo la línea de
        posiciones. Ambas absolutas: no participan en el centrado de la ficha.
      */}
      <div className="pointer-events-none absolute left-0 right-0 top-full flex flex-col items-center pt-1">
        <span
          className="w-full truncate text-center font-display text-[11px] font-semibold uppercase leading-tight tracking-wide sm:text-xs"
          style={{ color: COLOR.campo.linea }}
        >
          {jugador.apellido}
        </span>
        <span
          className="w-full truncate text-center font-display text-[9px] font-semibold uppercase leading-tight tracking-wide"
          style={{ color: COLOR.campo.etiquetaSecundaria }}
        >
          {[jugador.posicionNatural, jugador.posicionesSecundarias[0]].filter(Boolean).join(' · ')}
        </span>
      </div>
    </div>
  );
});
