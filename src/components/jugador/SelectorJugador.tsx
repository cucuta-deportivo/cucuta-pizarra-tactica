import { useEffect, useMemo, useState } from 'react';
import { usePlantillaStore } from '../../store/plantillaStore';
import { useAlineacionStore } from '../../store/alineacionStore';
import { Modal } from '../ui/Modal';
import type { Jugador, Posicion } from '../../types';
import { ETIQUETAS_POSICION, ORDEN_POSICION } from '../../utils/constantes';

interface SelectorJugadorProps {
  abierto: boolean;
  onCerrar: () => void;
  posicionSugerida: Posicion | null;
  titulo?: string;
  onSeleccionarJugador: (jugadorId: string) => void;
  /** Si se pasa, aparece el atajo para crear un jugador que no está en la plantilla. */
  onCrearPersonalizado?: () => void;
}

function coincideFiltro(jugador: Jugador, filtro: Posicion | null): 0 | 1 | 2 {
  if (!filtro) return 0;
  if (jugador.posicionNatural === filtro) return 0;
  if (jugador.posicionesSecundarias.includes(filtro)) return 1;
  return 2;
}

export function SelectorJugador({
  abierto,
  onCerrar,
  posicionSugerida,
  titulo,
  onSeleccionarJugador,
  onCrearPersonalizado,
}: SelectorJugadorProps) {
  const jugadores = usePlantillaStore((s) => s.jugadores);
  const titulares = useAlineacionStore((s) => s.historial.presente.titulares);
  const banquillo = useAlineacionStore((s) => s.historial.presente.banquillo);

  const [busqueda, setBusqueda] = useState('');
  const [filtroPosicion, setFiltroPosicion] = useState<Posicion | null>(posicionSugerida);
  const [verTodos, setVerTodos] = useState(false);

  // SelectorJugador nunca se desmonta entre una zona y otra (Campo solo
  // alterna `abierto`), así que el estado inicial de `useState` no basta:
  // sin este efecto, el filtro quedaba anclado al primer valor de
  // `posicionSugerida` visto en el montaje (o al último capturado al cerrar)
  // y no reflejaba la zona recién pulsada.
  useEffect(() => {
    if (abierto) {
      setFiltroPosicion(posicionSugerida);
      setBusqueda('');
      setVerTodos(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, posicionSugerida]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return jugadores
      .filter((j) => j.activo)
      .filter((j) => verTodos || !filtroPosicion || coincideFiltro(j, filtroPosicion) <= 1)
      .filter((j) => !q || j.nombre.toLowerCase().includes(q) || j.apellido.toLowerCase().includes(q) || String(j.dorsal).includes(q))
      .sort((a, b) => {
        const puntajeA = coincideFiltro(a, filtroPosicion);
        const puntajeB = coincideFiltro(b, filtroPosicion);
        if (puntajeA !== puntajeB) return puntajeA - puntajeB;
        // Los jugadores sin dorsal van al final, no al principio como haría un null.
        return (a.dorsal ?? 100) - (b.dorsal ?? 100);
      });
  }, [jugadores, busqueda, filtroPosicion, verTodos]);

  function ubicacionDe(jugadorId: string): string | null {
    const titular = titulares.find((t) => t.jugadorId === jugadorId);
    if (titular) return 'En cancha';
    if (banquillo.includes(jugadorId)) return 'En el banquillo';
    return null;
  }

  function manejarCierre() {
    setBusqueda('');
    setVerTodos(false);
    setFiltroPosicion(posicionSugerida);
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={manejarCierre}
      titulo={titulo ?? (posicionSugerida ? `Asignar ${ETIQUETAS_POSICION[posicionSugerida]}` : 'Elegir jugador')}
      ancho="lg"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o dorsal…"
            className="h-11 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-club-plata/50 outline-none focus:border-club-rojo"
          />
          <select
            value={filtroPosicion ?? ''}
            disabled={verTodos}
            onChange={(e) => setFiltroPosicion((e.target.value || null) as Posicion | null)}
            className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo disabled:opacity-40"
          >
            <option value="">Todas las posiciones</option>
            {ORDEN_POSICION.map((p) => (
              <option key={p} value={p} className="bg-club-carbon">
                {p} · {ETIQUETAS_POSICION[p]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-club-plata">
          <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} className="h-4 w-4 accent-club-rojo" />
          Ver toda la plantilla
        </label>

        {onCrearPersonalizado && (
          <button
            type="button"
            onClick={() => {
              manejarCierre();
              onCrearPersonalizado();
            }}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-dashed border-white/20 px-3 py-2 text-left transition-colors duration-rapido hover:border-club-rojo/60 hover:bg-white/5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 font-display text-base font-bold text-club-rojo ring-1 ring-white/10">
              ＋
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-display text-sm font-semibold uppercase tracking-wide text-white">
                Jugador personalizado
              </span>
              <span className="text-xs text-club-plata/70">
                {posicionSugerida ? `Crear uno nuevo para ${posicionSugerida}` : 'Crear uno que no está en la plantilla'}
              </span>
            </span>
          </button>
        )}

        <ul className="barra-scroll -mx-1 flex max-h-[50vh] flex-col gap-1 overflow-y-auto px-1">
          {visibles.length === 0 && <li className="py-6 text-center text-sm text-club-plata/60">Sin resultados.</li>}
          {visibles.map((jugador) => {
            const ubicacion = ubicacionDe(jugador.id);
            return (
              <li key={jugador.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSeleccionarJugador(jugador.id);
                    manejarCierre();
                  }}
                  className={`flex w-full min-h-[44px] items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors duration-rapido hover:border-club-rojo/50 hover:bg-white/5 ${
                    ubicacion ? 'opacity-60' : ''
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-club-rojo to-club-negro font-display text-sm font-bold text-white">
                    {jugador.dorsal}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-display text-sm font-semibold uppercase tracking-wide text-white">
                      {jugador.nombre} {jugador.apellido}
                    </span>
                    <span className="text-xs text-club-plata/70">
                      {jugador.posicionNatural}
                      {jugador.posicionesSecundarias.length > 0 ? ` · sec. ${jugador.posicionesSecundarias.join('/')}` : ''}
                    </span>
                  </span>
                  {ubicacion && (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-club-plata">
                      {ubicacion}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
