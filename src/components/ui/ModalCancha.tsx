import { Modal } from './Modal';
import { useAlineacionStore } from '../../store/alineacionStore';
import { ETIQUETAS_TEMA_CANCHA } from '../../utils/constantes';
import type { TemaCancha, VistaCampo } from '../../types';

interface ModalCanchaProps {
  abierto: boolean;
  onCerrar: () => void;
}

const VISTAS: { valor: VistaCampo; etiqueta: string }[] = [
  { valor: 'completo', etiqueta: 'Campo completo' },
  { valor: 'medio', etiqueta: 'Medio campo' },
  { valor: 'tercio', etiqueta: 'Tercio ofensivo' },
];

export function ModalCancha({ abierto, onCerrar }: ModalCanchaProps) {
  const cancha = useAlineacionStore((s) => s.historial.presente.cancha);
  const actualizarCancha = useAlineacionStore((s) => s.actualizarCancha);

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Identidad de cancha" ancho="sm">
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Tema</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(ETIQUETAS_TEMA_CANCHA) as TemaCancha[]).map((tema) => (
              <button
                key={tema}
                type="button"
                onClick={() => actualizarCancha({ tema })}
                aria-pressed={cancha.tema === tema}
                className={`min-h-[40px] rounded-md px-2 text-xs font-medium transition-colors duration-rapido ${
                  cancha.tema === tema ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
                }`}
              >
                {ETIQUETAS_TEMA_CANCHA[tema]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Vista</p>
          <div className="flex flex-col gap-1.5">
            {VISTAS.map((v) => (
              <button
                key={v.valor}
                type="button"
                onClick={() => actualizarCancha({ vista: v.valor })}
                aria-pressed={cancha.vista === v.valor}
                className={`min-h-[40px] rounded-md px-3 text-left text-sm font-medium transition-colors duration-rapido ${
                  cancha.vista === v.valor ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
                }`}
              >
                {v.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* El monograma se pinta en todos los temas, así que su casilla también va en todos. */}
        <label className="flex items-center justify-between text-sm text-club-plata">
          Monograma en el círculo central
          <input
            type="checkbox"
            checked={cancha.mostrarEscudo}
            onChange={(e) => actualizarCancha({ mostrarEscudo: e.target.checked })}
            className="h-4 w-4 accent-club-rojo"
          />
        </label>

        {cancha.tema === 'estadio' && (
          <label className="flex items-center justify-between text-sm text-club-plata">
            Vallas perimetrales
            <input
              type="checkbox"
              checked={cancha.mostrarValla}
              onChange={(e) => actualizarCancha({ mostrarValla: e.target.checked })}
              className="h-4 w-4 accent-club-rojo"
            />
          </label>
        )}

        <label className="flex items-center justify-between text-sm text-club-plata">
          Girar 180° (perspectiva rival)
          <input
            type="checkbox"
            checked={cancha.rotado180}
            onChange={(e) => actualizarCancha({ rotado180: e.target.checked })}
            className="h-4 w-4 accent-club-rojo"
          />
        </label>
        <p className="-mt-2 text-[11px] text-club-plata/50">Atajo: Shift+R</p>
      </div>
    </Modal>
  );
}
