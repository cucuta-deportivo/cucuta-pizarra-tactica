import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

/** Campo de 44 px de alto. Sin ancho: lo pone quien lo usa (fijo en la barra, todo el ancho en el menú). */
export const CLASE_CAMPO =
  'h-11 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-club-plata/40 outline-none focus:border-club-rojo disabled:opacity-40';

/**
 * Guarda lo que haya a medias en un campo de texto antes de una acción. En el
 * iPad tocar un botón no le quita el foco al campo: sin esto, un nombre a medias
 * acabaría en otra fase (tras borrar) o se perdería.
 */
export function soltarFoco(): void {
  if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
}

/**
 * Campo de texto que guarda al salir de él, con Intro o al desmontarse (se cierra
 * el menú, se cambia de fase con una pestaña). Lo último importa: el campo puede
 * desaparecer sin que el navegador avise de que pierde el foco, y lo escrito se
 * perdería. Para el nombre de una fase se monta con `key` = id de la fase, así lo
 * pendiente se guarda en SU fase al cambiar de otra.
 */
export function CampoDiferido({
  valor,
  alConfirmar,
  className = '',
  ...resto
}: { valor: string; alConfirmar: (texto: string) => void } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur'
>) {
  const [texto, setTexto] = useState(valor);
  // Lo escrito y no guardado, y cómo guardarlo con los datos del último render (la fase a la que pertenece).
  const pendiente = useRef<string | null>(null);
  const guardarRef = useRef<() => void>(() => {});
  const guardar = () => {
    if (pendiente.current !== null && pendiente.current !== valor) alConfirmar(pendiente.current);
    pendiente.current = null;
  };

  useEffect(() => {
    guardarRef.current = guardar;
  });

  useEffect(() => {
    setTexto(valor);
    pendiente.current = null;
  }, [valor]);

  // Al desmontarse se guarda lo que quedara por guardar.
  useEffect(() => {
    const alSalir = guardarRef;
    return () => alSalir.current();
  }, []);

  return (
    <input
      {...resto}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        pendiente.current = e.target.value;
      }}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={`${CLASE_CAMPO} ${className}`}
    />
  );
}
