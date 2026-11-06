import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuthStore } from '../../store/authStore';
import { describirDispositivo } from '../../utils/deviceInfo';
import { Boton } from '../ui/Boton';
import type { IntentoLogin } from '../../types/auth';

const TAMANO_PAGINA = 20;

interface PanelActividadProps {
  onCerrar: () => void;
}

interface Filtros {
  desde: string;
  hasta: string;
  soloFallidos: boolean;
  soloEsteDispositivo: boolean;
}

const FILTROS_INICIALES: Filtros = { desde: '', hasta: '', soloFallidos: false, soloEsteDispositivo: false };

function enmascararIp(ip: string | null): string {
  if (!ip) return 'No disponible';
  const partes = ip.split('.');
  if (partes.length === 4) return `${partes[0]}.${partes[1]}.xxx.xxx`;
  return ip.length > 6 ? `${ip.slice(0, 4)}…${ip.slice(-2)}` : ip;
}

function formatearRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const segundos = Math.round(diffMs / 1000);
  if (segundos < 60) return 'hace un momento';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `hace ${dias} d`;
  return new Date(iso).toLocaleDateString('es-CO');
}

function claveDia(iso: string, zonaBogota: boolean): string {
  const opciones: Intl.DateTimeFormatOptions = zonaBogota
    ? { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(iso).toLocaleDateString('es-CO', opciones);
}

function formatearHora(iso: string, zonaBogota: boolean): string {
  const opciones: Intl.DateTimeFormatOptions = zonaBogota
    ? { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' };
  return new Date(iso).toLocaleTimeString('es-CO', opciones);
}

const ETIQUETA_RESULTADO: Record<IntentoLogin['resultado'], { texto: string; clase: string }> = {
  exito: { texto: 'Éxito', clase: 'bg-emerald-500/15 text-emerald-400' },
  fallido: { texto: 'Fallido', clase: 'bg-club-rojo/15 text-club-rojo' },
  bloqueado: { texto: 'Bloqueado', clase: 'bg-amber-500/15 text-amber-400' },
};

/**
 * El tipo de `supabase.from(…).select(…)`, sacado del propio cliente: cada
 * filtro se comprueba con su firma real y devuelve la misma consulta.
 */
type ConsultaSupabase = ReturnType<ReturnType<typeof supabase.from>['select']>;

function aplicarFiltros(consulta: ConsultaSupabase, filtros: Filtros, dispositivoActual: string): ConsultaSupabase {
  let resultado = consulta;
  if (filtros.desde) resultado = resultado.gte('ocurrido_en', new Date(filtros.desde).toISOString());
  if (filtros.hasta) {
    const hasta = new Date(filtros.hasta);
    hasta.setHours(23, 59, 59, 999);
    resultado = resultado.lte('ocurrido_en', hasta.toISOString());
  }
  if (filtros.soloFallidos) resultado = resultado.in('resultado', ['fallido', 'bloqueado']);
  if (filtros.soloEsteDispositivo) resultado = resultado.eq('dispositivo', dispositivoActual);
  return resultado;
}

export function PanelActividad({ onCerrar }: PanelActividadProps) {
  const session = useAuthStore((s) => s.session);
  const perfil = useAuthStore((s) => s.perfil);
  const cerrarOtrasSesiones = useAuthStore((s) => s.cerrarOtrasSesiones);

  const [intentos, setIntentos] = useState<IntentoLogin[]>([]);
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [revelarIp, setRevelarIp] = useState(false);
  const [horaBogota, setHoraBogota] = useState(true);
  const [cerrandoOtras, setCerrandoOtras] = useState(false);
  const [dispositivoActual] = useState(() => describirDispositivo(navigator.userAgent));
  const sentinelaRef = useRef<HTMLDivElement | null>(null);

  const cargarPagina = useCallback(
    async (paginaObjetivo: number, reiniciar: boolean) => {
      if (reiniciar) setCargando(true);
      else setCargandoMas(true);
      try {
        const base = aplicarFiltros(supabase.from('intentos_login').select('*'), filtros, dispositivoActual);
        const { data, error } = await base
          .order('ocurrido_en', { ascending: false })
          .range(paginaObjetivo * TAMANO_PAGINA, paginaObjetivo * TAMANO_PAGINA + TAMANO_PAGINA - 1);

        if (!error && data) {
          const filas = data as IntentoLogin[];
          setIntentos((prev) => (reiniciar ? filas : [...prev, ...filas]));
          setHayMas(filas.length === TAMANO_PAGINA);
          setPagina(paginaObjetivo);
        }
      } finally {
        setCargando(false);
        setCargandoMas(false);
      }
    },
    [filtros, dispositivoActual],
  );

  useEffect(() => {
    void cargarPagina(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  useEffect(() => {
    const nodo = sentinelaRef.current;
    if (!nodo) return;
    const observador = new IntersectionObserver((entradas) => {
      if (entradas[0]?.isIntersecting && hayMas && !cargando && !cargandoMas) {
        void cargarPagina(pagina + 1, false);
      }
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [cargarPagina, pagina, hayMas, cargando, cargandoMas]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, IntentoLogin[]>();
    for (const intento of intentos) {
      const clave = claveDia(intento.ocurrido_en, horaBogota);
      const lista = mapa.get(clave) ?? [];
      lista.push(intento);
      mapa.set(clave, lista);
    }
    return Array.from(mapa.entries());
  }, [intentos, horaBogota]);

  const dispositivoSospechoso = useMemo(() => {
    const exitos = [...intentos].filter((i) => i.resultado === 'exito').sort((a, b) => a.ocurrido_en.localeCompare(b.ocurrido_en));
    if (exitos.length < 2) return null;
    const ultimo = exitos[exitos.length - 1]!;
    const dispositivosPrevios = new Set(exitos.slice(0, -1).map((i) => i.dispositivo));
    if (ultimo.dispositivo && !dispositivosPrevios.has(ultimo.dispositivo)) return ultimo;
    return null;
  }, [intentos]);

  async function exportarCsv(): Promise<void> {
    const base = aplicarFiltros(supabase.from('intentos_login').select('*'), filtros, dispositivoActual);
    const { data } = await base.order('ocurrido_en', { ascending: false }).limit(1000);
    const filas = (data as IntentoLogin[] | null) ?? [];
    const encabezado = ['Fecha', 'Resultado', 'Dispositivo', 'IP', 'Ciudad', 'País'];
    const cuerpo = filas.map((f) => [
      new Date(f.ocurrido_en).toISOString(),
      f.resultado,
      f.dispositivo ?? '',
      f.ip ?? '',
      f.ciudad ?? '',
      f.pais ?? '',
    ]);
    const csv = [encabezado, ...cuerpo]
      .map((fila) => fila.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `historial-accesos-${perfil?.usuario ?? 'usuario'}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  async function manejarCerrarOtras(): Promise<void> {
    setCerrandoOtras(true);
    try {
      await cerrarOtrasSesiones();
    } finally {
      setCerrandoOtras(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-club-negro">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="font-display text-lg font-bold uppercase tracking-wide text-white">Actividad de la cuenta</h1>
        <Boton variante="fantasma" tamano="sm" onClick={onCerrar}>
          Cerrar
        </Boton>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {dispositivoSospechoso && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
              Se detectó un inicio de sesión desde un dispositivo no visto antes: {dispositivoSospechoso.dispositivo} el{' '}
              {claveDia(dispositivoSospechoso.ocurrido_en, horaBogota)}. Si no fuiste tú, cierra las demás sesiones y cambia tu
              contraseña.
            </div>
          )}

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-club-plata/60">Sesión actual</h2>
            <p className="text-sm text-white">{dispositivoActual}</p>
            <p className="mt-0.5 text-xs text-club-plata/50">{session?.user.email}</p>
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() => void manejarCerrarOtras()}
              disabled={cerrandoOtras}
              className="mt-3"
            >
              {cerrandoOtras ? 'Cerrando…' : 'Cerrar todas las demás sesiones'}
            </Boton>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-club-plata/60">Filtros</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-club-plata">
                Desde
                <input
                  type="date"
                  value={filtros.desde}
                  onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
                  className="mt-1 block h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white outline-none focus:border-club-rojo"
                />
              </label>
              <label className="text-xs text-club-plata">
                Hasta
                <input
                  type="date"
                  value={filtros.hasta}
                  onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
                  className="mt-1 block h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-sm text-white outline-none focus:border-club-rojo"
                />
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-club-plata">
                <input
                  type="checkbox"
                  checked={filtros.soloFallidos}
                  onChange={(e) => setFiltros((f) => ({ ...f, soloFallidos: e.target.checked }))}
                  className="h-4 w-4 accent-club-rojo"
                />
                Solo fallidos
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-club-plata">
                <input
                  type="checkbox"
                  checked={filtros.soloEsteDispositivo}
                  onChange={(e) => setFiltros((f) => ({ ...f, soloEsteDispositivo: e.target.checked }))}
                  className="h-4 w-4 accent-club-rojo"
                />
                Solo este dispositivo
              </label>
              {(filtros.desde || filtros.hasta || filtros.soloFallidos || filtros.soloEsteDispositivo) && (
                <button
                  type="button"
                  onClick={() => setFiltros(FILTROS_INICIALES)}
                  className="pb-2 text-xs text-club-plata/60 hover:text-white"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/10 pt-3">
              <label className="flex items-center gap-1.5 text-xs text-club-plata">
                <input
                  type="checkbox"
                  checked={revelarIp}
                  onChange={(e) => setRevelarIp(e.target.checked)}
                  className="h-4 w-4 accent-club-rojo"
                />
                Revelar IP completa
              </label>
              <label className="flex items-center gap-1.5 text-xs text-club-plata">
                <input
                  type="checkbox"
                  checked={!horaBogota}
                  onChange={(e) => setHoraBogota(!e.target.checked)}
                  className="h-4 w-4 accent-club-rojo"
                />
                Usar la hora de mi dispositivo
              </label>
              <button
                type="button"
                onClick={() => void exportarCsv()}
                className="ml-auto text-xs font-semibold text-club-rojo hover:text-white"
              >
                Exportar CSV
              </button>
            </div>
          </section>

          <section>
            {cargando ? (
              <p className="py-8 text-center text-sm text-club-plata/50">Cargando…</p>
            ) : intentos.length === 0 ? (
              <p className="py-8 text-center text-sm text-club-plata/50">Sin registros para estos filtros.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {grupos.map(([dia, filas]) => (
                  <div key={dia}>
                    <div className="sticky top-0 z-10 -mx-1 bg-club-negro/95 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-club-plata/50 backdrop-blur">
                      {dia}
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {filas.map((intento) => (
                        <li
                          key={intento.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ETIQUETA_RESULTADO[intento.resultado].clase}`}
                              >
                                {ETIQUETA_RESULTADO[intento.resultado].texto}
                              </span>
                              <span className="truncate text-sm text-white">{intento.dispositivo ?? 'Dispositivo desconocido'}</span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-club-plata/50">
                              {revelarIp ? intento.ip ?? 'IP no disponible' : enmascararIp(intento.ip)}
                              {intento.ciudad ? ` · ${intento.ciudad}, ${intento.pais}` : ''}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs text-club-plata/70">{formatearHora(intento.ocurrido_en, horaBogota)}</p>
                            <p className="text-[11px] text-club-plata/40">{formatearRelativo(intento.ocurrido_en)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div ref={sentinelaRef} className="h-8">
                  {cargandoMas && <p className="text-center text-xs text-club-plata/40">Cargando más…</p>}
                  {!hayMas && <p className="text-center text-xs text-club-plata/30">No hay más registros.</p>}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
