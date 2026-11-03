import { Modal } from './Modal';
import { Boton } from './Boton';
import { useAlineacionStore } from '../../store/alineacionStore';
import { usePizarraCampoStore } from '../../store/pizarraCampoStore';
import { DEFINICION_PRESETS_CUADRICULA, OPACIDAD_CUADRICULA_MAXIMA } from '../../utils/constantes';
import type { EstiloLineaCuadricula, PresetCuadricula } from '../../types';

interface ModalZonasProps {
  abierto: boolean;
  onCerrar: () => void;
}

const PRESETS_SELECCIONABLES = Object.keys(DEFINICION_PRESETS_CUADRICULA).filter((p) => p !== 'off') as Exclude<
  PresetCuadricula,
  'off' | 'personalizada'
>[];

const ESTILOS_LINEA: { valor: EstiloLineaCuadricula; etiqueta: string }[] = [
  { valor: 'solida', etiqueta: 'Continua' },
  { valor: 'discontinua', etiqueta: 'Discontinua' },
  { valor: 'puntos', etiqueta: 'Puntos' },
];

export function ModalZonas({ abierto, onCerrar }: ModalZonasProps) {
  const cuadricula = useAlineacionStore((s) => s.historial.presente.cuadricula);
  const actualizarCuadricula = useAlineacionStore((s) => s.actualizarCuadricula);
  const setUltimoPreset = usePizarraCampoStore((s) => s.setUltimoPresetCuadricula);

  function elegirPreset(preset: Exclude<PresetCuadricula, 'off'>): void {
    const def = preset === 'personalizada' ? null : DEFINICION_PRESETS_CUADRICULA[preset];
    actualizarCuadricula({
      preset,
      columnas: def?.columnas ?? Math.max(2, Math.min(8, cuadricula.columnas || 4)),
      filas: def?.filas ?? Math.max(2, Math.min(8, cuadricula.filas || 4)),
    });
    setUltimoPreset(preset);
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Cuadrícula y zonas" ancho="sm">
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Preset</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS_SELECCIONABLES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => elegirPreset(preset)}
                aria-pressed={cuadricula.preset === preset}
                className={`min-h-[40px] rounded-md px-2 text-xs font-medium transition-colors duration-rapido ${
                  cuadricula.preset === preset ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
                }`}
              >
                {DEFINICION_PRESETS_CUADRICULA[preset].etiqueta}
              </button>
            ))}
            <button
              type="button"
              onClick={() => elegirPreset('personalizada')}
              aria-pressed={cuadricula.preset === 'personalizada'}
              className={`min-h-[40px] rounded-md px-2 text-xs font-medium transition-colors duration-rapido ${
                cuadricula.preset === 'personalizada' ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
              }`}
            >
              Personalizada
            </button>
          </div>
        </div>

        {cuadricula.preset === 'personalizada' && (
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-club-plata">
              Columnas
              <input
                type="number"
                min={2}
                max={8}
                value={cuadricula.columnas}
                onChange={(e) => actualizarCuadricula({ columnas: Math.max(2, Math.min(8, Number(e.target.value) || 2)) })}
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white outline-none focus:border-club-rojo"
              />
            </label>
            <label className="flex-1 text-xs text-club-plata">
              Filas
              <input
                type="number"
                min={2}
                max={8}
                value={cuadricula.filas}
                onChange={(e) => actualizarCuadricula({ filas: Math.max(2, Math.min(8, Number(e.target.value) || 2)) })}
                className="mt-1 h-9 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white outline-none focus:border-club-rojo"
              />
            </label>
          </div>
        )}

        <label className="text-xs text-club-plata">
          Opacidad ({Math.round(cuadricula.opacidad * 100)}%)
          <input
            type="range"
            min={0}
            max={OPACIDAD_CUADRICULA_MAXIMA}
            step={0.02}
            value={cuadricula.opacidad}
            onChange={(e) => actualizarCuadricula({ opacidad: Number(e.target.value) })}
            className="mt-1 w-full accent-club-rojo"
          />
        </label>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Estilo de línea</p>
          <div className="flex gap-1.5">
            {ESTILOS_LINEA.map((e) => (
              <button
                key={e.valor}
                type="button"
                onClick={() => actualizarCuadricula({ estiloLinea: e.valor })}
                aria-pressed={cuadricula.estiloLinea === e.valor}
                className={`min-h-[36px] flex-1 rounded-md px-1 text-xs font-medium transition-colors duration-rapido ${
                  cuadricula.estiloLinea === e.valor ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
                }`}
              >
                {e.etiqueta}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between text-sm text-club-plata">
          Etiquetas de zona (Z1…Zn / carriles)
          <input
            type="checkbox"
            checked={cuadricula.mostrarEtiquetas}
            onChange={(e) => actualizarCuadricula({ mostrarEtiquetas: e.target.checked })}
            className="h-4 w-4 accent-club-rojo"
          />
        </label>

        <Boton
          variante="secundario"
          onClick={() => {
            actualizarCuadricula({ preset: 'off', columnas: 0, filas: 0 });
            onCerrar();
          }}
        >
          Ocultar cuadrícula
        </Boton>
      </div>
    </Modal>
  );
}
