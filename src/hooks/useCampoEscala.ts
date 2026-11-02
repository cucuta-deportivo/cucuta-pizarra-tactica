import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Orientacion } from '../types';
import {
  pixelesAPorcentaje,
  porcentajeAPixeles,
  VENTANA_CAMPO_COMPLETO,
  type PuntoPct,
  type PuntoPx,
  type VentanaRecorte,
} from '../utils/coordenadas';

export interface EscalaCampo {
  /** Mutable a propósito: Campo asigna aquí el nodo del contenedor del campo que renderiza. */
  contenedorRef: MutableRefObject<HTMLDivElement | null>;
  ancho: number;
  alto: number;
  orientacion: Orientacion;
  /** Único punto de conversión porcentaje -> píxeles del contenedor del campo. */
  aPixeles: (punto: PuntoPct) => PuntoPx;
  /** Único punto de conversión de coordenadas de pantalla (clientX/Y) -> porcentaje. */
  aPorcentaje: (clienteX: number, clienteY: number) => PuntoPct;
}

const EscalaCampoContext = createContext<EscalaCampo | null>(null);
export const EscalaCampoProvider = EscalaCampoContext.Provider;

export function useProveerEscalaCampo(
  orientacion: Orientacion,
  ventana: VentanaRecorte = VENTANA_CAMPO_COMPLETO,
  rotado180 = false,
): EscalaCampo {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const [dimensiones, setDimensiones] = useState({ ancho: 0, alto: 0 });

  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (!entrada) return;
      setDimensiones({ ancho: entrada.contentRect.width, alto: entrada.contentRect.height });
    });
    observador.observe(el);
    setDimensiones({ ancho: el.clientWidth, alto: el.clientHeight });
    return () => observador.disconnect();
  }, []);

  // FA4 "girar la pizarra 180°": se aplica como un volteo de las coordenadas de
  // datos (x→100-x, y→100-y) en este único punto, no como transform CSS — así
  // el resto del árbol (incluidas las etiquetas de texto) nunca se dibuja al
  // revés, tal como exige el pliego.
  const aPixeles = useCallback(
    (punto: PuntoPct) => {
      const efectivo = rotado180 ? { x: 100 - punto.x, y: 100 - punto.y } : punto;
      return porcentajeAPixeles(efectivo, dimensiones, orientacion, ventana);
    },
    [dimensiones, orientacion, ventana, rotado180],
  );

  const aPorcentaje = useCallback(
    (clienteX: number, clienteY: number) => {
      const el = contenedorRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const punto = pixelesAPorcentaje({ x: clienteX - rect.left, y: clienteY - rect.top }, dimensiones, orientacion, ventana);
      return rotado180 ? { x: 100 - punto.x, y: 100 - punto.y } : punto;
    },
    [dimensiones, orientacion, ventana, rotado180],
  );

  return useMemo(
    () => ({ contenedorRef, ancho: dimensiones.ancho, alto: dimensiones.alto, orientacion, aPixeles, aPorcentaje }),
    [dimensiones, orientacion, aPixeles, aPorcentaje],
  );
}

export function useEscalaCampo(): EscalaCampo {
  const contexto = useContext(EscalaCampoContext);
  if (!contexto) throw new Error('useEscalaCampo debe usarse dentro de <Campo>.');
  return contexto;
}

/**
 * Igual que `useEscalaCampo`, pero devuelve `null` en lugar de reventar cuando
 * no hay un `<Campo>` alrededor. Es para los dibujos estáticos del campo (la
 * comparación de alineaciones, por ejemplo), que pintan la cancha sin que haya
 * nada arrastrable y por tanto sin contenedor que medir. Lo que necesita la
 * escala de verdad debe seguir usando `useEscalaCampo`, para que avise si
 * alguien lo coloca donde no toca.
 */
export function useEscalaCampoOpcional(): EscalaCampo | null {
  return useContext(EscalaCampoContext);
}
