import { useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabaseClient';
import { Boton } from '../ui/Boton';

interface PantallaAccesoProps {
  onIrARegistro: () => void;
}

export function PantallaAcceso({ onIrARegistro }: PantallaAccesoProps) {
  const iniciarSesion = useAuthStore((s) => s.iniciarSesion);
  const enviando = useAuthStore((s) => s.enviando);

  const [modo, setModo] = useState<'login' | 'recuperar'>('login');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [correoRecuperar, setCorreoRecuperar] = useState('');
  const [enviandoRecuperacion, setEnviandoRecuperacion] = useState(false);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);

  async function manejarEnvio(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    setError(null);
    const resultado = await iniciarSesion(usuario.trim(), password, recordar);
    if (!resultado.ok) setError(resultado.mensaje ?? 'No se pudo iniciar sesión.');
  }

  async function manejarRecuperacion(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    setEnviandoRecuperacion(true);
    try {
      await supabase.auth.resetPasswordForEmail(correoRecuperar.trim(), { redirectTo: window.location.origin });
      setEnlaceEnviado(true);
    } finally {
      setEnviandoRecuperacion(false);
    }
  }

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-club-negro p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-20 blur-md"
        style={{ background: 'radial-gradient(circle at 50% 30%, #1E5B32 0%, #111111 70%)' }}
        aria-hidden="true"
      />
      <div className="superficie-vidrio relative z-10 w-full max-w-[380px] rounded-2xl border border-white/10 p-6 shadow-elevada animar-entrada-tarjeta">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-club-negro font-display text-2xl font-black text-club-rojo ring-1 ring-white/15">
            C
          </div>
          <div>
            <h1 className="font-display text-xl font-bold uppercase tracking-wide text-white">Pizarra Táctica</h1>
            <p className="text-xs text-club-plata/60">Cúcuta Deportivo · Cuerpo técnico</p>
          </div>
        </div>

        {modo === 'login' ? (
          <form onSubmit={manejarEnvio} className="flex flex-col gap-3">
            <label className="text-xs text-club-plata">
              Usuario o correo
              <input
                type="text"
                autoComplete="username"
                required
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
              />
            </label>

            <label className="text-xs text-club-plata">
              Contraseña
              <div className="relative mt-1">
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 pr-16 text-sm text-white outline-none focus:border-club-rojo"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-semibold uppercase text-club-plata/70 hover:text-white"
                >
                  {mostrarPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </label>

            <label className="flex items-center gap-2 text-xs text-club-plata">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="h-4 w-4 accent-club-rojo" />
              Recordar este dispositivo
            </label>

            {error && <p className="rounded-lg bg-club-rojo/15 px-3 py-2 text-xs text-club-rojo">{error}</p>}

            <Boton type="submit" variante="primario" disabled={enviando} className="mt-1 w-full">
              {enviando ? 'Entrando…' : 'Entrar'}
            </Boton>

            <div className="mt-1 flex items-center justify-between text-xs">
              <button type="button" onClick={() => setModo('recuperar')} className="-ml-2 inline-flex min-h-[44px] items-center px-2 text-club-plata/70 hover:text-white">
                He olvidado mi contraseña
              </button>
              <button type="button" onClick={onIrARegistro} className="-mr-2 inline-flex min-h-[44px] items-center px-2 font-semibold text-club-rojo hover:text-white">
                Crear cuenta
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={manejarRecuperacion} className="flex flex-col gap-3">
            {enlaceEnviado ? (
              <p className="rounded-lg bg-emerald-500/15 px-3 py-3 text-sm text-emerald-400">
                Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña.
              </p>
            ) : (
              <>
                <p className="text-sm text-club-plata/70">Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p>
                <label className="text-xs text-club-plata">
                  Correo
                  <input
                    type="email"
                    required
                    value={correoRecuperar}
                    onChange={(e) => setCorreoRecuperar(e.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
                  />
                </label>
                <Boton type="submit" variante="primario" disabled={enviandoRecuperacion} className="w-full">
                  {enviandoRecuperacion ? 'Enviando…' : 'Enviar enlace'}
                </Boton>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setModo('login');
                setEnlaceEnviado(false);
              }}
              className="text-xs text-club-plata/70 hover:text-white"
            >
              ← Volver a iniciar sesión
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
