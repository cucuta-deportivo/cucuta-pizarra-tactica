import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { usePizarraCampoStore } from '../../store/pizarraCampoStore';
import { useBuscarJugador } from '../../store/plantillaStore';
import { ControlesReproduccion } from './ControlesReproduccion';
import { CamposJugada, ConEtiqueta, EdicionFase } from './ControlesEdicion';
import { MenuEditarJugada } from './MenuEditarJugada';
import { Boton } from '../ui/Boton';
import { useMedidaElemento } from '../../hooks/useMedidaElemento';
import {
  ANCHOS_EDICION,
  ANCHOS_GRABAR,
  ANCHOS_MOVIMIENTO,
  elegirNivel,
  espacioDisponible,
  jugadaArriba,
  pasosAplicados,
  type ControlEdicion,
} from '../../utils/barraJugada';
import { duracionDeFrame, DURACION_MINIMA_MS, tiempoHastaFrame } from '../../utils/interpolacion';
import { duracionDeRuta, trayectoriaDe } from '../../utils/trayectorias';
import type { ModoOrientacion } from '../../types';

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
  const cerrarJugada = useAlineacionStore((s) => s.cerrarJugada);
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
  const detener = useReproduccionStore((s) => s.detener);
  const setPrevisualizando = useReproduccionStore((s) => s.setPrevisualizando);
  const previsualizando = useReproduccionStore((s) => s.previsualizando);
  const setTiempoMs = useReproduccionStore((s) => s.setTiempoMs);
  const modoTrayectoriaActivo = usePizarraCampoStore((s) => s.modoTrayectoriaActivo);
  const activarModoTrayectoria = usePizarraCampoStore((s) => s.activarModoTrayectoria);
  const desactivarModoTrayectoria = usePizarraCampoStore((s) => s.desactivarModoTrayectoria);
  const sujetoTrayectoria = usePizarraCampoStore((s) => s.sujetoTrayectoria);
  const rival = useAlineacionStore((s) => s.historial.presente.rival);
  // Se suscribe a los datos y no solo a obtenerPorId: esa función es estable y
  // suscribirse a ella no vuelve a renderizar cuando cambia la plantilla.
  const buscarJugador = useBuscarJugador();
  const rutaEnEdicion = sujetoTrayectoria
    ? trayectoriaDe(secuencia?.frames[secuencia.indiceActivo]?.trayectorias, sujetoTrayectoria.tipo, sujetoTrayectoria.id)
    : undefined;

  const listaRef = useRef<HTMLDivElement | null>(null);

  // Qué cabe (ver utils/barraJugada). Abajo, el bloque «FASE x/y» se lleva lo que sobra: su ancho más lo
  // que ocupan los controles que pueden esconderse es el espacio a repartir. Arriba, igual con las pestañas.
  const nivelRef = useRef(0);
  const arribaRef = useRef(false);
  const [refBloqueFase, espacioFila] = useMedidaElemento<HTMLSpanElement, number>(
    (caja) => espacioDisponible(caja.width, nivelRef.current),
    Number.POSITIVE_INFINITY,
  );
  const [refMedidaPestanas, jugadaEnFila] = useMedidaElemento<HTMLDivElement, boolean>(
    (caja) => jugadaArriba(caja.width, arribaRef.current),
    false,
  );
  const nivel = elegirNivel(espacioFila);
  useLayoutEffect(() => {
    nivelRef.current = nivel;
    arribaRef.current = jugadaEnFila;
  });
  const refPestanas = useCallback(
    (elemento: HTMLDivElement | null) => {
      listaRef.current = elemento;
      refMedidaPestanas(elemento);
    },
    [refMedidaPestanas],
  );
  const aplicados = pasosAplicados(nivel);
  const todos = Object.keys(ANCHOS_EDICION) as ControlEdicion[];
  const visibles = new Set(todos.filter((c) => !aplicados.has(c)));
  const escondidos = new Set(todos.filter((c) => aplicados.has(c)));
  const compactos = aplicados.has('compactar');

  // Reproduciendo o con la barra de tiempo arrastrada (previsualizando) manda la fase que se VE, la del reloj;
  // editando, la del documento. Antes, con la barra, la pestaña y el nombre eran los de la fase activa del
  // documento y no los de la que había en pantalla, y mover o borrar actuaba sobre una fase que no se veía.
  // Mientras solo se mira, la edición de fases queda desactivada: lo que hay en pantalla no es la fase que se edita.
  const soloMirando = reproduciendo || previsualizando;
  const indiceActivo = soloMirando ? indiceEnReproduccion : (secuencia?.indiceActivo ?? 0);
  const frameActivo = secuencia?.frames[indiceActivo];
  const enElUltimoFrame = indiceActivo >= (secuencia?.frames.length ?? 1) - 1;

  // Mantiene a la vista la pestaña de la fase que se ve (al tocarla, con ⏮ ⏭ o reproduciendo) cuando
  // la jugada tiene más fases de las que caben. Se desplaza SOLO la fila: scrollIntoView movía también
  // los contenedores de fuera y, en una tablet de 1024 px, la interfaz entera se corría a la izquierda.
  useEffect(() => {
    const lista = listaRef.current;
    const activa = lista?.querySelector<HTMLElement>('[aria-current="true"]');
    if (lista && activa) lista.scrollLeft = desplazamientoParaCentrar(lista, activa);
  }, [indiceActivo, secuencia?.frames.length]);

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

  /**
   * Tocar la pestaña de una fase va a ella para editarla: sale de la reproducción y
   * de la barra arrastrada, como ⏮ ⏭. Antes se quedaba en la previsualización y el
   * campo seguía mostrando el instante de la barra.
   */
  function irAFase(indice: number): void {
    pausar();
    setPrevisualizando(false);
    setTiempoMs(tiempoHastaFrame(secuencia!.frames, indice));
    setIndiceFrame(indice);
    irAFrame(indice);
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
    const jugador = buscarJugador(sujetoTrayectoria.id);
    return jugador ? `de ${jugador.apellido.toUpperCase()}` : 'del jugador';
  }

  return (
    <div className="superficie-vidrio flex flex-col gap-1 border-t border-white/10 px-2 py-1.5 sm:px-4">
      <div className="flex items-center gap-2">
        {/* Arriba, la jugada: las pestañas de las fases (en la tablet no cabían junto a los mandos) y, si
            sobra sitio, el nombre y la curva. Abajo, la fase que se ve. */}
        <div ref={refPestanas} className="barra-scroll flex flex-1 scroll-smooth items-center gap-1.5 overflow-x-auto">
          {secuencia.frames.map((frame, indice) => {
            const activo = indice === indiceActivo;
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => irAFase(indice)}
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

        {jugadaEnFila && <CamposJugada />}

        {/* F5.4a: cerrar guarda la jugada (se reabre desde ⋯); borrarla es otra opción del menú ⋯. */}
        <Boton
          tamano="md"
          variante="fantasma"
          className="shrink-0"
          onClick={() => {
            // Sin jugada en pantalla no queda nada que reproducir, grabar ni recorrer.
            detener();
            detenerGrabacion();
            desactivarModoTrayectoria();
            cerrarJugada();
          }}
          title="Guardar la jugada y volver a la pizarra. Se vuelve a abrir desde ⋯"
        >
          Cerrar jugada
        </Boton>
      </div>

      <div className="flex items-center gap-2">
        <ControlesReproduccion refBloqueFase={refBloqueFase} nombreJunto={!visibles.has('nombreFase')} />

        {/* La edición de la fase que se ve, a la vista mientras quepa; lo demás, en «Más ▾». */}
        <EdicionFase indiceActivo={indiceActivo} soloMirando={soloMirando} visibles={visibles} />

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Anchos fijos (los de utils/barraJugada) para que el texto de cada momento no mueva la barra.
              Si falta sitio, icono con la palabra debajo antes de esconder la duración. */}
          <Boton
            tamano="md"
            variante={grabando ? 'peligro' : 'secundario'}
            onClick={grabando ? detenerGrabacion : iniciarGrabacion}
            aria-pressed={grabando}
            aria-label={grabando ? 'Grabando' : 'Grabar'}
            style={{ width: compactos ? ANCHOS_GRABAR.compacto : ANCHOS_GRABAR.normal, ...(compactos ? { paddingLeft: 4, paddingRight: 4 } : {}) }}
            title={
              grabando
                ? 'Parar de grabar. Cada tanda de movimientos ha creado un frame'
                : 'Grabar: cada movimiento en el campo crea un frame solo'
            }
          >
            {compactos ? (
              <ConEtiqueta etiqueta={grabando ? 'Grabando' : 'Grabar'}>
                <span className="text-sm">{grabando ? '⏹' : '⏺'}</span>
              </ConEtiqueta>
            ) : grabando ? (
              '⏹ Grabando'
            ) : (
              '⏺ Grabar'
            )}
          </Boton>
          {/* Herramienta Movimiento. Un recorrido pertenece al tramo entre dos
              fases, así que basta con que la jugada tenga dos. Estando en la
              última no se deshabilita: se retrocede sola a la anterior, que es
              donde arranca el tramo que el entrenador quiere dibujar. */}
          <Boton
            tamano="md"
            variante={modoTrayectoriaActivo ? 'primario' : 'secundario'}
            disabled={!hayVariasFases || reproduciendo}
            onClick={alternarMovimiento}
            aria-pressed={modoTrayectoriaActivo}
            aria-label="Movimiento"
            style={{ width: compactos ? ANCHOS_MOVIMIENTO.compacto : ANCHOS_MOVIMIENTO.normal, ...(compactos ? { paddingLeft: 4, paddingRight: 4 } : {}) }}
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
            {compactos ? (
              <ConEtiqueta etiqueta="Movimiento">
                <span className="text-[15px]">{modoTrayectoriaActivo ? '✔' : '✥'}</span>
              </ConEtiqueta>
            ) : modoTrayectoriaActivo ? (
              '✔ Movimiento'
            ) : (
              '✥ Movimiento'
            )}
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

          {/* Lo que no cabe a la vista, y «Añadir fase al final», que vive siempre aquí. */}
          <MenuEditarJugada
            indiceActivo={indiceActivo}
            soloMirando={soloMirando}
            escondidos={escondidos}
            jugadaEnMenu={!jugadaEnFila}
          />
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


/** Cuánto desplazar la fila de pestañas para que la pestaña quede en el centro, sin pasarse de los extremos. */
function desplazamientoParaCentrar(lista: HTMLElement, pestana: HTMLElement): number {
  const fila = lista.getBoundingClientRect();
  const caja = pestana.getBoundingClientRect();
  const desvio = caja.left + caja.width / 2 - (fila.left + fila.width / 2);
  return Math.max(0, Math.min(lista.scrollWidth - lista.clientWidth, lista.scrollLeft + desvio));
}
