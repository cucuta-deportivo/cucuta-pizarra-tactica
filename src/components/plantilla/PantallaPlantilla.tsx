import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Boton } from '../ui/Boton';
import { FormularioJugador } from './FormularioJugador';
import { renovarEnlacesCaducados, usePlantillaStore } from '../../store/plantillaStore';
import type { Jugador } from '../../types';
import { COLOR } from '../../tokens';

/** Cada cuánto se comprueba si algún enlace firmado está a punto de caducar. */
const INTERVALO_RENOVACION_MS = 5 * 60 * 1000;

function TarjetaJugadorPlantilla({
  jugador,
  onEditar,
  onDesactivar,
}: {
  jugador: Jugador;
  onEditar: () => void;
  onDesactivar: () => void;
}) {
  const [fotoFallida, setFotoFallida] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const hayFoto = Boolean(jugador.fotoUrl) && !fotoFallida;

  return (
    <li
      className="flex flex-col overflow-hidden rounded-lg border border-white/10"
      style={{ backgroundColor: COLOR.superficie.panel }}
    >
      {/*
        Sin foto NO se deja un hueco ni un icono roto: se muestra el dorsal en
        grande sobre fondo oscuro, que además es lo que identifica al jugador.
      */}
      <div
        className="flex aspect-square w-full items-center justify-center overflow-hidden"
        style={{ backgroundColor: COLOR.superficie.panelSecundario }}
      >
        {hayFoto ? (
          <img
            src={jugador.fotoUrl!}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            onError={() => setFotoFallida(true)}
          />
        ) : (
          <span className="font-display text-4xl font-black" style={{ color: COLOR.texto.secundario }}>
            {jugador.dorsal ?? '—'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="truncate font-display text-sm font-semibold uppercase tracking-wide text-white">
          {jugador.dorsal != null && <span style={{ color: COLOR.marca.rojo }}>{jugador.dorsal} </span>}
          {jugador.apellido}
        </p>
        <p className="truncate font-display text-[11px] uppercase tracking-wide" style={{ color: COLOR.campo.etiquetaSecundaria }}>
          {[jugador.posicionNatural, jugador.posicionesSecundarias[0]].filter(Boolean).join(' · ')}
        </p>

        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={onEditar}
            className="min-h-[44px] flex-1 rounded-lg border border-white/10 bg-white/5 text-xs text-white transition-colors duration-base hover:bg-white/10"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => (confirmando ? onDesactivar() : setConfirmando(true))}
            onBlur={() => setConfirmando(false)}
            title="Desactivar no borra al jugador: las alineaciones guardadas que lo incluyen siguen funcionando"
            className="min-h-[44px] flex-1 rounded-lg border text-xs transition-colors duration-base"
            style={{
              borderColor: confirmando ? COLOR.marca.rojo : 'rgba(255,255,255,0.1)',
              color: confirmando ? COLOR.marca.rojo : COLOR.texto.secundario,
            }}
          >
            {confirmando ? '¿Seguro?' : 'Desactivar'}
          </button>
        </div>
      </div>
    </li>
  );
}

interface PantallaPlantillaProps {
  abierto: boolean;
  onCerrar: () => void;
}

/**
 * Gestión de la plantilla por categoría. Sustituye al antiguo modal de gestión:
 * no debe haber dos sitios para lo mismo.
 */
export function PantallaPlantilla({ abierto, onCerrar }: PantallaPlantillaProps) {
  const categorias = usePlantillaStore((s) => s.categorias);
  const categoriaActiva = usePlantillaStore((s) => s.categoriaActiva);
  const jugadores = usePlantillaStore((s) => s.jugadores);
  const cargando = usePlantillaStore((s) => s.cargando);
  const error = usePlantillaStore((s) => s.error);
  const inicializar = usePlantillaStore((s) => s.inicializar);
  const elegirCategoria = usePlantillaStore((s) => s.elegirCategoria);
  const recargar = usePlantillaStore((s) => s.recargar);
  const desactivarJugador = usePlantillaStore((s) => s.desactivarJugador);

  const [editando, setEditando] = useState<Jugador | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  useEffect(() => {
    if (abierto && categorias.length === 0) void inicializar();
  }, [abierto, categorias.length, inicializar]);

  // Los enlaces del bucket caducan; en una sesión larga hay que renovarlos o
  // las fotos empezarían a fallar sin motivo aparente.
  useEffect(() => {
    if (!abierto) return;
    const id = window.setInterval(() => void renovarEnlacesCaducados(), INTERVALO_RENOVACION_MS);
    return () => window.clearInterval(id);
  }, [abierto]);

  return (
    <>
      <Modal abierto={abierto} onCerrar={onCerrar} titulo="Plantilla" ancho="lg">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoriaActiva ?? ''}
              onChange={(e) => void elegirCategoria(e.target.value)}
              aria-label="Categoría"
              disabled={categorias.length === 0}
              className="h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-naranja"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id} className="bg-club-carbon">
                  {c.nombre}
                </option>
              ))}
            </select>

            <span className="text-xs" style={{ color: COLOR.texto.secundario }}>
              {cargando ? 'Cargando…' : `${jugadores.length} ${jugadores.length === 1 ? 'jugador' : 'jugadores'}`}
            </span>

            <div className="flex-1" />

            <Boton
              variante="primario"
              disabled={!categoriaActiva}
              onClick={() => {
                setEditando(null);
                setFormularioAbierto(true);
              }}
            >
              ＋ Agregar jugador
            </Boton>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: COLOR.marca.rojo, color: COLOR.texto.principal }}
            >
              <span className="flex-1">{error}</span>
              <Boton variante="secundario" onClick={() => void recargar()}>
                Reintentar
              </Boton>
            </div>
          )}

          {cargando ? (
            // Marcador de posición mientras llegan los datos y las fotos.
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 10 }, (_, i) => (
                <li
                  key={i}
                  className="h-52 animate-pulse rounded-lg"
                  style={{ backgroundColor: COLOR.superficie.panel }}
                  aria-hidden="true"
                />
              ))}
            </ul>
          ) : jugadores.length === 0 && !error ? (
            <p className="py-10 text-center text-sm" style={{ color: COLOR.texto.secundario }}>
              Esta categoría todavía no tiene jugadores. Empieza agregando uno.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {jugadores.map((jugador) => (
                <TarjetaJugadorPlantilla
                  key={jugador.id}
                  jugador={jugador}
                  onEditar={() => {
                    setEditando(jugador);
                    setFormularioAbierto(true);
                  }}
                  onDesactivar={() => void desactivarJugador(jugador.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <FormularioJugador
        abierto={formularioAbierto}
        jugador={editando}
        onCerrar={() => setFormularioAbierto(false)}
      />
    </>
  );
}
