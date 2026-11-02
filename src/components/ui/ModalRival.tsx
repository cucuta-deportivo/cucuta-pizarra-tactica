import { Modal } from './Modal';
import { Boton } from './Boton';
import { useAlineacionStore } from '../../store/alineacionStore';
import { FORMACIONES } from '../../data/formaciones';
import { ETIQUETAS_PALETA_RIVAL, PALETA_RIVAL } from '../../utils/constantes';
import { hayJugadoresEnCampoRival, seVenAmbosEquipos } from '../../utils/anexoA';
import type { ModoVistaEquipos, PaletaRival } from '../../types';

interface ModalRivalProps {
  abierto: boolean;
  onCerrar: () => void;
}

const MODOS_VISTA: { valor: ModoVistaEquipos; etiqueta: string }[] = [
  { valor: 'solo_nosotros', etiqueta: 'Solo nosotros' },
  { valor: 'ambos', etiqueta: 'Ambos' },
  { valor: 'solo_rival', etiqueta: 'Solo rival' },
];

export function ModalRival({ abierto, onCerrar }: ModalRivalProps) {
  const rival = useAlineacionStore((s) => s.historial.presente.rival);
  const activarRival = useAlineacionStore((s) => s.activarRival);
  const desactivarRival = useAlineacionStore((s) => s.desactivarRival);
  const actualizarRival = useAlineacionStore((s) => s.actualizarRival);
  const seleccionarFormacionRival = useAlineacionStore((s) => s.seleccionarFormacionRival);
  const titulares = useAlineacionStore((s) => s.historial.presente.titulares);
  const acomodarEnMiMitad = useAlineacionStore((s) => s.acomodarEnMiMitad);

  if (!rival) {
    return (
      <Modal abierto={abierto} onCerrar={onCerrar} titulo="Equipo rival" ancho="sm">
        <p className="mb-3 text-sm text-club-plata/70">Elige una formación para activar al equipo rival.</p>
        <div className="grid grid-cols-3 gap-2">
          {FORMACIONES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                activarRival(f.id);
                onCerrar();
              }}
              className="min-h-[44px] rounded-lg border border-white/10 px-2 text-sm font-bold text-white hover:border-club-rojo/60 hover:bg-white/5"
            >
              {f.nombre}
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Equipo rival" ancho="sm">
      <div className="flex flex-col gap-4">
        <label className="text-xs text-club-plata">
          Nombre del rival
          <input
            type="text"
            maxLength={40}
            value={rival.nombre}
            onChange={(e) => actualizarRival({ nombre: e.target.value })}
            className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
          />
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Formación rival</p>
          <div className="grid grid-cols-3 gap-1.5">
            {FORMACIONES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => seleccionarFormacionRival(f.id)}
                aria-pressed={rival.formacionId === f.id}
                className={`min-h-[38px] rounded-md px-1 text-xs font-bold transition-colors duration-rapido ${
                  rival.formacionId === f.id ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
                }`}
              >
                {f.nombre}
              </button>
            ))}
          </div>
          {rival.jugadores.length > 0 && (
            <p className="mt-1.5 text-[11px] text-club-plata/50">Cambiar de formación vacía a los jugadores rivales ya colocados.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Paleta</p>
          <div className="flex gap-2">
            {(Object.keys(PALETA_RIVAL) as PaletaRival[]).map((paleta) => (
              <button
                key={paleta}
                type="button"
                onClick={() => actualizarRival({ paleta })}
                aria-pressed={rival.paleta === paleta}
                aria-label={ETIQUETAS_PALETA_RIVAL[paleta]}
                title={ETIQUETAS_PALETA_RIVAL[paleta]}
                className={`h-8 w-8 rounded-full border-2 transition-transform duration-rapido ${
                  rival.paleta === paleta ? 'scale-110 border-white' : 'border-white/20'
                }`}
                style={{ backgroundColor: PALETA_RIVAL[paleta].principal }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Vista</p>
          <div className="flex gap-1.5">
            {MODOS_VISTA.map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => actualizarRival({ modoVista: m.valor })}
                aria-pressed={rival.modoVista === m.valor}
                className={`min-h-[36px] flex-1 rounded-md px-1 text-xs font-medium transition-colors duration-rapido ${
                  rival.modoVista === m.valor ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* Recolocar a los nuestros nunca es automático (paso 7b): se ofrece aquí mientras haga falta. */}
        {seVenAmbosEquipos(rival) && hayJugadoresEnCampoRival(titulares) && (
          <Boton
            variante="secundario"
            onClick={() => {
              acomodarEnMiMitad();
              onCerrar();
            }}
          >
            Acomodar mi equipo en mi mitad
          </Boton>
        )}

        <Boton
          variante="peligro"
          onClick={() => {
            desactivarRival();
            onCerrar();
          }}
        >
          Desactivar rival
        </Boton>
      </div>
    </Modal>
  );
}
