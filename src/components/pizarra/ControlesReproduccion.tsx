import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore, VELOCIDADES } from '../../store/reproduccionStore';
import { Boton } from '../ui/Boton';
import { duracionTotal, formatearTiempo, tiempoHastaFrame, ubicacionEnTiempo } from '../../utils/interpolacion';

/**
 * Mandos de la jugada. Al pausar (o al saltar de fase a mano) el documento se
 * deja en la fase donde se paró, de modo que el entrenador puede seguir
 * editando justo desde ahí, y eso cuenta como un único paso de historial.
 *
 * La barra de progreso no salta de fase en fase: mueve el reloj de la jugada, y
 * de ese instante se derivan la fase y el avance dentro de ella.
 */
export function ControlesReproduccion() {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const irAFrame = useAlineacionStore((s) => s.irAFrame);

  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);
  const velocidad = useReproduccionStore((s) => s.velocidad);
  const tiempoMs = useReproduccionStore((s) => s.tiempoMs);
  const previsualizando = useReproduccionStore((s) => s.previsualizando);
  const reproducir = useReproduccionStore((s) => s.reproducir);
  const pausar = useReproduccionStore((s) => s.pausar);
  const setIndiceFrame = useReproduccionStore((s) => s.setIndiceFrame);
  const setVelocidad = useReproduccionStore((s) => s.setVelocidad);
  const setTiempoMs = useReproduccionStore((s) => s.setTiempoMs);
  const setPrevisualizando = useReproduccionStore((s) => s.setPrevisualizando);

  if (!secuencia) return null;
  const frames = secuencia.frames;
  const total = frames.length;
  const duracion = duracionTotal(frames);

  // Reproduciendo o previsualizando manda el reloj; editando, el frame activo
  // del documento (que cambia al añadir fases o al tocar un chip).
  const enMovimiento = reproduciendo || previsualizando;
  const indiceEfectivo = enMovimiento ? ubicacionEnTiempo(frames, tiempoMs).indice : secuencia.indiceActivo;
  const tiempoMostrado = enMovimiento ? Math.min(tiempoMs, duracion) : tiempoHastaFrame(frames, indiceEfectivo);
  const enElUltimo = indiceEfectivo >= total - 1;
  const alFinal = tiempoMostrado >= duracion - 1;

  /** Deja el tablero en una fase concreta y sale de la previsualización. */
  function saltarA(indice: number): void {
    const destino = Math.max(0, Math.min(total - 1, indice));
    pausar();
    setPrevisualizando(false);
    setTiempoMs(tiempoHastaFrame(frames, destino));
    setIndiceFrame(destino);
    irAFrame(destino);
  }

  function alternarReproduccion(): void {
    if (reproduciendo) {
      // Pausa: el tablero se queda en la fase que se estaba reproduciendo.
      pausar();
      irAFrame(ubicacionEnTiempo(frames, tiempoMs).indice);
      return;
    }
    // Desde el final, reproducir vuelve a empezar en lugar de no hacer nada.
    if (alFinal) {
      setTiempoMs(0);
      setIndiceFrame(0);
      irAFrame(0);
    } else if (!previsualizando) {
      // Vuelca al frame activo lo que se acabe de editar: la reproducción lee
      // los frames guardados, no el documento en pantalla.
      setTiempoMs(tiempoHastaFrame(frames, indiceEfectivo));
      setIndiceFrame(indiceEfectivo);
      irAFrame(indiceEfectivo);
    }
    reproducir();
  }

  function alArrastrarBarra(ms: number): void {
    if (reproduciendo) pausar();
    setPrevisualizando(true);
    setTiempoMs(ms);
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Boton
        tamano="icono"
        variante="secundario"
        disabled={indiceEfectivo === 0 && !enMovimiento}
        onClick={() => saltarA(enMovimiento ? indiceEfectivo : indiceEfectivo - 1)}
        aria-label="Frame anterior"
        title="Fase anterior"
      >
        ⏮
      </Boton>

      <Boton
        tamano="icono"
        variante="primario"
        onClick={alternarReproduccion}
        aria-label={reproduciendo ? 'Pausar' : 'Reproducir'}
        title={reproduciendo ? 'Pausar' : alFinal ? 'Reproducir desde el principio' : 'Reproducir'}
      >
        {reproduciendo ? '⏸' : '▶'}
      </Boton>

      <Boton
        tamano="icono"
        variante="secundario"
        disabled={enElUltimo}
        onClick={() => saltarA(indiceEfectivo + 1)}
        aria-label="Frame siguiente"
        title="Fase siguiente"
      >
        ⏭
      </Boton>

      <Boton
        tamano="icono"
        variante="secundario"
        onClick={() => saltarA(0)}
        aria-label="Reiniciar la jugada"
        title="Volver a la primera fase"
      >
        ↻
      </Boton>

      {/*
        `input range` a propósito y no un div con listeners: trae gratis el
        arrastre con dedo, el teclado y la accesibilidad, que es lo que pide
        una herramienta pensada también para tablet.
      */}
      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(duracion))}
        step={10}
        value={Math.round(tiempoMostrado)}
        disabled={duracion === 0}
        onChange={(e) => alArrastrarBarra(Number(e.target.value))}
        aria-label="Posición en la jugada"
        aria-valuetext={`${formatearTiempo(tiempoMostrado)} de ${formatearTiempo(duracion)}`}
        title="Arrastra para moverte por la jugada"
        className="barra-jugada h-11 w-24 shrink-0 cursor-pointer sm:w-40"
      />

      <span
        className="shrink-0 select-none font-mono text-[10px] leading-tight text-club-plata/70"
        aria-live="off"
        title="Fase actual y tiempo transcurrido"
      >
        <span className="block font-display font-semibold uppercase tracking-wide text-club-plata">
          Fase {indiceEfectivo + 1}/{total}
        </span>
        <span className="block">
          {formatearTiempo(tiempoMostrado)} / {formatearTiempo(duracion)}
        </span>
      </span>

      <select
        value={velocidad}
        onChange={(e) => setVelocidad(Number(e.target.value) as (typeof VELOCIDADES)[number])}
        aria-label="Velocidad de reproducción"
        title="Velocidad de reproducción"
        className="h-11 shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 text-xs font-medium text-white outline-none focus:border-club-rojo"
      >
        {VELOCIDADES.map((v) => (
          <option key={v} value={v} className="bg-club-carbon">
            {v}x
          </option>
        ))}
      </select>
    </div>
  );
}
