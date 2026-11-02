import { useState } from 'react';
import { usePizarraCampoStore, type HerramientaDistribucion } from '../../store/pizarraCampoStore';
import { useAlineacionStore } from '../../store/alineacionStore';
import { IconoObjeto } from '../campo/IconoObjeto';
import { Boton } from '../ui/Boton';
import { Modal } from '../ui/Modal';
import { COLORES_OBJETO, ETIQUETAS_OBJETO, ORDEN_COLOR_OBJETO, TIPOS_OBJETO } from '../../utils/constantes';

interface FlyoutObjetosProps {
  onCerrar: () => void;
}

const HERRAMIENTAS_DISTRIBUCION: { valor: HerramientaDistribucion; etiqueta: string; icono: string }[] = [
  { valor: 'ninguna', etiqueta: 'Individual', icono: '•' },
  { valor: 'fila', etiqueta: 'Fila', icono: '⋯' },
  { valor: 'slalom', etiqueta: 'Slalom', icono: '〜' },
  { valor: 'rejilla', etiqueta: 'Rejilla', icono: '▦' },
];

export function FlyoutObjetos({ onCerrar }: FlyoutObjetosProps) {
  const tipoObjetoActivo = usePizarraCampoStore((s) => s.tipoObjetoActivo);
  const colorObjetoActivo = usePizarraCampoStore((s) => s.colorObjetoActivo);
  const herramientaDistribucion = usePizarraCampoStore((s) => s.herramientaDistribucion);
  const nDistribucion = usePizarraCampoStore((s) => s.nDistribucion);
  const activarModoObjeto = usePizarraCampoStore((s) => s.activarModoObjeto);
  const setColorObjetoActivo = usePizarraCampoStore((s) => s.setColorObjetoActivo);
  const setHerramientaDistribucion = usePizarraCampoStore((s) => s.setHerramientaDistribucion);
  const setNDistribucion = usePizarraCampoStore((s) => s.setNDistribucion);

  const totalObjetos = useAlineacionStore((s) => s.historial.presente.objetos.length);
  const limpiarObjetos = useAlineacionStore((s) => s.limpiarObjetos);
  const [confirmandoLimpiar, setConfirmandoLimpiar] = useState(false);

  return (
    <div className="superficie-vidrio flex flex-wrap items-center gap-2 rounded-xl border border-white/10 px-3 py-2 shadow-tarjeta">
      <div className="flex items-center gap-1" role="group" aria-label="Tipo de objeto">
        {TIPOS_OBJETO.map((tipo) => (
          <button
            key={tipo}
            type="button"
            onClick={() => activarModoObjeto(tipo)}
            aria-pressed={tipoObjetoActivo === tipo}
            title={ETIQUETAS_OBJETO[tipo]}
            aria-label={ETIQUETAS_OBJETO[tipo]}
            className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-rapido ${
              tipoObjetoActivo === tipo ? 'bg-club-rojo/25 ring-1 ring-club-rojo' : 'hover:bg-white/10'
            }`}
          >
            <IconoObjeto tipo={tipo} color={COLORES_OBJETO[colorObjetoActivo]} tamano={22} />
          </button>
        ))}
      </div>

      <span className="mx-1 h-6 w-px bg-white/10" />

      {/* El círculo de color sigue midiendo 24 px; el botón que lo envuelve da los 44 px táctiles. */}
      <div className="flex items-center" role="group" aria-label="Color del objeto">
        {ORDEN_COLOR_OBJETO.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Color ${color}`}
            aria-pressed={colorObjetoActivo === color}
            onClick={() => setColorObjetoActivo(color)}
            className="group flex h-11 w-11 items-center justify-center"
          >
            <span
              className={`h-6 w-6 rounded-full border-2 transition-transform duration-rapido group-active:scale-90 ${
                colorObjetoActivo === color ? 'scale-110 border-white' : 'border-white/20'
              }`}
              style={{ backgroundColor: COLORES_OBJETO[color] }}
            />
          </button>
        ))}
      </div>

      <span className="mx-1 h-6 w-px bg-white/10" />

      <div className="flex items-center gap-1" role="group" aria-label="Herramienta de distribución">
        {HERRAMIENTAS_DISTRIBUCION.map((h) => (
          <Boton key={h.valor} tamano="icono" activo={herramientaDistribucion === h.valor} title={h.etiqueta} aria-label={h.etiqueta} onClick={() => setHerramientaDistribucion(h.valor)}>
            {h.icono}
          </Boton>
        ))}
        {herramientaDistribucion !== 'ninguna' && herramientaDistribucion !== 'rejilla' && (
          <label className="ml-1 flex items-center gap-1 text-xs text-club-plata">
            N
            <input
              type="number"
              min={2}
              max={12}
              value={nDistribucion}
              onChange={(e) => setNDistribucion(Math.max(2, Math.min(12, Number(e.target.value) || 2)))}
              className="h-11 w-12 rounded-md border border-white/10 bg-white/5 px-1 text-center text-white outline-none focus:border-club-rojo"
            />
          </label>
        )}
      </div>

      <span className="mx-1 h-6 w-px bg-white/10" />

      <Boton
        tamano="icono"
        variante="peligro"
        disabled={totalObjetos === 0}
        onClick={() => setConfirmandoLimpiar(true)}
        aria-label="Borrar todos los objetos"
        title={totalObjetos === 0 ? 'No hay objetos en el campo' : `Borrar los ${totalObjetos} objetos del campo`}
      >
        🗑
      </Boton>

      <Boton tamano="icono" onClick={onCerrar} aria-label="Cerrar panel de objetos" title="Cerrar (Esc)">
        ✕
      </Boton>

      <Modal abierto={confirmandoLimpiar} onCerrar={() => setConfirmandoLimpiar(false)} titulo="Borrar objetos" ancho="sm">
        <p className="text-sm text-club-plata">
          Se eliminarán los {totalObjetos} objetos colocados en el campo (conos, picas, aros…). No afecta a los jugadores, al
          balón ni a los trazos dibujados.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setConfirmandoLimpiar(false)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => {
              limpiarObjetos();
              setConfirmandoLimpiar(false);
            }}
          >
            Borrar todo
          </Boton>
        </div>
      </Modal>
    </div>
  );
}
