import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUiStore } from '../../store/uiStore';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useBuscarJugador } from '../../store/plantillaStore';
import { DraggableJugador } from '../jugador/DraggableJugador';
import { SelectorJugador } from '../jugador/SelectorJugador';
import { ModalJugadorPersonalizado } from '../jugador/ModalJugadorPersonalizado';
import { Boton } from './Boton';
import { CAPACIDAD_BANQUILLO } from '../../utils/constantes';

export function DrawerPlantilla() {
  const abierto = useUiStore((s) => s.drawerPlantillaAbierto);
  const cerrar = useUiStore((s) => s.cerrarDrawerPlantilla);
  const esMovil = useMediaQuery('(max-width: 639px)');

  const titulares = useAlineacionStore((s) => s.historial.presente.titulares);
  const banquillo = useAlineacionStore((s) => s.historial.presente.banquillo);
  const enviarABanquillo = useAlineacionStore((s) => s.enviarABanquillo);
  const quitarDeBanquillo = useAlineacionStore((s) => s.quitarDeBanquillo);
  const agregarJugadorPersonalizado = useAlineacionStore((s) => s.agregarJugadorPersonalizado);
  // Igual que en Campo: suscribirse a las listas, no a `obtenerPorId` (identidad estable),
  // para que un jugador personalizado recién creado aparezca ya en el banquillo.
  const obtenerPorId = useBuscarJugador();

  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(false);
  const { setNodeRef: setDroppableBanquillo, isOver: sobreBanquillo } = useDroppable({ id: 'banquillo' });

  const conteoTitulares = titulares.length;
  const completo = conteoTitulares === 11;

  const clasesPanel = esMovil
    ? `fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-2xl border-t transition-transform duration-base ${
        abierto ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`
    : `fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-sm flex-col border-l transition-transform duration-base ${
        abierto ? 'translate-x-0' : 'pointer-events-none translate-x-full'
      }`;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-base ${
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={cerrar}
        aria-hidden="true"
      />
      <aside
        className={`${clasesPanel} border-white/10 bg-club-carbon shadow-elevada`}
        aria-label="Plantilla y banquillo"
        aria-hidden={!abierto}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-white">Plantilla</h2>
            <p className={`text-xs font-semibold ${completo ? 'text-emerald-400' : 'text-amber-400'}`}>
              {conteoTitulares}/11 en cancha
            </p>
          </div>
          <button
            onClick={cerrar}
            aria-label="Cerrar panel"
            className="flex h-11 w-11 items-center justify-center rounded-full text-club-plata hover:bg-white/10"
          >
            ✕
          </button>
        </header>

        <div
          ref={setDroppableBanquillo}
          className={`barra-scroll flex-1 overflow-y-auto p-4 transition-colors duration-rapido ${
            sobreBanquillo ? 'bg-club-rojo/10 ring-2 ring-inset ring-club-rojo/50' : ''
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-club-plata">
              Banquillo · {banquillo.length}/{CAPACIDAD_BANQUILLO}
            </h3>
            <Boton tamano="md" variante="secundario" onClick={() => setSelectorAbierto(true)} disabled={banquillo.length >= CAPACIDAD_BANQUILLO}>
              + Añadir
            </Boton>
          </div>

          {banquillo.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-club-plata/60">
              Sin suplentes convocados. Añádelos o arrastra aquí un titular desde el campo para enviarlo al banquillo.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4">
              {banquillo.map((id) => {
                const jugador = obtenerPorId(id);
                if (!jugador) return null;
                return (
                  <div key={id} className="relative flex flex-col items-center">
                    <DraggableJugador jugador={jugador} origen="banquillo" tamano="sm" />
                    <button
                      onClick={() => quitarDeBanquillo(id)}
                      aria-label={`Quitar a ${jugador.apellido} del banquillo`}
                      className="mt-8 min-h-[44px] min-w-[44px] px-2 text-[10px] font-medium text-club-plata/60 hover:text-club-rojo"
                    >
                      Quitar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <SelectorJugador
        abierto={selectorAbierto}
        onCerrar={() => setSelectorAbierto(false)}
        posicionSugerida={null}
        titulo="Añadir al banquillo"
        onSeleccionarJugador={(jugadorId) => enviarABanquillo(jugadorId)}
        onCrearPersonalizado={() => setPersonalizadoAbierto(true)}
      />

      <ModalJugadorPersonalizado
        abierto={personalizadoAbierto}
        posicionSugerida={null}
        onCerrar={() => setPersonalizadoAbierto(false)}
        onCrear={(jugador) => {
          agregarJugadorPersonalizado(jugador);
          enviarABanquillo(jugador.id);
        }}
      />
    </>
  );
}
