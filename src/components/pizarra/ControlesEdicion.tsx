import { useEffect, useState, type ReactNode } from 'react';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { Boton } from '../ui/Boton';
import { CampoDiferido, CLASE_CAMPO, soltarFoco } from './CampoDiferido';
import {
  duracionDeFrame,
  DURACION_MAXIMA_MS,
  DURACION_MINIMA_MS,
  EASING_POR_DEFECTO,
  ETIQUETAS_EASING,
} from '../../utils/interpolacion';
import { ANCHOS_EDICION, type ControlEdicion } from '../../utils/barraJugada';
import type { TipoEasing } from '../../types';

interface PropsEdicionFase {
  /** La fase que se ve: la del reloj si se está mirando la jugada, la del documento si se edita. */
  indiceActivo: number;
  /** Reproduciendo o con la barra de tiempo arrastrada: lo que hay en pantalla no es la fase que se edita. */
  soloMirando: boolean;
  /** Los controles que caben a la vista; los demás están en «Más ▾». «＋ Fase» se ve siempre. */
  visibles: ReadonlySet<ControlEdicion>;
}

/**
 * Edición de la fase que se ve, a la vista en la fila de abajo de la barra: nombre,
 * duración, ＋ Fase, mover, duplicar y borrar, en ese orden. Cada control tiene el
 * ancho fijo de `ANCHOS_EDICION`, que es con lo que se calcula qué cabe.
 */
export function EdicionFase({ indiceActivo, soloMirando, visibles }: PropsEdicionFase) {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const agregarFrame = useAlineacionStore((s) => s.agregarFrame);
  const duplicarFrame = useAlineacionStore((s) => s.duplicarFrame);
  const eliminarFrame = useAlineacionStore((s) => s.eliminarFrame);
  const moverFrame = useAlineacionStore((s) => s.moverFrame);
  const renombrarFrame = useAlineacionStore((s) => s.renombrarFrame);
  const setDuracionFrame = useAlineacionStore((s) => s.setDuracionFrame);
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
  const n = indiceActivo + 1;
  /** Antes de cada acción se guarda lo escrito a medias (en el iPad el botón no quita el foco). */
  const accion = (hacer: () => void) => () => {
    soltarFoco();
    hacer();
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {visibles.has('nombreFase') && frameActivo && (
        <CampoDiferido
          key={frameActivo.id}
          valor={frameActivo.nombre ?? ''}
          alConfirmar={(texto) => renombrarFrame(indiceActivo, texto)}
          disabled={soloMirando}
          maxLength={30}
          placeholder={`Nombre de la fase ${n}`}
          aria-label="Nombre de la fase"
          style={{ width: ANCHOS_EDICION.nombreFase }}
          className="shrink-0"
        />
      )}

      {/* La duración es la del tramo que arranca en esta fase: en la última no hay tramo después.
          El hueco se queda (desactivado) para que la barra no se recoloque al llegar a la última. */}
      {visibles.has('duracion') && (
        <label
          className="flex shrink-0 items-center gap-1.5 text-[11px] text-club-plata/70"
          style={{ width: ANCHOS_EDICION.duracion }}
          title={enElUltimo ? 'La última fase no dura: la jugada acaba en ella' : 'Lo que tarda esta fase en llegar a la siguiente'}
        >
          Dura
          <input
            type="number"
            value={enElUltimo ? '' : (duracionDeFrame(frameActivo) / 1000).toFixed(1)}
            placeholder="—"
            disabled={soloMirando || enElUltimo}
            min={DURACION_MINIMA_MS / 1000}
            max={DURACION_MAXIMA_MS / 1000}
            step={0.1}
            onChange={(e) => {
              const segundos = Number(e.target.value);
              if (Number.isFinite(segundos)) setDuracionFrame(indiceActivo, segundos * 1000);
            }}
            aria-label="Duración de la fase en segundos"
            className={`${CLASE_CAMPO} w-16 px-2`}
          />
          s
        </label>
      )}

      <Boton
        tamano="md"
        variante="secundario"
        className="shrink-0"
        disabled={soloMirando}
        onClick={accion(agregarFrame)}
        title="Insertar una fase justo después de la actual, copiando el estado"
      >
        ＋ Fase
      </Boton>

      {/* Reordenar. Botones y no arrastre: la fila de pestañas ya se desplaza de lado y arrastrar
          dentro de algo que también se desplaza es un desastre con el dedo. */}
      {visibles.has('mover') && (
        <div className="flex shrink-0 gap-1.5" style={{ width: ANCHOS_EDICION.mover }}>
          <Boton
            tamano="icono"
            variante="secundario"
            disabled={indiceActivo === 0 || soloMirando}
            onClick={accion(() => moverFrame(indiceActivo, indiceActivo - 1))}
            aria-label={`Mover la fase ${n} a la izquierda`}
            title="Mover esta fase a la izquierda. Cambia el orden de la jugada."
          >
            <ConEtiqueta etiqueta="Mover">
              <IconoMoverFase hacia="antes" />
            </ConEtiqueta>
          </Boton>
          <Boton
            tamano="icono"
            variante="secundario"
            disabled={enElUltimo || soloMirando}
            onClick={accion(() => moverFrame(indiceActivo, indiceActivo + 1))}
            aria-label={`Mover la fase ${n} a la derecha`}
            title="Mover esta fase a la derecha. Cambia el orden de la jugada."
          >
            <ConEtiqueta etiqueta="Mover">
              <IconoMoverFase hacia="despues" />
            </ConEtiqueta>
          </Boton>
        </div>
      )}

      {visibles.has('duplicar') && (
        <Boton
          tamano="icono"
          variante="secundario"
          className="shrink-0"
          style={{ width: ANCHOS_EDICION.duplicar }}
          disabled={soloMirando}
          onClick={accion(() => duplicarFrame(indiceActivo))}
          aria-label={`Duplicar la fase ${n}`}
          title="Duplicar esta fase"
        >
          <ConEtiqueta etiqueta="Duplicar">
            <span className="text-[15px]">⧉</span>
          </ConEtiqueta>
        </Boton>
      )}

      {/* Borrado en dos toques: el primero pide confirmación, el segundo borra. */}
      {visibles.has('borrar') && (
        <Boton
          tamano="icono"
          variante="peligroSuave"
          className="shrink-0"
          style={{ width: ANCHOS_EDICION.borrar }}
          disabled={total <= 1 || soloMirando}
          onClick={accion(() => {
            if (!confirmandoBorrado) {
              setConfirmandoBorrado(true);
              return;
            }
            setConfirmandoBorrado(false);
            eliminarFrame(indiceActivo);
          })}
          aria-label={confirmandoBorrado ? `Confirmar: borrar la fase ${n}` : `Borrar la fase ${n}`}
          title={
            total <= 1
              ? 'La jugada necesita al menos una fase'
              : confirmandoBorrado
                ? `Pulsa otra vez para borrar la fase ${n}`
                : 'Borrar esta fase'
          }
        >
          <ConEtiqueta etiqueta={confirmandoBorrado ? '¿Borrar?' : 'Borrar'}>
            <span className="text-sm">🗑</span>
          </ConEtiqueta>
        </Boton>
      )}
    </div>
  );
}

