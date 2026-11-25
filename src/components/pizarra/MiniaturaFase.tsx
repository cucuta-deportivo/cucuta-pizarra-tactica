import type { FrameTactico, PaletaRival } from '../../types';
import { PALETA_RIVAL } from '../../utils/constantes';
import { COLOR } from '../../tokens';

/** Campo de 105 × 68 m, apaisado como en la tablet: la portería propia a la izquierda. */
const LARGO = 105;
const ANCHO = 68;

/** Del dato (x de banda a banda, y de portería a portería, 0–100) al dibujo. */
const enX = (y: number) => (y / 100) * LARGO;
const enY = (x: number) => (x / 100) * ANCHO;

interface Props {
  fase: Pick<FrameTactico, 'titulares' | 'jugadoresRival' | 'balones' | 'trazos'>;
  paletaRival: PaletaRival;
}

/**
 * Miniatura de una fase para reconocer la jugada en la lista: líneas del campo,
 * los nuestros en rojo, el rival en su color, el balón y los dibujos como trazos
 * finos. Sin fichas ni textos: a este tamaño no se leerían.
 */
export function MiniaturaFase({ fase, paletaRival }: Props) {
  const rival = PALETA_RIVAL[paletaRival].principal;
  return (
    <svg viewBox={`0 0 ${LARGO} ${ANCHO}`} className="block h-full w-full" aria-hidden="true">
      <rect width={LARGO} height={ANCHO} fill={COLOR.campo.cespedBase} />
      <g fill="none" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={0.6}>
        <rect x={0.5} y={0.5} width={LARGO - 1} height={ANCHO - 1} />
        <line x1={LARGO / 2} y1={0.5} x2={LARGO / 2} y2={ANCHO - 0.5} />
        <circle cx={LARGO / 2} cy={ANCHO / 2} r={9.15} />
        <rect x={0.5} y={(ANCHO - 40.32) / 2} width={16.5} height={40.32} />
        <rect x={LARGO - 17} y={(ANCHO - 40.32) / 2} width={16.5} height={40.32} />
      </g>
      {fase.trazos
        .filter((t) => t.tipo !== 'texto' && t.puntos.length > 1)
        .map((t) => (
          <polyline
            key={t.id}
            points={t.puntos.map((p) => `${enX(p.y)},${enY(p.x)}`).join(' ')}
            fill="none"
            stroke={t.color}
            strokeWidth={0.8 + t.grosor * 0.4}
            strokeDasharray={t.tipo === 'discontinua' ? '2 1.5' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      {fase.jugadoresRival.map((j) => (
        <circle key={j.id} cx={enX(j.y)} cy={enY(j.x)} r={2.6} fill={rival} stroke="#111111" strokeWidth={0.5} />
      ))}
      {fase.titulares.map((j) => (
        <circle key={j.jugadorId} cx={enX(j.y)} cy={enY(j.x)} r={2.6} fill={COLOR.marca.rojo} stroke="#FFFFFF" strokeWidth={0.6} />
      ))}
      {fase.balones.map((b) => (
        <circle key={b.id} cx={enX(b.y)} cy={enY(b.x)} r={1.4} fill="#FFFFFF" stroke="#111111" strokeWidth={0.4} />
      ))}
    </svg>
  );
}
