import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { Dropdown } from '../ui/Dropdown';
import { Boton } from '../ui/Boton';
import {
  duracionDeFrame,
  DURACION_MAXIMA_MS,
  DURACION_MINIMA_MS,
  EASING_POR_DEFECTO,
  ETIQUETAS_EASING,
} from '../../utils/interpolacion';
import type { TipoEasing } from '../../types';

interface Props {
  /** La fase que se ve: la del reloj si se está mirando la jugada, la del documento si se edita. */
  indiceActivo: number;
  /** Reproduciendo o con la barra de tiempo arrastrada: lo que hay en pantalla no es la fase que se edita. */
  soloMirando: boolean;
}

/**
 * Menú «Editar ▾» de la barra de la jugada. Reúne lo que antes ocupaba la barra
 * (nombre y duración de la fase, nombre y curva de la jugada, y los botones de
 * mover, insertar, añadir, duplicar y borrar) para dejar sitio a las pestañas de
 * las fases en la tablet. Textos completos: en tablet no hay texto emergente.
 */
export function MenuEditarJugada({ indiceActivo, soloMirando }: Props) {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const agregarFrame = useAlineacionStore((s) => s.agregarFrame);
  const agregarFrameAlFinal = useAlineacionStore((s) => s.agregarFrameAlFinal);
  const duplicarFrame = useAlineacionStore((s) => s.duplicarFrame);
  const eliminarFrame = useAlineacionStore((s) => s.eliminarFrame);
  const moverFrame = useAlineacionStore((s) => s.moverFrame);
  const renombrarFrame = useAlineacionStore((s) => s.renombrarFrame);
  const renombrarSecuencia = useAlineacionStore((s) => s.renombrarSecuencia);
  const setDuracionFrame = useAlineacionStore((s) => s.setDuracionFrame);
  const setEasingSecuencia = useAlineacionStore((s) => s.setEasingSecuencia);
  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);

  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  // La confirmación de borrado no sobrevive a cambiar de fase: pedir confirmación
  // para una fase y que la acepte otra sería un borrado por sorpresa.
  useEffect(() => {
    setConfirmandoBorrado(false);
  }, [indiceActivo, secuencia?.frames.length]);

  if (!secuencia) return null;

  const total = secuencia.frames.length;
  const frameActivo = secuencia.frames[indiceActivo];
  const enElUltimo = indiceActivo >= total - 1;

  return (
    <Dropdown
      hacia="arriba"
      alineacion="derecha"
      gatillo={({ abierto, alternar }) => (
        <Boton
          tamano="md"
          variante="secundario"
          activo={abierto}
          onClick={alternar}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          title="Editar la fase y la jugada"
        >
          Editar <span aria-hidden="true">▾</span>
        </Boton>
      )}
    >
      {(cerrar) => {
        /** Las acciones que cambian de fase cierran el menú: lo siguiente es mirar el campo. */
        const yCerrar = (accion: () => void) => () => {
          accion();
          cerrar();
        };
        return (
          // Fondo opaco y no `superficie-vidrio`: el menú se abre encima del campo y, dentro del
          // desplegable animado, el desenfoque no actúa y las fichas se transparentaban bajo el texto.
          <div
            role="dialog"
            aria-label="Editar la fase y la jugada"
            style={{ backgroundColor: 'var(--superficie-panel)' }}
            className="barra-scroll max-h-[70dvh] w-[300px] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 py-1.5 shadow-elevada"
          >
            <TituloSeccion>
              Fase {indiceActivo + 1} de {total}
            </TituloSeccion>
            <div className="flex gap-2 px-3 pb-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-club-plata/70">
                Nombre de la fase
                <CampoDiferido
                  valor={frameActivo?.nombre ?? ''}
                  alConfirmar={(texto) => renombrarFrame(indiceActivo, texto)}
                  disabled={soloMirando}
                  maxLength={30}
                  placeholder={`Fase ${indiceActivo + 1}`}
                />
              </label>
              {/* La duración es la del tramo que arranca en esta fase: en la última no hay tramo después. */}
              {!enElUltimo && (
                <label
                  className="flex w-20 shrink-0 flex-col gap-1 text-[11px] text-club-plata/70"
                  title="Lo que tarda esta fase en llegar a la siguiente"
                >
                  Dura (s)
                  <input
                    type="number"
                    value={(duracionDeFrame(frameActivo) / 1000).toFixed(1)}
                    disabled={soloMirando}
                    min={DURACION_MINIMA_MS / 1000}
                    max={DURACION_MAXIMA_MS / 1000}
                    step={0.1}
                    onChange={(e) => {
                      const segundos = Number(e.target.value);
                      if (Number.isFinite(segundos)) setDuracionFrame(indiceActivo, segundos * 1000);
                    }}
                    className={CLASE_CAMPO}
                  />
                </label>
              )}
            </div>

            <ItemEditar
              disabled={indiceActivo === 0 || soloMirando}
              onClick={() => moverFrame(indiceActivo, indiceActivo - 1)}
              title="Mover esta fase a la izquierda. Cambia el orden de la jugada."
            >
              Mover a la izquierda
            </ItemEditar>
            <ItemEditar
              disabled={enElUltimo || soloMirando}
              onClick={() => moverFrame(indiceActivo, indiceActivo + 1)}
              title="Mover esta fase a la derecha. Cambia el orden de la jugada."
            >
              Mover a la derecha
            </ItemEditar>
            <ItemEditar
              disabled={soloMirando}
              onClick={yCerrar(agregarFrame)}
              title="Insertar una fase justo después de la actual, copiando el estado"
            >
              ＋ Insertar fase después
            </ItemEditar>
            <ItemEditar
              disabled={enElUltimo || soloMirando}
              onClick={yCerrar(agregarFrameAlFinal)}
              title={enElUltimo ? 'Ya estás en la última fase: usa «Insertar fase después»' : 'Añadir una fase al final de la jugada'}
            >
              ⇥ Añadir fase al final
            </ItemEditar>
            <ItemEditar disabled={soloMirando} onClick={yCerrar(() => duplicarFrame(indiceActivo))} title="Duplicar esta fase">
              ⧉ Duplicar fase
            </ItemEditar>
            {/* Borrado en dos toques: el primero pide confirmación, el segundo borra. */}
            <ItemEditar
              peligro
              disabled={total <= 1 || soloMirando}
              onClick={() => {
                if (!confirmandoBorrado) {
                  setConfirmandoBorrado(true);
                  return;
                }
                setConfirmandoBorrado(false);
                eliminarFrame(indiceActivo);
                cerrar();
              }}
              title={total <= 1 ? 'La jugada necesita al menos una fase' : 'Borrar esta fase'}
            >
              {confirmandoBorrado ? `🗑 ¿Borrar la fase ${indiceActivo + 1}? Toca otra vez` : '🗑 Borrar fase'}
            </ItemEditar>

            <div className="my-1.5 border-t border-white/10" />
            <TituloSeccion>Jugada</TituloSeccion>
            <div className="flex gap-2 px-3 pb-1.5">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-club-plata/70">
                Nombre de la jugada
                <CampoDiferido
                  valor={secuencia.nombre ?? ''}
                  alConfirmar={renombrarSecuencia}
                  disabled={reproduciendo}
                  maxLength={60}
                  placeholder="Nombre de la jugada…"
                />
              </label>
              <label className="flex w-28 shrink-0 flex-col gap-1 text-[11px] text-club-plata/70" title="Cómo arrancan y frenan los jugadores">
                Curva
                <select
                  value={secuencia.easing ?? EASING_POR_DEFECTO}
                  disabled={reproduciendo}
                  onChange={(e) => setEasingSecuencia(e.target.value as TipoEasing)}
                  className={CLASE_CAMPO}
                >
                  {(Object.keys(ETIQUETAS_EASING) as TipoEasing[]).map((tipo) => (
                    <option key={tipo} value={tipo} className="bg-club-carbon">
                      {ETIQUETAS_EASING[tipo]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        );
      }}
    </Dropdown>
  );
}

const CLASE_CAMPO =
  'h-11 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-club-plata/40 outline-none focus:border-club-rojo disabled:opacity-40';

function TituloSeccion({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1.5 pt-1 font-display text-[11px] font-semibold uppercase tracking-wide text-club-plata/70">{children}</p>
  );
}

function ItemEditar({
  children,
  peligro = false,
  onClick,
  ...resto
}: { children: ReactNode; peligro?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`block min-h-[44px] w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40 ${
        peligro ? 'text-red-300' : 'text-white'
      }`}
      onClick={(e) => {
        // En el iPad tocar un botón no le quita el foco al campo de texto: se guarda lo escrito
        // ANTES de la acción, o un nombre a medias acabaría en otra fase (tras mover o borrar).
        if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
        onClick?.(e);
      }}
      {...resto}
    >
      {children}
    </button>
  );
}

/**
 * Campo de texto que guarda al salir de él, con Intro o al cerrarse el menú. Lo último
 * importa: tocar fuera cierra el menú y el campo desaparece sin que el navegador avise
 * siempre de que pierde el foco, y lo escrito se perdería.
 */
function CampoDiferido({
  valor,
  alConfirmar,
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

  // Al desmontarse (el menú se cierra) se guarda lo que quedara por guardar.
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
      className={CLASE_CAMPO}
    />
  );
}
