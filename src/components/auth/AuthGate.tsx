import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabaseConfigurado } from '../../lib/supabaseClient';
import { PantallaAcceso } from './PantallaAcceso';
import { FormularioRegistro } from './FormularioRegistro';
import { PantallaNuevaContrasena } from './PantallaNuevaContrasena';
import { PantallaEstadoCuenta } from './PantallaEstadoCuenta';

/** Sin red, con la sesión guardada pero sin los datos de la cuenta en el dispositivo (S1.13). */
function PantallaSinDatosSinConexion() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-club-negro px-6 text-center text-club-plata">
      <p className="font-display text-lg font-semibold uppercase tracking-wide text-white">Sin conexión</p>
      <p className="max-w-sm text-sm">
        Para usar la pizarra sin señal hay que haber entrado una vez con señal en este dispositivo. Cuando vuelva la conexión, entra
        con normalidad.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-[44px] rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white hover:bg-white/10"
      >
        Reintentar
      </button>
    </div>
  );
}

function PantallaCargaAuth() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-club-negro text-club-plata">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-club-rojo border-t-transparent" />
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const inicializar = useAuthStore((s) => s.inicializar);
  const cargando = useAuthStore((s) => s.cargando);
  const session = useAuthStore((s) => s.session);
  const perfil = useAuthStore((s) => s.perfil);
  const enRecuperacion = useAuthStore((s) => s.enRecuperacion);
  const sinDatosSinConexion = useAuthStore((s) => s.sinDatosSinConexion);
  const finalizarRecuperacion = useAuthStore((s) => s.finalizarRecuperacion);

  const [pantalla, setPantalla] = useState<'login' | 'registro'>('login');

  useEffect(() => {
    inicializar();
  }, [inicializar]);

  if (!supabaseConfigurado) return <>{children}</>;
  if (cargando) return <PantallaCargaAuth />;

  if (enRecuperacion) {
    return <PantallaNuevaContrasena onListo={finalizarRecuperacion} />;
  }

  if (!session) {
    return pantalla === 'login' ? (
      <PantallaAcceso onIrARegistro={() => setPantalla('registro')} />
    ) : (
      <FormularioRegistro onVolver={() => setPantalla('login')} />
    );
  }

  if (sinDatosSinConexion) return <PantallaSinDatosSinConexion />;
  if (!perfil) return <PantallaCargaAuth />;

  if (perfil.estado !== 'activo') {
    return <PantallaEstadoCuenta estado={perfil.estado} />;
  }

  return <>{children}</>;
}
