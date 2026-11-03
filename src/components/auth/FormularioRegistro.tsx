import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabaseClient';
import { Boton } from '../ui/Boton';
import { MedidorFortaleza, evaluarFortaleza } from './MedidorFortaleza';
import type { RolUsuario } from '../../types/auth';

interface FormularioRegistroProps {
  onVolver: () => void;
}

type DisponibilidadUsuario = 'sin-verificar' | 'verificando' | 'disponible' | 'ocupado';

export function FormularioRegistro({ onVolver }: FormularioRegistroProps) {
  const registrar = useAuthStore((s) => s.registrar);
  const enviando = useAuthStore((s) => s.enviando);

  const [nombreCompleto, setNombreCompleto] = useState('');
  const [usuario, setUsuario] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [rol, setRol] = useState<RolUsuario>('entrenador');
  const [codigoInvitacion, setCodigoInvitacion] = useState('');
  const [aceptaCondiciones, setAceptaCondiciones] = useState(false);
  const [disponibilidad, setDisponibilidad] = useState<DisponibilidadUsuario>('sin-verificar');
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    const nombre = usuario.trim();
    if (nombre.length < 3) {
      setDisponibilidad('sin-verificar');
      return;
    }
    setDisponibilidad('verificando');
    temporizadorRef.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('usuario_disponible', { p_usuario: nombre });
      if (error) {
        setDisponibilidad('sin-verificar');
        return;
      }
      setDisponibilidad(data ? 'disponible' : 'ocupado');
    }, 400);
    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    };
  }, [usuario]);

  const contrasenasCoinciden = confirmar.length === 0 || password === confirmar;
  const fortaleza = evaluarFortaleza(password);
  const formularioValido =
    nombreCompleto.trim().length > 1 &&
    /^[a-zA-Z0-9_.-]{3,20}$/.test(usuario.trim()) &&
    disponibilidad === 'disponible' &&
    /\S+@\S+\.\S+/.test(correo) &&
    fortaleza.valida &&
    password === confirmar &&
    aceptaCondiciones;

  async function manejarEnvio(evento: FormEvent): Promise<void> {
    evento.preventDefault();
    setErrorEnvio(null);
    if (!formularioValido) return;
    const resultado = await registrar({
      correo: correo.trim(),
      password,
      usuario: usuario.trim(),
      nombreCompleto: nombreCompleto.trim(),
      rol,
      codigoInvitacion: codigoInvitacion.trim(),
    });
    if (!resultado.ok) setErrorEnvio(resultado.mensaje ?? 'No se pudo completar el registro.');
    else setExito(true);
  }

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-y-auto bg-club-negro p-4">
      <div className="superficie-vidrio relative z-10 w-full max-w-[420px] rounded-2xl border border-white/10 p-6 shadow-elevada animar-entrada-tarjeta my-6">
        <h1 className="mb-1 text-center font-display text-xl font-bold uppercase tracking-wide text-white">Crear cuenta</h1>
        <p className="mb-5 text-center text-xs text-club-plata/60">Cúcuta Deportivo · Cuerpo técnico</p>

        {exito ? (
          <div className="flex flex-col gap-3 text-center">
            <p className="rounded-lg bg-emerald-500/15 px-3 py-3 text-sm text-emerald-400">
              Cuenta creada. Revisa tu correo para verificarla. Si tu código de invitación era válido ya puedes entrar; si no,
              un entrenador debe aprobarte primero.
            </p>
            <Boton variante="primario" onClick={onVolver} className="w-full">
              Ir a iniciar sesión
            </Boton>
          </div>
        ) : (
          <form onSubmit={manejarEnvio} className="flex flex-col gap-3">
            <label className="text-xs text-club-plata">
              Nombre y apellido
              <input
                required
                value={nombreCompleto}
                onChange={(e) => setNombreCompleto(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
              />
            </label>

            <label className="text-xs text-club-plata">
              Usuario
              <input
                required
                value={usuario}
                onChange={(e) => setUsuario(e.target.value.replace(/\s/g, ''))}
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
              />
              {disponibilidad === 'verificando' && <span className="text-[11px] text-club-plata/50">Comprobando…</span>}
              {disponibilidad === 'ocupado' && <span className="text-[11px] text-club-rojo">Ese usuario ya existe.</span>}
              {disponibilidad === 'disponible' && <span className="text-[11px] text-emerald-400">Disponible.</span>}
            </label>

            <label className="text-xs text-club-plata">
              Correo
              <input
                type="email"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
              />
            </label>

            <label className="text-xs text-club-plata">
              Contraseña
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
              />
              <div className="mt-1.5">
                <MedidorFortaleza password={password} />
              </div>
            </label>

            <label className="text-xs text-club-plata">
              Confirmar contraseña
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
              />
              {!contrasenasCoinciden && <span className="text-[11px] text-club-rojo">Las contraseñas no coinciden.</span>}
            </label>

            <label className="text-xs text-club-plata">
              Rol
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value as RolUsuario)}
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
              >
                <option value="entrenador" className="bg-club-carbon">Entrenador</option>
                <option value="invitado" className="bg-club-carbon">Invitado</option>
              </select>
            </label>

            <label className="text-xs text-club-plata">
              Código de invitación del club (opcional)
              <input
                value={codigoInvitacion}
                onChange={(e) => setCodigoInvitacion(e.target.value)}
                placeholder="Déjalo vacío si no tienes uno"
                className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-club-plata/40 outline-none focus:border-club-rojo"
              />
              <span className="text-[11px] text-club-plata/50">Sin código válido, un entrenador deberá aprobar tu cuenta.</span>
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-xs text-club-plata">
              <input
                type="checkbox"
                checked={aceptaCondiciones}
                onChange={(e) => setAceptaCondiciones(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-club-rojo"
              />
              Acepto las condiciones de uso de la pizarra táctica del club.
            </label>

            {errorEnvio && <p className="rounded-lg bg-club-rojo/15 px-3 py-2 text-xs text-club-rojo">{errorEnvio}</p>}

            <Boton type="submit" variante="primario" disabled={!formularioValido || enviando} className="mt-1 w-full">
              {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
            </Boton>

            <button type="button" onClick={onVolver} className="min-h-[44px] text-center text-xs text-club-plata/70 hover:text-white">
              ← Ya tengo cuenta
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
