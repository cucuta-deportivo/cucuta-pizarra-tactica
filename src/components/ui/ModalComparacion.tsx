import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useAlineacionStore } from '../../store/alineacionStore';
import { usePlantillaStore } from '../../store/plantillaStore';
import { alineacionRepository } from '../../data/repositorio';
import { obtenerFormacion } from '../../data/formaciones';
import { VistaAlineacionEstatica } from '../campo/VistaAlineacionEstatica';
import { jugadorDeAlineacion } from '../../utils/fichas';
import type { Alineacion } from '../../types';

interface ModalComparacionProps {
  abierto: boolean;
  onCerrar: () => void;
}

interface OpcionAlineacion {
  id: string;
  nombre: string;
}

function ColumnaComparacion({
  idSeleccionado,
  onCambiarId,
  opciones,
}: {
  idSeleccionado: string | null;
  onCambiarId: (id: string) => void;
  opciones: OpcionAlineacion[];
}) {
  const obtenerPorId = usePlantillaStore((s) => s.obtenerPorId);
  const [alineacion, setAlineacion] = useState<Alineacion | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!idSeleccionado) {
      setAlineacion(null);
      return;
    }
    setCargando(true);
    void alineacionRepository.obtener(idSeleccionado).then((resultado) => {
      if (!cancelado) {
        setAlineacion(resultado ?? null);
        setCargando(false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [idSeleccionado]);

  const formacion = alineacion ? obtenerFormacion(alineacion.formacionId) : undefined;

  return (
    <div className="flex flex-1 flex-col gap-2">
      <select
        value={idSeleccionado ?? ''}
        onChange={(e) => onCambiarId(e.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
      >
        <option value="" className="bg-club-carbon">
          Elegir alineación…
        </option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id} className="bg-club-carbon">
            {o.nombre}
          </option>
        ))}
      </select>

      <div className="flex min-h-[360px] flex-1 items-center justify-center rounded-lg border border-white/10 bg-club-negro/40 p-2">
        {!idSeleccionado ? (
          <p className="text-center text-sm text-club-plata/50">Elige una alineación para verla aquí.</p>
        ) : cargando || !alineacion ? (
          <p className="text-center text-sm text-club-plata/50">Cargando…</p>
        ) : (
          <VistaAlineacionEstatica
            alineacion={alineacion}
            // No es la alineación abierta: sus personalizados y fichas no están en la
            // plantilla en memoria, así que se buscan también en ella.
            obtenerJugador={(id) => obtenerPorId(id) ?? jugadorDeAlineacion(alineacion, id)}
          />
        )}
      </div>

      {alineacion && (
        <p className="text-center text-xs text-club-plata/60">
          {formacion?.nombre ?? '—'} ·{' '}
          {new Date(alineacion.modificadaEn).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      )}
    </div>
  );
}

export function ModalComparacion({ abierto, onCerrar }: ModalComparacionProps) {
  const listado = useAlineacionStore((s) => s.listado);
  const refrescarListado = useAlineacionStore((s) => s.refrescarListado);
  const [idIzquierda, setIdIzquierda] = useState<string | null>(null);
  const [idDerecha, setIdDerecha] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) void refrescarListado();
  }, [abierto, refrescarListado]);

  useEffect(() => {
    if (!abierto || listado.length === 0) return;
    // Preselecciona las dos alineaciones más recientes solo la primera vez;
    // si el usuario ya eligió algo, no se le pisa la selección al refrescar.
    setIdIzquierda((actual) => actual ?? listado[0]?.id ?? null);
    setIdDerecha((actual) => actual ?? listado[1]?.id ?? listado[0]?.id ?? null);
  }, [abierto, listado]);

  const opciones: OpcionAlineacion[] = listado.map((a) => ({ id: a.id, nombre: a.nombre || 'Sin nombre' }));

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Comparar alineaciones" ancho="xl">
      {listado.length < 2 ? (
        <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-club-plata/60">
          Necesitas al menos dos alineaciones guardadas para compararlas.
        </p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <ColumnaComparacion idSeleccionado={idIzquierda} onCambiarId={setIdIzquierda} opciones={opciones} />
          <ColumnaComparacion idSeleccionado={idDerecha} onCambiarId={setIdDerecha} opciones={opciones} />
        </div>
      )}
    </Modal>
  );
}
