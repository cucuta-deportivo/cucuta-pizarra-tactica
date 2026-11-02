import { Dropdown } from '../ui/Dropdown';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useUiStore } from '../../store/uiStore';
import { FORMACIONES, obtenerFormacion } from '../../data/formaciones';
import type { Formacion } from '../../types';

function MiniCampo({ formacion, activa }: { formacion: Formacion; activa: boolean }) {
  return (
    <div
      className={`relative h-14 w-10 shrink-0 overflow-hidden rounded border bg-club-cesped ${
        activa ? 'border-club-rojo' : 'border-white/15'
      }`}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/25" />
      {formacion.zonas.map((z) => (
        <span
          key={z.id}
          className="absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `${z.x}%`, top: `${100 - z.y}%` }}
        />
      ))}
    </div>
  );
}

export function SelectorFormacion() {
  const formacionActualId = useAlineacionStore((s) => s.historial.presente.formacionId);
  const seleccionarFormacion = useAlineacionStore((s) => s.seleccionarFormacion);
  const mostrarToast = useUiStore((s) => s.mostrarToast);
  const formacionActual = obtenerFormacion(formacionActualId);

  // Sin pregunta previa: nadie se mueve y el cambio se deshace desde el aviso.
  function elegir(id: string): void {
    if (id === formacionActualId) return;
    seleccionarFormacion(id);
    const titulares = useAlineacionStore.getState().historial.presente.titulares;
    if (titulares.length === 0) return;
    const fuera = titulares.filter((t) => t.fueraDeEsquema).length;
    mostrarToast({
      tipo: 'info',
      mensaje:
        fuera === 0
          ? `Formación ${obtenerFormacion(id)?.nombre}. Nadie se ha movido.`
          : `Formación ${obtenerFormacion(id)?.nombre}. ${fuera === 1 ? '1 jugador queda' : `${fuera} jugadores quedan`} fuera del esquema (aro ámbar): toca una zona fantasma para ubicarlo.`,
      accion: { etiqueta: 'Deshacer', ejecutar: () => useAlineacionStore.getState().deshacer() },
    });
  }

  return (
    <>
      <Dropdown
        gatillo={({ abierto, alternar }) => (
          <button
            type="button"
            onClick={alternar}
            aria-haspopup="true"
            aria-expanded={abierto}
            className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-left transition-colors duration-rapido hover:border-club-rojo/60 sm:px-3"
          >
            {formacionActual && <MiniCampo formacion={formacionActual} activa />}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-display text-base font-bold uppercase tracking-wide text-white sm:text-lg">
                {formacionActual?.nombre ?? 'Elegir formación'}
              </span>
              {formacionActual?.variante && (
                <span className="truncate text-[11px] text-club-plata/70">{formacionActual.variante}</span>
              )}
            </span>
            <span className="ml-0.5 text-club-plata/60">▾</span>
          </button>
        )}
      >
        {(cerrar) => (
          <div
            role="listbox"
            aria-label="Formaciones disponibles"
            className="superficie-vidrio barra-scroll grid max-h-[70dvh] w-[260px] grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-white/10 p-3 shadow-elevada sm:w-[340px] sm:grid-cols-3"
          >
            {FORMACIONES.map((f) => (
              <button
                key={f.id}
                type="button"
                role="option"
                aria-selected={f.id === formacionActualId}
                onClick={() => {
                  elegir(f.id);
                  cerrar();
                }}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors duration-rapido hover:border-club-rojo/60 hover:bg-white/5 ${
                  f.id === formacionActualId ? 'border-club-rojo bg-club-rojo/10' : 'border-white/10'
                }`}
              >
                <MiniCampo formacion={f} activa={f.id === formacionActualId} />
                <span className="font-display text-xs font-bold text-white">{f.nombre}</span>
              </button>
            ))}
          </div>
        )}
      </Dropdown>
    </>
  );
}
