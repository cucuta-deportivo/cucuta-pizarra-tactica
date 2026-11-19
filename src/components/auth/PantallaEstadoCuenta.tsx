import { useAuthStore } from '../../store/authStore';
import { Boton } from '../ui/Boton';
import type { EstadoCuenta } from '../../types/auth';

interface PantallaEstadoCuentaProps {
  estado: Exclude<EstadoCuenta, 'activo'>;
}

const CONTENIDO: Record<Exclude<EstadoCuenta, 'activo'>, { titulo: string; mensaje: string }> = {
  pendiente: {
    titulo: 'Cuenta pendiente de aprobación',
    mensaje:
      'Tu cuenta fue creada correctamente, pero un entrenador del cuerpo técnico todavía debe aprobarla antes de que puedas entrar. Avísale y, cuando te apruebe, toca «Comprobar de nuevo».',
  },
  bloqueado: {
    titulo: 'Cuenta bloqueada',
    mensaje: 'Esta cuenta está bloqueada. Contacta a un entrenador del cuerpo técnico para más información.',
  },
};

export function PantallaEstadoCuenta({ estado }: PantallaEstadoCuentaProps) {
  const cerrarSesion = useAuthStore((s) => s.cerrarSesion);
  const contenido = CONTENIDO[estado];

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-club-negro p-4">
      <div className="superficie-vidrio relative z-10 w-full max-w-[380px] rounded-2xl border border-white/10 p-6 text-center shadow-elevada animar-entrada-tarjeta">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-club-rojo/15 text-2xl">
          {estado === 'pendiente' ? '⏳' : '🔒'}
        </div>
        <h1 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-white">{contenido.titulo}</h1>
        <p className="mb-6 text-sm text-club-plata/70">{contenido.mensaje}</p>
        {estado === 'pendiente' && (
          // Recargar vuelve a leer la cuenta: si ya la aprobaron, entra. Sin señal se queda aquí, como antes.
          <Boton variante="primario" onClick={() => window.location.reload()} className="mb-2 w-full">
            Comprobar de nuevo
          </Boton>
        )}
        <Boton variante="secundario" onClick={() => void cerrarSesion()} className="w-full">
          Cerrar sesión
        </Boton>
      </div>
    </div>
  );
}
