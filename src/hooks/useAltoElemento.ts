import { useCallback, useRef, useState } from 'react';

/**
 * Alto en píxeles de un elemento, al día cuando cambia (ResizeObserver). Se usa
 * para que el campo deje justo el sitio de las barras que flotan encima de él
 * (la cabecera y la barra de la jugada) en lugar de un alto fijo escrito a mano:
 * con un alto fijo, en cuanto una barra crecía (una fila de ayuda, un botón más
 * alto) tapaba el borde del campo.
 *
 * Devuelve una ref de callback: al montarse el elemento se mide en el mismo
 * commit, antes de pintar, y al desmontarse el alto vuelve a 0.
 */
export function useAltoElemento<T extends HTMLElement>(): [(elemento: T | null) => void, number] {
  const [alto, setAlto] = useState(0);
  const observador = useRef<ResizeObserver | null>(null);

  const ref = useCallback((elemento: T | null) => {
    observador.current?.disconnect();
    observador.current = null;
    if (!elemento) {
      setAlto(0);
      return;
    }
    const medir = () => setAlto(Math.ceil(elemento.getBoundingClientRect().height));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    observador.current = new ResizeObserver(medir);
    observador.current.observe(elemento);
  }, []);

  return [ref, alto];
}
