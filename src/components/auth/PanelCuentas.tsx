import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuthStore } from '../../store/authStore';
import { Boton } from '../ui/Boton';
import { Modal } from '../ui/Modal';
import type { EstadoCuenta, Perfil } from '../../types/auth';

/** Lo que la lista necesita de cada cuenta. Sin correos: la política de `perfiles` deja leer esto a los entrenadores activos. */
type Cuenta = Pick<Perfil, 'id' | 'usuario' | 'nombre_completo' | 'estado' | 'creado_en'>;
type Accion = 'aprobar' | 'rechazar';

interface PanelCuentasProps {
  onCerrar: () => void;
}

/** Las dos funciones de la base solo actúan sobre una cuenta pendiente y solo para un entrenador activo. */
const FUNCION: Record<Accion, string> = { aprobar: 'aprobar_usuario', rechazar: 'rechazar_usuario' };
const YA_REVISADA = 'La cuenta ya no está pendiente.';

const GRUPOS: Array<{ estado: EstadoCuenta; titulo: string; vacio: string }> = [
  { estado: 'pendiente', titulo: 'Pendientes', vacio: 'No hay cuentas pendientes.' },
  { estado: 'activo', titulo: 'Activas', vacio: 'No hay cuentas activas.' },
  { estado: 'bloqueado', titulo: 'Bloqueadas', vacio: 'No hay cuentas bloqueadas.' },
];

function fechaRegistro(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Sin red no hay código de la base: postgrest-js lo devuelve con estado 0. */
function mensajeDeError(error: { code?: string; message?: string }, estado: number): string {
  if (estado === 0) return 'Sin conexión: no se guardó el cambio. Inténtalo otra vez con señal.';
  if (error.message === YA_REVISADA) return 'Otro entrenador ya revisó esta cuenta. La lista está actualizada.';
  if (error.code === '42501') return 'Tu cuenta no puede aprobar ni rechazar cuentas.';
  return 'No se pudo guardar el cambio. Inténtalo de nuevo.';
}

/** ⋯ → Cuentas: toda cuenta nueva espera aquí hasta que un entrenador activo la aprueba o la rechaza (la bloquea). */
export function PanelCuentas({ onCerrar }: PanelCuentasProps) {
  const miId = useAuthStore((s) => s.perfil?.id ?? null);
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [confirmando, setConfirmando] = useState<{ id: string; accion: Accion } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, usuario, nombre_completo, estado, creado_en')
      .order('creado_en', { ascending: false });
    if (error || !data) {
      setErrorCarga(true);
      return;
    }
    setErrorCarga(false);
    setCuentas(data as Cuenta[]);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function ejecutar(cuenta: Cuenta, accion: Accion): Promise<void> {
    setEnviando(true);
    setAviso(null);
    try {
      const { error, status } = await supabase.rpc(FUNCION[accion], { p_usuario_id: cuenta.id });
      if (error) setAviso({ tipo: 'error', texto: mensajeDeError(error, status) });
      else
        setAviso({
          tipo: 'exito',
          texto: accion === 'aprobar' ? `@${cuenta.usuario} ya puede entrar como entrenador.` : `@${cuenta.usuario} quedó bloqueada.`,
        });
    } finally {
      setEnviando(false);
      setConfirmando(null);
    }
    // Pase lo que pase, la lista vuelve a reflejar lo que hay en la base (por si otro entrenador se adelantó).
    await cargar();
  }

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Cuentas" ancho="md">
      <div className="flex flex-col gap-5">
        <p className="text-xs text-club-plata/70">
          Toda cuenta nueva espera aquí hasta que un entrenador la aprueba. Aprueba solo a quien conozcas: entrará como entrenador y
          podrá ver y editar las alineaciones, la plantilla y las fotos de los jugadores.
        </p>

        {aviso && (
          <p
            role={aviso.tipo === 'error' ? 'alert' : 'status'}
            className={`rounded-lg px-3 py-2 text-xs ${
              aviso.tipo === 'error' ? 'bg-club-rojo/15 text-club-rojo' : 'bg-emerald-500/15 text-emerald-400'
            }`}
          >
            {aviso.texto}
          </p>
        )}

        {errorCarga ? (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm text-club-plata">
              No se pudo cargar la lista. Revisa la conexión.
            </p>
            <Boton variante="secundario" onClick={() => void cargar()}>
              Reintentar
            </Boton>
          </div>
        ) : cuentas === null ? (
          <p className="text-sm text-club-plata/60">Cargando…</p>
        ) : (
          GRUPOS.map((grupo) => {
            const lista = cuentas.filter((c) => c.estado === grupo.estado);
            return (
              <section key={grupo.estado} aria-label={grupo.titulo}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/60">
                  {grupo.titulo} ({lista.length})
                </h3>
                {lista.length === 0 ? (
                  <p className="text-xs text-club-plata/50">{grupo.vacio}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {lista.map((cuenta) => {
                      const accion = confirmando?.id === cuenta.id ? confirmando.accion : null;
                      return (
                        <li key={cuenta.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            {/* Con ancho mínimo: en pantallas estrechas los botones bajan a otra línea. */}
                            <div className="min-w-[12rem] flex-1">
                              {/* Sin recortar: para aprobar hay que poder leer el nombre y la fecha completos. */}
                              <p className="break-words text-sm font-medium text-white">
                                {cuenta.nombre_completo || `@${cuenta.usuario}`}
                                {cuenta.id === miId && <span className="ml-1.5 text-xs font-normal text-club-plata/50">(tú)</span>}
                              </p>
                              <p className="break-words text-xs text-club-plata/60">
                                @{cuenta.usuario} · se registró el {fechaRegistro(cuenta.creado_en)}
                              </p>
                            </div>
                            {cuenta.estado === 'pendiente' && !accion && (
                              <div className="flex gap-2">
                                <Boton
                                  variante="primario"
                                  disabled={enviando}
                                  onClick={() => setConfirmando({ id: cuenta.id, accion: 'aprobar' })}
                                >
                                  Aprobar
                                </Boton>
                                <Boton
                                  variante="secundario"
                                  disabled={enviando}
                                  onClick={() => setConfirmando({ id: cuenta.id, accion: 'rechazar' })}
                                >
                                  Rechazar
                                </Boton>
                              </div>
                            )}
                          </div>
                          {accion && (
                            <div className="mt-2.5 border-t border-white/10 pt-2.5">
                              <p className="text-xs text-club-plata">
                                {accion === 'aprobar'
                                  ? `¿Aprobar a @${cuenta.usuario}? Entrará como entrenador.`
                                  : `¿Rechazar a @${cuenta.usuario}? La cuenta quedará bloqueada y no podrá entrar.`}
                              </p>
                              <div className="mt-2 flex justify-end gap-2">
                                <Boton variante="fantasma" disabled={enviando} onClick={() => setConfirmando(null)}>
                                  Cancelar
                                </Boton>
                                <Boton
                                  variante={accion === 'aprobar' ? 'primario' : 'peligro'}
                                  disabled={enviando}
                                  onClick={() => void ejecutar(cuenta, accion)}
                                >
                                  {enviando ? 'Guardando…' : accion === 'aprobar' ? 'Sí, aprobar' : 'Sí, rechazar'}
                                </Boton>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })
        )}

        <p className="text-[11px] text-club-plata/50">
          Bloquear a un entrenador activo o deshacer un rechazo lo hace quien administra el proyecto, desde el panel de Supabase.
        </p>
      </div>
    </Modal>
  );
}
