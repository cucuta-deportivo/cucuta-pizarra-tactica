import { forwardRef, useMemo } from 'react';
import type { Orientacion, TemaCancha } from '../../types';
import { useEscalaCampo } from '../../hooks/useCampoEscala';
import { ANCHO_CAMPO_M, LARGO_CAMPO_M } from '../../utils/constantes';
import { VENTANA_CAMPO_COMPLETO, type VentanaRecorte } from '../../utils/coordenadas';
import { COLOR, GROSOR, OPACIDAD } from '../../tokens';

interface PuntoCampo {
  u: number; // 0..ANCHO_CAMPO_M, banda a banda
  v: number; // 0..LARGO_CAMPO_M, portería propia (0) a portería rival
}

interface LineasCampoProps {
  orientacion: Orientacion;
  tema?: TemaCancha;
  mostrarEscudo?: boolean;
  mostrarValla?: boolean;
  ventana?: VentanaRecorte;
  rotado180?: boolean;
  centroOcupado?: boolean;
}

const CENTRO_U = ANCHO_CAMPO_M / 2;
const CENTRO_V = LARGO_CAMPO_M / 2;
const PROF_AREA_GRANDE = 16.5;
const ANCHO_AREA_GRANDE = 40.32;
const PROF_AREA_CHICA = 5.5;
const ANCHO_AREA_CHICA = 18.32;
const DIST_PENAL = 11;
const RADIO_CENTRAL = 9.15;
const RADIO_ARCO_PENAL = 9.15;
const RADIO_ESQUINA = 1.2;

function aplicarRotacion(p: PuntoCampo, rotado180: boolean): PuntoCampo {
  return rotado180 ? { u: p.u, v: LARGO_CAMPO_M - p.v } : p;
}

function mapear(p: PuntoCampo, orientacion: Orientacion, rotado180: boolean): { x: number; y: number } {
  const pr = aplicarRotacion(p, rotado180);
  return orientacion === 'vertical' ? { x: pr.u, y: pr.v } : { x: pr.v, y: pr.u };
}

/**
 * Equivalente a `mapear` para rectángulos: un rect definido en (u0,v0,du,dv)
 * debe intercambiar sus ejes igual que los puntos al pasar a horizontal, o
 * de lo contrario cubre solo una fracción del viewBox (el fondo de césped y
 * las bandas de valla usaban u/v como x/y directamente, sin este intercambio,
 * dejando en horizontal ~35% del largo del campo sin fondo — se veía negro).
 */
function rectUV(u0: number, v0: number, du: number, dv: number, orientacion: Orientacion): { x: number; y: number; width: number; height: number } {
  return orientacion === 'vertical' ? { x: u0, y: v0, width: du, height: dv } : { x: v0, y: u0, width: dv, height: du };
}

