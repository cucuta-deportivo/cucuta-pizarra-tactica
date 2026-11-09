import { sincronizarAhora } from '../../data/sincronizacion';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useSincronizacionStore, type SincronizacionState } from '../../store/sincronizacionStore';
import type { EstadoGuardado } from '../../types';

/**
 * Si lo de la pizarra está guardado en este dispositivo y si ya está en
 * Supabase (S1.9). Con sincronización, se toca para sincronizar en el momento.
 */
const PUNTO = {
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-400',
  ambarPulso: 'bg-amber-400 animate-pulse',
  rojo: 'bg-club-rojo',
} as const;

export interface DescripcionEstado {
  texto: string;
  punto: keyof typeof PUNTO;
  detalle?: string;
}

const porSubir = (n: number) => `${n} por subir`;

export function describirEstado(guardado: EstadoGuardado, sincronizacion: SincronizacionState): DescripcionEstado {
  if (guardado === 'error') return { texto: 'Error al guardar', punto: 'rojo' };
  if (guardado !== 'guardado') return { texto: 'Guardando…', punto: 'ambarPulso' };
  const { estado, pendientes, mensaje } = sincronizacion;
  switch (estado) {
    case 'inactiva':
      return { texto: 'Guardado', punto: 'verde' };
    case 'sincronizando':
      return { texto: 'Sincronizando…', punto: 'ambarPulso' };
    case 'sin-conexion':
      return { texto: pendientes > 0 ? `Sin conexión · ${porSubir(pendientes)}` : 'Sin conexión', punto: 'ambar' };
    case 'error':
      return { texto: 'Error al sincronizar', punto: 'rojo', detalle: mensaje ?? undefined };
    case 'al-dia':
      return pendientes > 0 ? { texto: `Guardado · ${porSubir(pendientes)}`, punto: 'ambar' } : { texto: 'Sincronizado', punto: 'verde' };
  }
}

function horaDe(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

export function IndicadorEstado({ onSincronizar = () => void sincronizarAhora() }: { onSincronizar?: () => void }) {
  const guardado = useAlineacionStore((s) => s.estadoGuardado);
  const sincronizacion = useSincronizacionStore();
  const { texto, punto, detalle } = describirEstado(guardado, sincronizacion);
  const contenido = (
    <>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[punto]}`} aria-hidden="true" />
      <span className="hidden whitespace-nowrap sm:inline">{texto}</span>
    </>
  );

  if (sincronizacion.estado === 'inactiva') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-club-plata/80" role="status" aria-live="polite" aria-label={texto}>
        {contenido}
      </div>
    );
  }

  const ultima = horaDe(sincronizacion.ultimaVez);
  const titulo = [texto, detalle, ultima && `Última sincronización: ${ultima}`, 'Toca para sincronizar ahora'].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={onSincronizar}
      title={titulo}
      aria-label={titulo}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-club-plata/80 transition-colors hover:bg-white/5 hover:text-white"
    >
      <span role="status" aria-live="polite" className="flex items-center gap-1.5">
        {contenido}
      </span>
    </button>
  );
}
