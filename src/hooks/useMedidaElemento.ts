import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Un valor sacado de la caja de un elemento (su alto, su ancho o una cuenta con
 * él), al día cuando el elemento cambia de tamaño (ResizeObserver).
 *
 * Devuelve una ref de callback: al montarse el elemento se mide en el mismo
 * commit, antes de pintar, y al desmontarse el valor vuelve al inicial. `leer`
 * puede cambiar en cada render (se usa siempre la última).
 */
export function useMedidaElemento<T extends HTMLElement, V>(
  leer: (caja: DOMRect) => V,
  inicial: V,
): [(elemento: T | null) => void, V] {
  const [valor, setValor] = useState<V>(inicial);
  const leerRef = useRef(leer);
  const inicialRef = useRef(inicial);
  const observador = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    leerRef.current = leer;
  });

  const ref = useCallback((elemento: T | null) => {
    observador.current?.disconnect();
    observador.current = null;
    if (!elemento) {
      setValor(inicialRef.current);
      return;
    }
    const medir = () => setValor(leerRef.current(elemento.getBoundingClientRect()));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    observador.current = new ResizeObserver(medir);
    observador.current.observe(elemento);
  }, []);

  return [ref, valor];
}

/**
 * Alto en píxeles de un elemento. Se usa para que el campo deje justo el sitio
 * de las barras que flotan encima de él (la cabecera y la barra de la jugada) en
 * lugar de un alto fijo escrito a mano: con un alto fijo, en cuanto una barra
 * crecía (una fila de ayuda, un botón más alto) tapaba el borde del campo.
 */
export function useAltoElemento<T extends HTMLElement>(): [(elemento: T | null) => void, number] {
  return useMedidaElemento<T, number>((caja) => Math.ceil(caja.height), 0);
}
