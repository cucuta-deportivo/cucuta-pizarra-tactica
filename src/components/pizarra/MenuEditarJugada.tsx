import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { Dropdown } from '../ui/Dropdown';
import { Boton } from '../ui/Boton';
import { CampoDiferido, CLASE_CAMPO, soltarFoco } from './CampoDiferido';
import { SelectorCurva } from './ControlesEdicion';
import { duracionDeFrame, DURACION_MAXIMA_MS, DURACION_MINIMA_MS, EASING_POR_DEFECTO } from '../../utils/interpolacion';
import type { ControlEdicion } from '../../utils/barraJugada';

interface Props {
  /** La fase que se ve: la del reloj si se está mirando la jugada, la del documento si se edita. */
  indiceActivo: number;
  /** Reproduciendo o con la barra de tiempo arrastrada: lo que hay en pantalla no es la fase que se edita. */
  soloMirando: boolean;
  /** Los controles de la fase que no caben en la barra: van aquí. */
  escondidos: ReadonlySet<ControlEdicion>;
  /** La curva de la jugada no cabe en la fila de las pestañas: va aquí. */
  jugadaEnMenu: boolean;
}

/**
 * Menú «Más ▾» de la barra de la jugada: lo que no cabe a la vista, con el texto
 * completo (en tablet no hay texto emergente), y «Añadir fase al final», que vive
 * siempre aquí. En una pantalla ancha solo queda eso; en una tablet de 1024, casi
 * toda la edición.
 */
export function MenuEditarJugada({ indiceActivo, soloMirando, escondidos, jugadaEnMenu }: Props) {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const agregarFrameAlFinal = useAlineacionStore((s) => s.agregarFrameAlFinal);
  const duplicarFrame = useAlineacionStore((s) => s.duplicarFrame);
  const eliminarFrame = useAlineacionStore((s) => s.eliminarFrame);
  const moverFrame = useAlineacionStore((s) => s.moverFrame);
  const renombrarFrame = useAlineacionStore((s) => s.renombrarFrame);
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
  const nombreEnMenu = escondidos.has('nombreFase');
  const duracionEnMenu = escondidos.has('duracion') && !enElUltimo;

  return (
    <Dropdown
      hacia="arriba"
      alineacion="derecha"
      gatillo={({ abierto, alternar }) => (
        <Boton
          tamano="md"
          variante="secundario"
          className="shrink-0"
          activo={abierto}
          onClick={alternar}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          title="Lo que no cabe en la barra"
        >
          Más <span aria-hidden="true">▾</span>
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
            aria-label="Más: fase y jugada"
            style={{ backgroundColor: 'var(--superficie-panel)' }}
            className="barra-scroll max-h-[70dvh] w-[300px] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 py-1.5 shadow-elevada"
          >
            <TituloSeccion>
              Fase {indiceActivo + 1} de {total}
            </TituloSeccion>
            {(nombreEnMenu || duracionEnMenu) && (
              <div className="flex gap-2 px-3 pb-2">
                {nombreEnMenu && frameActivo && (
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-club-plata/70">
                    Nombre de la fase
                    <CampoDiferido
                      key={frameActivo.id}
                      valor={frameActivo.nombre ?? ''}
                      alConfirmar={(texto) => renombrarFrame(indiceActivo, texto)}
                      disabled={soloMirando}
                      maxLength={30}
                      placeholder={`Fase ${indiceActivo + 1}`}
                      aria-label="Nombre de la fase"
                      className="w-full"
                    />
                  </label>
                )}
                {duracionEnMenu && (
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
                      aria-label="Duración de la fase en segundos"
                      className={`${CLASE_CAMPO} w-full`}
                    />
                  </label>
                )}
              </div>
            )}

            {escondidos.has('mover') && (
              <>
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
              </>
            )}
            <ItemEditar
              disabled={enElUltimo || soloMirando}
              onClick={yCerrar(agregarFrameAlFinal)}
              title={enElUltimo ? 'Ya estás en la última fase: usa ＋ Fase' : 'Añadir una fase al final de la jugada'}
            >
              ⇥ Añadir fase al final
            </ItemEditar>
            {escondidos.has('duplicar') && (
              <ItemEditar disabled={soloMirando} onClick={yCerrar(() => duplicarFrame(indiceActivo))} title="Duplicar esta fase">
                ⧉ Duplicar fase
              </ItemEditar>
            )}
            {/* Borrado en dos toques: el primero pide confirmación, el segundo borra. */}
            {escondidos.has('borrar') && (
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
            )}

            {jugadaEnMenu && (
              <>
                <div className="my-1.5 border-t border-white/10" />
                <TituloSeccion>Jugada</TituloSeccion>
                {/* El nombre de la jugada se cambia en la ventana Jugadas (F5.4b). */}
                <div className="flex gap-2 px-3 pb-1.5">
                  <label className="flex w-40 shrink-0 flex-col gap-1 text-[11px] text-club-plata/70">
                    Curva
                    <SelectorCurva
                      valor={secuencia.easing ?? EASING_POR_DEFECTO}
                      alCambiar={setEasingSecuencia}
                      disabled={reproduciendo}
                      className="w-full"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        );
      }}
    </Dropdown>
  );
}

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
        soltarFoco();
        onClick?.(e);
      }}
      {...resto}
    >
      {children}
    </button>
  );
}