/**
 * La curva de la jugada en la fila de las pestañas, en pantallas anchas: la fila
 * de arriba es la jugada y la de abajo, la fase que se ve. Ancho fijo (130), el de
 * `ANCHO_JUGADA_ARRIBA`. El nombre de la jugada no va aquí: se cambia en la
 * ventana Jugadas (F5.4b).
 */
export function CamposJugada() {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const setEasingSecuencia = useAlineacionStore((s) => s.setEasingSecuencia);
  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);
  if (!secuencia) return null;
  return (
    <SelectorCurva disabled={reproduciendo} valor={secuencia.easing ?? EASING_POR_DEFECTO} alCambiar={setEasingSecuencia} className="w-[130px]" />
  );
}

/** Selector de la curva de la jugada (cómo arrancan y frenan los jugadores). */
export function SelectorCurva({
  valor,
  alCambiar,
  disabled,
  className = '',
}: {
  valor: TipoEasing;
  alCambiar: (curva: TipoEasing) => void;
  disabled: boolean;
  className?: string;
}) {
  return (
    <select
      value={valor}
      disabled={disabled}
      onChange={(e) => alCambiar(e.target.value as TipoEasing)}
      aria-label="Curva"
      title="Curva: cómo arrancan y frenan los jugadores"
      className={`${CLASE_CAMPO} shrink-0 ${className}`}
    >
      {(Object.keys(ETIQUETAS_EASING) as TipoEasing[]).map((tipo) => (
        <option key={tipo} value={tipo} className="bg-club-carbon">
          {ETIQUETAS_EASING[tipo]}
        </option>
      ))}
    </select>
  );
}

/** Icono con la palabra debajo, dentro del mismo botón de 44 px: en tablet no hay texto emergente. */
export function ConEtiqueta({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-0.5 leading-none">
      {children}
      <span aria-hidden="true" className="font-display text-[10px] font-semibold uppercase tracking-wide">
        {etiqueta}
      </span>
    </span>
  );
}

/**
 * Icono de reordenar: la pestaña de la fase (el rectángulo) con una flecha que
 * sale de ella hacia donde se mueve. No se parece a ⏮ ⏭ ni a una flecha de
 * navegar, que es con lo que se confundían los ◀ ▶ de antes.
 */
function IconoMoverFase({ hacia }: { hacia: 'antes' | 'despues' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={hacia === 'despues' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <rect x="11" y="5" width="10" height="14" rx="2" />
      <path d="M8.5 12H2.5M5.5 9l-3 3 3 3" />
    </svg>
  );
}