function aRuta(puntos: PuntoCampo[], orientacion: Orientacion, rotado180: boolean, cerrar = false): string {
  if (puntos.length === 0) return '';
  const partes = puntos.map((p, i) => {
    const { x, y } = mapear(p, orientacion, rotado180);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return partes.join(' ') + (cerrar ? ' Z' : '');
}

function generarArco(centroU: number, centroV: number, radio: number, filtro: (v: number) => boolean): PuntoCampo[] {
  const puntos: PuntoCampo[] = [];
  for (let i = 0; i <= 64; i++) {
    const angulo = (i / 64) * Math.PI * 2;
    const u = centroU + radio * Math.cos(angulo);
    const v = centroV + radio * Math.sin(angulo);
    if (filtro(v)) puntos.push({ u, v });
  }
  return puntos;
}

function generarArcoEsquina(centroU: number, centroV: number, anguloInicio: number, anguloFin: number): PuntoCampo[] {
  const puntos: PuntoCampo[] = [];
  const pasos = 12;
  for (let i = 0; i <= pasos; i++) {
    const angulo = anguloInicio + ((anguloFin - anguloInicio) * i) / pasos;
    puntos.push({ u: centroU + RADIO_ESQUINA * Math.cos(angulo), v: centroV + RADIO_ESQUINA * Math.sin(angulo) });
  }
  return puntos;
}

/**
 * Paleta por tema (FA5). Los cuatro temas derivan del par de verdes de los
 * tokens: estadio y neutro los usan tal cual, entrenamiento los aclara un punto
 * y táctico sustituye el césped por la superficie de panel. Así no queda ningún
 * verde suelto fuera del archivo de tokens.
 */
const CESPED_TEMA: Record<TemaCancha, { a: string; b: string; tintaExtremos: string | null }> = {
  estadio: { a: COLOR.campo.cespedBase, b: COLOR.campo.cespedFranja, tintaExtremos: COLOR.marca.rojo },
  neutro: { a: COLOR.campo.cespedBase, b: COLOR.campo.cespedFranja, tintaExtremos: null },
  entrenamiento: { a: COLOR.campo.cespedBase, b: COLOR.campo.cespedBase, tintaExtremos: null },
  tactico: { a: COLOR.superficie.panel, b: COLOR.superficie.panelSecundario, tintaExtremos: null },
};

/** Cuántas franjas de césped se dibujan a lo ancho del campo. */
const FRANJAS_CESPED = 8;

export const LineasCampo = forwardRef<SVGSVGElement, LineasCampoProps>(function LineasCampo(
  {
    orientacion,
    tema = 'estadio',
    mostrarEscudo = true,
    mostrarValla = true,
    ventana = VENTANA_CAMPO_COMPLETO,
    rotado180 = false,
    centroOcupado = false,
  },
  ref,
) {
  const rango = ventana.hasta - ventana.desde || 100;
  const origenV = (ventana.desde / 100) * LARGO_CAMPO_M;
  const alturaV = (rango / 100) * LARGO_CAMPO_M;
  const viewBox =
    orientacion === 'vertical' ? `0 ${origenV} ${ANCHO_CAMPO_M} ${alturaV}` : `${origenV} 0 ${alturaV} ${ANCHO_CAMPO_M}`;

  // Conversión px de pantalla -> unidades de viewBox (metros de cancha): el
  // grosor de la valla y el tamaño de sus textos deben verse igual de gruesos/
  // legibles sin importar el zoom, así que no pueden ser una constante fija en
  // metros como el resto de la geometría (que sí debe escalar con el campo).
  const escala = useEscalaCampo();
  const anchoViewBoxUnidades = orientacion === 'vertical' ? ANCHO_CAMPO_M : alturaV;
  const unidadPorPx = escala.ancho > 0 ? anchoViewBoxUnidades / escala.ancho : 0;
  const grosorValla = 12 * unidadPorPx;
  const fontValla = 8 * unidadPorPx;
  const fontRotulo = 9 * unidadPorPx;

  const geometria = useMemo(() => {
    const perimetro: PuntoCampo[] = [
      { u: 0, v: 0 },
      { u: ANCHO_CAMPO_M, v: 0 },
      { u: ANCHO_CAMPO_M, v: LARGO_CAMPO_M },
      { u: 0, v: LARGO_CAMPO_M },
    ];
    const medioCampo: PuntoCampo[] = [
      { u: 0, v: CENTRO_V },
      { u: ANCHO_CAMPO_M, v: CENTRO_V },
    ];
    const circuloCentral = generarArco(CENTRO_U, CENTRO_V, RADIO_CENTRAL, () => true);

    function areaExtremo(esInicio: boolean) {
      const vBase = esInicio ? 0 : LARGO_CAMPO_M;
      const signo = esInicio ? 1 : -1;
      const areaGrande: PuntoCampo[] = [
        { u: CENTRO_U - ANCHO_AREA_GRANDE / 2, v: vBase },
        { u: CENTRO_U - ANCHO_AREA_GRANDE / 2, v: vBase + signo * PROF_AREA_GRANDE },
        { u: CENTRO_U + ANCHO_AREA_GRANDE / 2, v: vBase + signo * PROF_AREA_GRANDE },
        { u: CENTRO_U + ANCHO_AREA_GRANDE / 2, v: vBase },
      ];
      const areaChica: PuntoCampo[] = [
        { u: CENTRO_U - ANCHO_AREA_CHICA / 2, v: vBase },
        { u: CENTRO_U - ANCHO_AREA_CHICA / 2, v: vBase + signo * PROF_AREA_CHICA },
        { u: CENTRO_U + ANCHO_AREA_CHICA / 2, v: vBase + signo * PROF_AREA_CHICA },
        { u: CENTRO_U + ANCHO_AREA_CHICA / 2, v: vBase },
      ];
      const puntoPenal: PuntoCampo = { u: CENTRO_U, v: vBase + signo * DIST_PENAL };
      const limiteArea = vBase + signo * PROF_AREA_GRANDE;
      const arco = generarArco(puntoPenal.u, puntoPenal.v, RADIO_ARCO_PENAL, (v) =>
        esInicio ? v > limiteArea : v < limiteArea,
      );
      return { areaGrande, areaChica, puntoPenal, arco };
    }

    const esquinas: PuntoCampo[][] = [
      generarArcoEsquina(0, 0, 0, Math.PI / 2),
      generarArcoEsquina(ANCHO_CAMPO_M, 0, Math.PI / 2, Math.PI),
      generarArcoEsquina(ANCHO_CAMPO_M, LARGO_CAMPO_M, Math.PI, (Math.PI * 3) / 2),
      generarArcoEsquina(0, LARGO_CAMPO_M, (Math.PI * 3) / 2, Math.PI * 2),
    ];

    return {
      perimetro,
      medioCampo,
      circuloCentral,
      inicio: areaExtremo(true),
      fin: areaExtremo(false),
      esquinas,
    };
  }, []);

  const paletaCesped = CESPED_TEMA[tema];
  const esTactico = tema === 'tactico';
  // El grosor llega en píxeles de pantalla y se convierte a unidades de viewBox
  // (metros): en el viewBox, 1.2 sería una línea de 1,2 metros de ancho.
  const trazo = {
    stroke: esTactico ? COLOR.marca.rojo : COLOR.campo.linea,
    strokeOpacity: esTactico ? 0.85 : OPACIDAD.lineaCampo,
    strokeWidth: GROSOR.lineaCampoPx * unidadPorPx,
    fill: 'none',
  } as const;
  const puntoRadio = 0.42;
  // Las franjas dividen el LARGO del campo: con el tablero apaisado (el caso
  // normal en tablet) el eje largo va de izquierda a derecha, así que se ven
  // verticales, que es lo que pide el diseño.
  const anchoFranja = LARGO_CAMPO_M / FRANJAS_CESPED;

  return (
    <svg ref={ref} viewBox={viewBox} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {mostrarValla && !esTactico && (
          <pattern id="patron-valla" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill={COLOR.superficie.fondo} />
            <rect width="2" height="4" fill={COLOR.marca.rojo} />
          </pattern>
        )}
      </defs>

      {/* Fondo del césped, con la valla incluida para que no quede un borde sin pintar. */}
      <rect
        {...rectUV(-grosorValla, -grosorValla, ANCHO_CAMPO_M + grosorValla * 2, LARGO_CAMPO_M + grosorValla * 2, orientacion)}
        fill={paletaCesped.a}
      />

      {/*
        Ocho franjas como rectángulos dentro del SVG, no como imagen de fondo ni
        como <pattern>: así escalan con el campo y sobreviven a la serialización
        que hace la exportación a PNG.
      */}
      {Array.from({ length: FRANJAS_CESPED }, (_, indice) =>
        indice % 2 === 1 ? (
          <rect
            key={`franja-${indice}`}
            {...rectUV(0, indice * anchoFranja, ANCHO_CAMPO_M, anchoFranja, orientacion)}
            fill={paletaCesped.b}
          />
        ) : null,
      )}

      {/* Tinte rojinegro sutil en las dos franjas exteriores del tema Estadio */}
      {paletaCesped.tintaExtremos && (
        <>
          <rect
            {...(orientacion === 'vertical'
              ? { x: 0, y: 0, width: ANCHO_CAMPO_M, height: anchoFranja }
              : { x: 0, y: 0, width: anchoFranja, height: ANCHO_CAMPO_M })}
            fill={paletaCesped.tintaExtremos}
            opacity={0.04}
          />
          <rect
            {...(orientacion === 'vertical'
              ? { x: 0, y: LARGO_CAMPO_M - anchoFranja, width: ANCHO_CAMPO_M, height: anchoFranja }
              : { x: LARGO_CAMPO_M - anchoFranja, y: 0, width: anchoFranja, height: ANCHO_CAMPO_M })}
            fill={paletaCesped.tintaExtremos}
            opacity={0.04}
          />
        </>
      )}

      {mostrarValla && !esTactico && (
        <g opacity="0.9">
          <rect {...rectUV(-grosorValla, -grosorValla, ANCHO_CAMPO_M + grosorValla * 2, grosorValla, orientacion)} fill="url(#patron-valla)" />
          <rect {...rectUV(-grosorValla, LARGO_CAMPO_M, ANCHO_CAMPO_M + grosorValla * 2, grosorValla, orientacion)} fill="url(#patron-valla)" />
          <rect {...rectUV(-grosorValla, -grosorValla, grosorValla, LARGO_CAMPO_M + grosorValla * 2, orientacion)} fill="url(#patron-valla)" />
          <rect {...rectUV(ANCHO_CAMPO_M, -grosorValla, grosorValla, LARGO_CAMPO_M + grosorValla * 2, orientacion)} fill="url(#patron-valla)" />
          {/* Texto "CÚCUTA DEPORTIVO" repetido (Fase B3): 3 copias espaciadas a lo
              ancho de la valla superior en vez de una sola instancia centrada. */}
          {[0.2, 0.5, 0.8].map((fraccion) => {
            const punto = mapear({ u: ANCHO_CAMPO_M * fraccion, v: -grosorValla / 2 }, orientacion, false);
            return (
              <text
                key={fraccion}
                x={punto.x}
                y={punto.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fontValla}
                fontWeight={700}
                letterSpacing={fontValla * 0.15}
                fill={COLOR.campo.linea}
                opacity={OPACIDAD.marcaPunto}
                transform={orientacion === 'horizontal' ? `rotate(-90 ${punto.x} ${punto.y})` : undefined}
              >
                CÚCUTA DEPORTIVO
              </text>
            );
          })}
        </g>
      )}

      {mostrarValla &&
        tema === 'estadio' &&
        (() => {
          const punto = mapear({ u: ANCHO_CAMPO_M - 0.5, v: LARGO_CAMPO_M + grosorValla - 0.3 }, orientacion, false);
          return (
            <text
              x={punto.x}
              y={punto.y}
              textAnchor="end"
              fontSize={fontRotulo}
              fill={COLOR.campo.etiquetaSecundaria}
              opacity={0.55}
              transform={orientacion === 'horizontal' ? `rotate(-90 ${punto.x} ${punto.y})` : undefined}
            >
              ESTADIO GENERAL SANTANDER
            </text>
          );
        })()}

      <path d={aRuta(geometria.perimetro, orientacion, rotado180, true)} {...trazo} />
      <path d={aRuta(geometria.medioCampo, orientacion, rotado180)} {...trazo} />
      <path d={aRuta(geometria.circuloCentral, orientacion, rotado180, true)} {...trazo} />
      <circle {...mapear({ u: CENTRO_U, v: CENTRO_V }, orientacion, rotado180)} r={puntoRadio} fill={COLOR.campo.marcaPunto} fillOpacity={OPACIDAD.marcaPunto} />

      {mostrarEscudo && (
        <g
          style={{ opacity: centroOcupado ? 0 : tema === 'tactico' ? 0.14 : 0.1, transition: 'opacity 150ms' }}
          transform={`translate(${mapear({ u: CENTRO_U, v: CENTRO_V }, orientacion, rotado180).x}, ${mapear({ u: CENTRO_U, v: CENTRO_V }, orientacion, rotado180).y})`}
        >
          <circle r={RADIO_CENTRAL * 0.8} fill="none" stroke={COLOR.campo.linea} strokeWidth={0.35} />
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={RADIO_CENTRAL * 0.9} fontWeight={900} fill={COLOR.campo.linea}>
            C
          </text>
        </g>
      )}

      {[geometria.inicio, geometria.fin].map((extremo, i) => (
        <g key={i}>
          <path d={aRuta(extremo.areaGrande, orientacion, rotado180, true)} {...trazo} />
          <path d={aRuta(extremo.areaChica, orientacion, rotado180, true)} {...trazo} />
          <path d={aRuta(extremo.arco, orientacion, rotado180)} {...trazo} />
          <circle {...mapear(extremo.puntoPenal, orientacion, rotado180)} r={puntoRadio} fill={COLOR.campo.marcaPunto} fillOpacity={OPACIDAD.marcaPunto} />
        </g>
      ))}

      {geometria.esquinas.map((arco, i) => (
        <path key={i} d={aRuta(arco, orientacion, rotado180)} {...trazo} />
      ))}
    </svg>
  );
});
