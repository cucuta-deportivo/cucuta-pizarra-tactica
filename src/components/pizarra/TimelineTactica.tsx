import { useEffect, useRef, useState } from 'react';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { usePizarraCampoStore } from '../../store/pizarraCampoStore';
import { usePlantillaStore } from '../../store/plantillaStore';
import { ControlesReproduccion } from './ControlesReproduccion';
import { Boton } from '../ui/Boton';
import {
  duracionDeFrame,
  DURACION_MAXIMA_MS,
  DURACION_MINIMA_MS,
  EASING_POR_DEFECTO,
  ETIQUETAS_EASING,
  tiempoHastaFrame,
} from '../../utils/interpolacion';
import { duracionDeRuta, trayectoriaDe } from '../../utils/trayectorias';
import type { ModoOrientacion, TipoEasing } from '../../types';

/**
 * Línea de tiempo de la jugada (frames). Solo se monta cuando hay una secuencia
 * abierta; mientras no la haya, la pizarra se comporta como siempre.
 *
 * El frame activo se captura solo al cambiar de frame (ver `capturarFrameActivo`
 * en el store), así que aquí no hay ningún botón de "guardar frame".
 */
export function TimelineTactica() {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const irAFrame = useAlineacionStore((s) => s.irAFrame);
  const agregarFrame = useAlineacionStore((s) => s.agregarFrame);
  const duplicarFrame = useAlineacionStore((s) => s.duplicarFrame);
  const eliminarFrame = useAlineacionStore((s) => s.eliminarFrame);
  const renombrarFrame = useAlineacionStore((s) => s.renombrarFrame);
  const descartarSecuencia = useAlineacionStore((s) => s.descartarSecuencia);
  const setDuracionFrame = useAlineacionStore((s) => s.setDuracionFrame);
  const setEasingSecuencia = useAlineacionStore((s) => s.setEasingSecuencia);
  const moverFrame = useAlineacionStore((s) => s.moverFrame);
  const renombrarSecuencia = useAlineacionStore((s) => s.renombrarSecuencia);
  const agregarFrameAlFinal = useAlineacionStore((s) => s.agregarFrameAlFinal);
  const setDuracionTrayectoria = useAlineacionStore((s) => s.setDuracionTrayectoria);
  const setOrientacionTrayectoria = useAlineacionStore((s) => s.setOrientacionTrayectoria);
  const alternarVisibilidadTrayectoria = useAlineacionStore((s) => s.alternarVisibilidadTrayectoria);

  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);
  const indiceEnReproduccion = useReproduccionStore((s) => s.indiceFrame);
  const setIndiceFrame = useReproduccionStore((s) => s.setIndiceFrame);
  const grabando = useReproduccionStore((s) => s.grabando);
  const iniciarGrabacion = useReproduccionStore((s) => s.iniciarGrabacion);
  const detenerGrabacion = useReproduccionStore((s) => s.detenerGrabacion);
  const mostrarTrayectorias = useReproduccionStore((s) => s.mostrarTrayectorias);
  const alternarTrayectorias = useReproduccionStore((s) => s.alternarTrayectorias);
  const pausar = useReproduccionStore((s) => s.pausar);
  const setPrevisualizando = useReproduccionStore((s) => s.setPrevisualizando);
  const setTiempoMs = useReproduccionStore((s) => s.setTiempoMs);
  const modoTrayectoriaActivo = usePizarraCampoStore((s) => s.modoTrayectoriaActivo);
  const activarModoTrayectoria = usePizarraCampoStore((s) => s.activarModoTrayectoria);
  const desactivarModoTrayectoria = usePizarraCampoStore((s) => s.desactivarModoTrayectoria);
  const sujetoTrayectoria = usePizarraCampoStore((s) => s.sujetoTrayectoria);
  const rival = useAlineacionStore((s) => s.historial.presente.rival);
  // Se suscribe a los datos y no solo a obtenerPorId: esa función es estable y
  // suscribirse a ella no vuelve a renderizar cuando cambia la plantilla.
  const jugadores = usePlantillaStore((s) => s.jugadores);
  const rutaEnEdicion = sujetoTrayectoria
    ? trayectoriaDe(secuencia?.frames[secuencia.indiceActivo]?.trayectorias, sujetoTrayectoria.tipo, sujetoTrayectoria.id)
    : undefined;

  const listaRef = useRef<HTMLDivElement>(null);
  const [nombre, setNombre] = useState('');
  const [nombreJugada, setNombreJugada] = useState('');
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  // Mientras se reproduce manda el índice de reproducción; editando, el del documento.
  const indiceActivo = reproduciendo ? indiceEnReproduccion : (secuencia?.indiceActivo ?? 0);
  const frameActivo = secuencia?.frames[indiceActivo];
  const enElUltimoFrame = indiceActivo >= (secuencia?.frames.length ?? 1) - 1;

  useEffect(() => {
    setNombre(frameActivo?.nombre ?? '');
  }, [frameActivo?.id, frameActivo?.nombre]);

  useEffect(() => {
    setNombreJugada(secuencia?.nombre ?? '');
  }, [secuencia?.nombre]);

  // La confirmación de borrado no sobrevive a cambiar de fase: pedir confirmación
  // para una fase y que la acepte otra sería un borrado por sorpresa.
  useEffect(() => {
    setConfirmandoBorrado(false);
  }, [indiceActivo, secuencia?.frames.length]);

  // Mantiene a la vista el frame activo cuando la jugada es larga y hay scroll.
  useEffect(() => {
    listaRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [indiceActivo]);

  if (!secuencia) return null;

  const hayVariasFases = secuencia.frames.length >= 2;

  function alternarMovimiento(): void {
    if (modoTrayectoriaActivo) {
      desactivarModoTrayectoria();
      return;
    }
    // Salir de la reproducción y de la previsualización: con la barra parada a
    // mitad de un tramo el campo muestra un cálculo, no una fase editable, y la
    // herramienta quedaría inerte sin que nada lo explicase.
    pausar();
    setPrevisualizando(false);
    // En la última fase no arranca ningún tramo: el recorrido que se quiere
    // dibujar es el que LLEGA hasta aquí. Se retrocede una fase para tenerlo
    // delante, en vez de dejar el botón muerto justo donde "＋ Fase" te deja.
    const destino = enElUltimoFrame && indiceActivo > 0 ? indiceActivo - 1 : indiceActivo;
    setTiempoMs(tiempoHastaFrame(secuencia!.frames, destino));
    setIndiceFrame(destino);
    irAFrame(destino);
    activarModoTrayectoria();
  }

  /** Cómo llamar al elemento cuyo recorrido se está dibujando, para la ayuda. */
  function nombreDelSujeto(): string {
    if (!sujetoTrayectoria) return '';
    if (sujetoTrayectoria.tipo === 'balon') return 'del balón';
    if (sujetoTrayectoria.tipo === 'objeto') return 'del objeto';
    if (sujetoTrayectoria.tipo === 'rival') {
      const jugadorRival = rival?.jugadores.find((j) => j.id === sujetoTrayectoria.id);
      return jugadorRival ? `del rival ${jugadorRival.dorsal}` : 'del rival';
    }
    const jugador = jugadores.find((j) => j.id === sujetoTrayectoria.id);
    return jugador ? `de ${jugador.apellido.toUpperCase()}` : 'del jugador';
  }

  return (
    <div className="superficie-vidrio flex flex-col gap-2 border-t border-white/10 px-2 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <input
          value={nombreJugada}
          disabled={reproduciendo}
          onChange={(e) => setNombreJugada(e.target.value)}
          onBlur={() => renombrarSecuencia(nombreJugada)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          maxLength={60}
          placeholder="Nombre de la jugada…"
          aria-label="Nombre de la jugada"
          className="h-9 w-36 shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 font-display text-xs font-semibold text-white placeholder:font-normal placeholder:text-club-plata/40 outline-none focus:border-club-rojo sm:w-48"
        />

        <span className="shrink-0 font-display text-[11px] font-semibold uppercase tracking-wide text-club-plata/70">
          {secuencia.frames.length} {secuencia.frames.length === 1 ? 'fase' : 'fases'}
        </span>

        <input
          value={nombre}
          disabled={reproduciendo}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={() => renombrarFrame(indiceActivo, nombre)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          maxLength={30}
          placeholder={`Nombrar frame ${indiceActivo + 1}…`}
          aria-label={`Nombre del frame ${indiceActivo + 1}`}
          className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white placeholder:text-club-plata/40 outline-none focus:border-club-rojo"
        />

        {/*
          La duración pertenece al TRAMO que arranca en esta fase, así que en la
          última no hay nada que ajustar: no hay transición después de ella.
        */}
        {!enElUltimoFrame && (
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-club-plata/70" title="Lo que tarda esta fase en llegar a la siguiente">
            <span className="hidden sm:inline">Dura</span>
            <input
              type="number"
              value={(duracionDeFrame(frameActivo) / 1000).toFixed(1)}
              disabled={reproduciendo}
              min={DURACION_MINIMA_MS / 1000}
              max={DURACION_MAXIMA_MS / 1000}
              step={0.1}
              onChange={(e) => {
                const segundos = Number(e.target.value);
                if (Number.isFinite(segundos)) setDuracionFrame(indiceActivo, segundos * 1000);
              }}
              aria-label={`Duración de la fase ${indiceActivo + 1} en segundos`}
              className="h-9 w-16 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-club-rojo"
            />
            <span>s</span>
          </label>
        )}

        <select
          value={secuencia.easing ?? EASING_POR_DEFECTO}
          disabled={reproduciendo}
          onChange={(e) => setEasingSecuencia(e.target.value as TipoEasing)}
          aria-label="Curva de movimiento de la jugada"
          title="Cómo arrancan y frenan los jugadores"
          className="h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white outline-none focus:border-club-rojo"
        >
          {(Object.keys(ETIQUETAS_EASING) as TipoEasing[]).map((tipo) => (
            <option key={tipo} value={tipo} className="bg-club-carbon">
              {ETIQUETAS_EASING[tipo]}
            </option>
          ))}
        </select>

        <Boton tamano="sm" variante="fantasma" onClick={descartarSecuencia} title="Cerrar la jugada y volver a la pizarra">
          Cerrar jugada
        </Boton>
      </div>

      <div className="flex items-center gap-2">
        <ControlesReproduccion />

        <div ref={listaRef} className="barra-scroll flex flex-1 items-center gap-1.5 overflow-x-auto pb-1">
          {secuencia.frames.map((frame, indice) => {
            const activo = indice === indiceActivo;
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => {
                  setIndiceFrame(indice);
                  irAFrame(indice);
                }}
                aria-current={activo}
                aria-label={`Frame ${indice + 1}${frame.nombre ? `: ${frame.nombre}` : ''}`}
                className={`flex h-11 min-w-[64px] shrink-0 flex-col items-center justify-center rounded-lg border px-2.5 transition-colors duration-rapido ${
                  activo
                    ? 'border-club-rojo bg-club-rojo/20 text-white'
                    : 'border-white/10 bg-white/5 text-club-plata hover:border-club-rojo/50 hover:text-white'
                }`}
              >
                <span className="font-display text-sm font-bold leading-none">{indice + 1}</span>
                {frame.nombre && <span className="mt-0.5 max-w-[72px] truncate text-[10px] leading-none">{frame.nombre}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Boton
            tamano="sm"
            variante={grabando ? 'peligro' : 'secundario'}
            onClick={grabando ? detenerGrabacion : iniciarGrabacion}
            aria-pressed={grabando}
            title={
              grabando
                ? 'Parar de grabar. Cada tanda de movimientos ha creado un frame'
                : 'Grabar: cada movimiento en el campo crea un frame solo'
            }
          >
            {grabando ? '⏹ Grabando' : '⏺ Grabar'}
          </Boton>
          {/* Herramienta Movimiento. Un recorrido pertenece al tramo entre dos
              fases, así que basta con que la jugada tenga dos. Estando en la
              última no se deshabilita: se retrocede sola a la anterior, que es
              donde arranca el tramo que el entrenador quiere dibujar. */}
          <Boton
            tamano="sm"
            variante={modoTrayectoriaActivo ? 'primario' : 'secundario'}
            disabled={!hayVariasFases || reproduciendo}
            onClick={alternarMovimiento}
            aria-pressed={modoTrayectoriaActivo}
            title={
              !hayVariasFases
                ? 'Añade una fase para poder marcar recorridos'
                : modoTrayectoriaActivo
                  ? 'Salir de la herramienta de movimiento'
                  : enElUltimoFrame
                    ? 'Movimiento: se volverá a la fase anterior, que es donde arranca el recorrido'
                    : 'Movimiento: toca una ficha y luego el campo para ir marcando su recorrido'
            }
          >
            {modoTrayectoriaActivo ? '✔ Movimiento' : '✥ Movimiento'}
          </Boton>

          <Boton
            tamano="icono"
            variante="secundario"
            activo={mostrarTrayectorias}
            onClick={alternarTrayectorias}
            aria-pressed={mostrarTrayectorias}
            aria-label="Mostrar movimientos"
            title={mostrarTrayectorias ? 'Ocultar las flechas de movimiento' : 'Mostrar las flechas de movimiento'}
          >
            ↗
          </Boton>

          {/* Reordenar. Botones y no arrastre: la fila ya tiene scroll horizontal
              y arrastrar dentro de algo que también se desplaza es un desastre con el dedo. */}
          <Boton
            tamano="icono"
            variante="secundario"
            disabled={indiceActivo === 0 || reproduciendo}
            onClick={() => moverFrame(indiceActivo, indiceActivo - 1)}
            aria-label="Mover la fase hacia atrás"
            title="Mover esta fase una posición antes"
          >
            ◀
          </Boton>
          <Boton
            tamano="icono"
            variante="secundario"
            disabled={enElUltimoFrame || reproduciendo}
            onClick={() => moverFrame(indiceActivo, indiceActivo + 1)}
            aria-label="Mover la fase hacia adelante"
            title="Mover esta fase una posición después"
          >
            ▶
          </Boton>

          <Boton
            tamano="sm"
            variante="secundario"
            onClick={agregarFrame}
            title="Insertar una fase justo después de la actual, copiando el estado"
          >
            ＋ Fase
          </Boton>
          <Boton
            tamano="icono"
            variante="secundario"
            disabled={enElUltimoFrame}
            onClick={agregarFrameAlFinal}
            aria-label="Añadir una fase al final"
            title={enElUltimoFrame ? 'Ya estás en la última fase: usa ＋ Fase' : 'Añadir una fase al final de la jugada'}
          >
            ⇥
          </Boton>
          <Boton
            tamano="icono"
            variante="secundario"
            onClick={() => duplicarFrame(indiceActivo)}
            aria-label="Duplicar este frame"
            title="Duplicar esta fase"
          >
            ⧉
          </Boton>

          {/* Borrado en dos toques: el primero pide confirmación, el segundo borra.
              Con una sola fase no hay nada que confirmar porque no se puede borrar. */}
          <Boton
            tamano={confirmandoBorrado ? 'sm' : 'icono'}
            variante="peligro"
            disabled={secuencia.frames.length <= 1}
            onClick={() => {
              if (!confirmandoBorrado) {
                setConfirmandoBorrado(true);
                return;
              }
              setConfirmandoBorrado(false);
              eliminarFrame(indiceActivo);
            }}
            aria-label={confirmandoBorrado ? 'Confirmar el borrado de la fase' : 'Eliminar este frame'}
            title={
              secuencia.frames.length <= 1
                ? 'La jugada necesita al menos una fase'
                : confirmandoBorrado
                  ? `Pulsa otra vez para borrar la fase ${indiceActivo + 1}`
                  : 'Eliminar esta fase'
            }
          >
            {confirmandoBorrado ? '¿Borrar?' : '🗑'}
          </Boton>
        </div>
      </div>

      {/*
        Ayuda de la herramienta. Sin ella los dos pasos del gesto (elegir ficha,
        luego tocar el campo) no se adivinan: tocar el campo sin sujeto no hace
        nada y nada explica por qué.
      */}
      {modoTrayectoriaActivo && (
        <p
          role="status"
          className="flex items-center gap-1.5 rounded-lg border border-club-rojo/40 bg-club-rojo/10 px-2.5 py-1.5 text-[11px] leading-tight text-club-plata"
        >
          <span aria-hidden="true">✥</span>
          {sujetoTrayectoria ? (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              Recorrido <strong className="font-semibold text-white">{nombreDelSujeto()}</strong> · toca el campo
              para añadir nodos, o la línea para insertar uno entre dos. Arrastra los nodos para dar forma a la curva.
              {rutaEnEdicion && rutaEnEdicion.nodos.length > 0 && (
                <label className="ml-1 flex items-center gap-1" title="Lo que tarda este actor. Puede ser menos que la fase: llega antes y espera.">
                  · tarda
                  <input
                    type="number"
                    value={(duracionDeRuta(rutaEnEdicion, duracionDeFrame(frameActivo)) / 1000).toFixed(1)}
                    min={DURACION_MINIMA_MS / 1000}
                    max={duracionDeFrame(frameActivo) / 1000}
                    step={0.1}
                    onChange={(e) => {
                      const segundos = Number(e.target.value);
                      if (Number.isFinite(segundos)) setDuracionTrayectoria(indiceActivo, rutaEnEdicion.id, segundos * 1000);
                    }}
                    aria-label="Duración de este recorrido en segundos"
                    className="h-7 w-14 rounded border border-white/15 bg-white/5 px-1.5 text-[11px] text-white outline-none focus:border-club-rojo"
                  />
                  s
                  {rutaEnEdicion.duracionMs !== undefined && (
                    <button
                      type="button"
                      onClick={() => setDuracionTrayectoria(indiceActivo, rutaEnEdicion.id, undefined)}
                      title="Volver a la duración de la fase"
                      className="rounded px-1 text-[10px] underline decoration-dotted hover:text-white"
                    >
                      usar la de la fase
                    </button>
                  )}
                  · mira
                  <select
                    value={rutaEnEdicion.orientacion ?? 'manual'}
                    onChange={(e) => setOrientacionTrayectoria(indiceActivo, rutaEnEdicion.id, e.target.value as ModoOrientacion)}
                    aria-label="Orientación del actor en este recorrido"
                    title="Hacia dónde mira mientras recorre la trayectoria"
                    className="h-7 rounded border border-white/15 bg-white/5 px-1 text-[11px] text-white outline-none focus:border-club-rojo"
                  >
                    <option value="manual" className="bg-club-carbon">
                      como esté
                    </option>
                    <option value="seguir-ruta" className="bg-club-carbon">
                      hacia donde corre
                    </option>
                  </select>

                  {/* Qué se ve de esta ruta. Son tres cosas distintas: la línea,
                      los nodos agarrables y la huella durante la reproducción. */}
                  {([
                    ['ruta', '─', 'la línea del recorrido', rutaEnEdicion.mostrarRuta],
                    ['nodos', '○', 'los nodos', rutaEnEdicion.mostrarNodos !== false],
                    ['estela', '〰', 'la estela al reproducir', Boolean(rutaEnEdicion.mostrarEstela)],
                  ] as const).map(([que, icono, etiqueta, activo]) => (
                    <button
                      key={que}
                      type="button"
                      onClick={() => alternarVisibilidadTrayectoria(indiceActivo, rutaEnEdicion.id, que)}
                      aria-pressed={activo}
                      aria-label={`${activo ? 'Ocultar' : 'Mostrar'} ${etiqueta}`}
                      title={`${activo ? 'Ocultar' : 'Mostrar'} ${etiqueta}`}
                      className={`flex h-7 w-7 items-center justify-center rounded border text-[11px] ${
                        activo
                          ? 'border-club-rojo bg-club-rojo/20 text-white'
                          : 'border-white/15 bg-white/5 text-club-plata/60'
                      }`}
                    >
                      {icono}
                    </button>
                  ))}
                </label>
              )}
            </span>
          ) : (
            <span>
              Toca un jugador, un rival, el balón o un objeto para marcar su recorrido hasta la fase{' '}
              {Math.min(indiceActivo + 2, secuencia.frames.length)}.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
