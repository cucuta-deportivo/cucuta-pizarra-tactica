import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Campo, type CampoHandle } from './components/campo/Campo';
import { SelectorFormacion } from './components/campo/SelectorFormacion';
import { BarraHerramientas } from './components/pizarra/BarraHerramientas';
import { FlyoutObjetos } from './components/pizarra/FlyoutObjetos';
import { TimelineTactica } from './components/pizarra/TimelineTactica';
import { Boton } from './components/ui/Boton';
import { Dropdown } from './components/ui/Dropdown';
import { Modal } from './components/ui/Modal';
import { IndicadorAutoguardado } from './components/ui/IndicadorAutoguardado';
import { ToastContainer } from './components/ui/ToastContainer';
import { useAtajosTeclado } from './hooks/useAtajosTeclado';
import { alBajarCambios, descargarRespaldoAqui, migrarAqui, porMigrarAqui, sincronizarAhora } from './data/sincronizacion';
import type { PorMigrar } from './data/sincronizacion/migrar';
import { esAlineacionVaciaSinTocar, useAlineacionStore } from './store/alineacionStore';
import { useAuthStore } from './store/authStore';
import { supabaseConfigurado } from './lib/supabaseClient';
import { usePizarraStore } from './store/pizarraStore';
import { useReproduccionStore } from './store/reproduccionStore';
import { usePizarraCampoStore } from './store/pizarraCampoStore';
import { usePlantillaStore } from './store/plantillaStore';
import { useUiStore, type OrientacionForzada } from './store/uiStore';
import { DEFINICION_PRESETS_CUADRICULA } from './utils/constantes';
import { diferido } from './utils/cargaDiferida';

// Ventanas que no hacen falta para pintar la pizarra: van en trozos aparte, fuera
// de la carga inicial, y se descargan justo después del primer render.
const ModalAlineaciones = diferido(() => import('./components/ui/ModalAlineaciones').then((m) => m.ModalAlineaciones));
const ModalExportar = diferido(() => import('./components/ui/ModalExportar').then((m) => m.ModalExportar));
const ModalHistorial = diferido(() => import('./components/ui/ModalHistorial').then((m) => m.ModalHistorial));
const ModalMigracion = diferido(() => import('./components/ui/ModalMigracion').then((m) => m.ModalMigracion));
const ModalZonas = diferido(() => import('./components/ui/ModalZonas').then((m) => m.ModalZonas));
const ModalRival = diferido(() => import('./components/ui/ModalRival').then((m) => m.ModalRival));
const ModalCancha = diferido(() => import('./components/ui/ModalCancha').then((m) => m.ModalCancha));
const PantallaPlantilla = diferido(() => import('./components/plantilla/PantallaPlantilla').then((m) => m.PantallaPlantilla));
const ModalComparacion = diferido(() => import('./components/ui/ModalComparacion').then((m) => m.ModalComparacion));
// Este no está siempre montado: su trozo se pide la primera vez que se abre.
const PanelActividad = diferido(() => import('./components/auth/PanelActividad').then((m) => m.PanelActividad));

function EscudoClub() {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-club-negro font-display text-lg font-black text-club-rojo ring-1 ring-white/15"
      title="Cúcuta Deportivo"
      aria-hidden="true"
    >
      C
    </div>
  );
}

function NombreAlineacion() {
  const nombre = useAlineacionStore((s) => s.nombre);
  const renombrar = useAlineacionStore((s) => s.renombrar);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nombre);

  useEffect(() => {
    if (!editando) setValor(nombre);
  }, [nombre, editando]);

  function confirmar(): void {
    const limpio = valor.trim();
    if (limpio && limpio !== nombre) renombrar(limpio);
    setEditando(false);
  }

  if (editando) {
    return (
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar();
          if (e.key === 'Escape') {
            setValor(nombre);
            setEditando(false);
          }
        }}
        maxLength={60}
        aria-label="Nombre de la alineación"
        className="h-9 min-w-0 flex-1 rounded-lg border border-club-rojo bg-white/5 px-2.5 text-sm font-medium text-white outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      title="Renombrar alineación"
      className="block min-h-[44px] w-10 min-w-0 flex-1 truncate rounded-lg px-2.5 text-left text-sm font-medium text-club-plata hover:bg-white/5 hover:text-white sm:w-auto"
    >
      {nombre || 'Alineación sin nombre'}
    </button>
  );
}

function BotonBarraInferior({
  icono,
  etiqueta,
  activo = false,
  insignia,
  onClick,
}: {
  icono: string;
  etiqueta: string;
  activo?: boolean;
  insignia?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border-b-2 px-2 py-1.5 transition-colors duration-rapido sm:min-w-[84px] sm:flex-none sm:px-4 ${
        activo ? 'border-club-rojo text-white' : 'border-transparent text-club-plata hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {icono}
      </span>
      <span className="font-display text-[11px] font-semibold uppercase tracking-wide">{etiqueta}</span>
      {insignia && (
        <span className="absolute -top-1 right-1 rounded-full bg-club-negro px-1.5 py-0.5 text-[9px] font-bold text-club-plata ring-1 ring-white/15">
          {insignia}
        </span>
      )}
    </button>
  );
}

const UMBRAL_PULSACION_LARGA_BARRA_MS = 550;

/**
 * Botón de la barra inferior con doble gesto (Anexo A §A.1): toque corto activa/desactiva
 * el estado (Zonas, Rival); pulsación larga o clic derecho abre sus opciones.
 */
function BotonBarraConOpciones({
  icono,
  etiqueta,
  activo,
  onAlternar,
  onAbrirOpciones,
}: {
  icono: string;
  etiqueta: string;
  activo: boolean;
  onAlternar: () => void;
  onAbrirOpciones: () => void;
}) {
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abiertoPorPulsacionLargaRef = useRef(false);

  function iniciar(): void {
    abiertoPorPulsacionLargaRef.current = false;
    temporizadorRef.current = setTimeout(() => {
      abiertoPorPulsacionLargaRef.current = true;
      onAbrirOpciones();
    }, UMBRAL_PULSACION_LARGA_BARRA_MS);
  }
  function cancelar(): void {
    if (temporizadorRef.current) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
  }

  return (
    <button
      type="button"
      onPointerDown={iniciar}
      onPointerUp={cancelar}
      onPointerLeave={cancelar}
      onClick={() => {
        if (abiertoPorPulsacionLargaRef.current) {
          abiertoPorPulsacionLargaRef.current = false;
          return;
        }
        onAlternar();
      }}
      onContextMenu={(evento) => {
        evento.preventDefault();
        onAbrirOpciones();
      }}
      aria-pressed={activo}
      title={`${etiqueta} — mantén pulsado para opciones`}
      className={`relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border-b-2 px-2 py-1.5 transition-colors duration-rapido sm:min-w-[84px] sm:flex-none sm:px-4 ${
        activo ? 'border-club-rojo text-white' : 'border-transparent text-club-plata hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className="text-lg leading-none" aria-hidden="true">
        {icono}
      </span>
      <span className="font-display text-[11px] font-semibold uppercase tracking-wide">{etiqueta}</span>
    </button>
  );
}

function ControlesHistorial({ onAbrirHistorial }: { onAbrirHistorial: () => void }) {
  const puedeDeshacer = useAlineacionStore((s) => s.puedeDeshacer());
  const puedeRehacer = useAlineacionStore((s) => s.puedeRehacer());
  const deshacer = useAlineacionStore((s) => s.deshacer);
  const rehacer = useAlineacionStore((s) => s.rehacer);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Historial de cambios">
      <Boton tamano="icono" disabled={!puedeDeshacer} onClick={deshacer} aria-label="Deshacer" title="Deshacer (Ctrl+Z)">
        ↶
      </Boton>
      <Boton tamano="icono" disabled={!puedeRehacer} onClick={rehacer} aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)">
        ↷
      </Boton>
      <Boton tamano="icono" onClick={onAbrirHistorial} aria-label="Ver historial de cambios" title="Ver historial">
        🕐
      </Boton>
    </div>
  );
}

function ItemMenu({ children, onClick }: { children: ReactNode; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block min-h-[44px] w-full px-4 py-2.5 text-left text-sm font-medium text-white hover:bg-white/10"
    >
      {children}
    </button>
  );
}

const ETIQUETAS_ORIENTACION: Record<OrientacionForzada, string> = {
  auto: 'Automática',
  vertical: 'Vertical',
  horizontal: 'Horizontal',
};

function SeccionCuenta({ onAbrirActividad, onCerrar }: { onAbrirActividad: () => void; onCerrar: () => void }) {
  const perfil = useAuthStore((s) => s.perfil);
  const cerrarSesion = useAuthStore((s) => s.cerrarSesion);
  const estadoGuardado = useAlineacionStore((s) => s.estadoGuardado);

  if (!supabaseConfigurado || !perfil) return null;

  async function manejarCerrarSesion(): Promise<void> {
    if (estadoGuardado === 'pendiente' || estadoGuardado === 'guardando') {
      const continuar = window.confirm('Hay cambios sin guardar todavía. ¿Cerrar sesión de todas formas?');
      if (!continuar) return;
    }
    onCerrar();
    await cerrarSesion();
  }

  return (
    <div className="border-t border-white/10">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-club-rojo/20 text-xs font-bold uppercase text-club-rojo">
          {perfil.nombre_completo.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{perfil.nombre_completo}</p>
          <p className="truncate text-xs text-club-plata/50">@{perfil.usuario}</p>
        </div>
      </div>
      <ItemMenu
        onClick={() => {
          onAbrirActividad();
          onCerrar();
        }}
      >
        🕓 Actividad de la cuenta
      </ItemMenu>
      <ItemMenu onClick={() => void manejarCerrarSesion()}>🚪 Cerrar sesión</ItemMenu>
    </div>
  );
}

function MenuOpciones({
  onAbrirAlineaciones,
  onAbrirGestionPlantilla,
  onAbrirComparacion,
  onAbrirCancha,
  onAbrirActividad,
  onAbrirExportar,
  onCrearJugada,
  onGrabarJugada,
  onVaciarCampo,
  hayJugada,
}: {
  onAbrirAlineaciones: () => void;
  onAbrirGestionPlantilla: () => void;
  onAbrirComparacion: () => void;
  onAbrirCancha: () => void;
  onAbrirActividad: () => void;
  onAbrirExportar: () => void;
  onCrearJugada: () => void;
  onGrabarJugada: () => void;
  onVaciarCampo: () => void;
  hayJugada: boolean;
}) {
  const pantallaCompleta = useUiStore((s) => s.pantallaCompleta);
  const setPantallaCompleta = useUiStore((s) => s.setPantallaCompleta);
  const orientacionForzada = useUiStore((s) => s.orientacionForzada);
  const setOrientacionForzada = useUiStore((s) => s.setOrientacionForzada);
  const nuevaAlineacion = useAlineacionStore((s) => s.nuevaAlineacion);
  const titularesEnCampo = useAlineacionStore((s) => s.historial.presente.titulares.length);

  return (
    <Dropdown
      alineacion="derecha"
      gatillo={({ abierto, alternar }) => (
        <Boton tamano="icono" onClick={alternar} aria-haspopup="true" aria-expanded={abierto} aria-label="Más opciones">
          ⋯
        </Boton>
      )}
    >
      {(cerrar) => (
        <div className="superficie-vidrio w-64 overflow-hidden rounded-lg border border-white/10 shadow-elevada">
          <ItemMenu
            onClick={() => {
              onAbrirAlineaciones();
              cerrar();
            }}
          >
            📁 Alineaciones guardadas
          </ItemMenu>
          {/* ⬇️ Exportar vive en la barra inferior desde el breakpoint lg; por debajo se
              colapsa aquí (Anexo A §A.1: "colapsa 💾 y ⬇️ dentro de [⋯], nunca los tácticos"). */}
          <div className="lg:hidden">
            <ItemMenu
              onClick={() => {
                onAbrirExportar();
                cerrar();
              }}
            >
              ⬇️ Exportar
            </ItemMenu>
          </div>
          <ItemMenu
            onClick={() => {
              onAbrirComparacion();
              cerrar();
            }}
          >
            ⚖️ Comparar alineaciones
          </ItemMenu>
          <ItemMenu
            onClick={() => {
              onAbrirGestionPlantilla();
              cerrar();
            }}
          >
            👤 Plantilla
          </ItemMenu>
          <ItemMenu
            onClick={() => {
              onAbrirCancha();
              cerrar();
            }}
          >
            🏟️ Cancha
          </ItemMenu>
          {!hayJugada && (
            <>
              <ItemMenu
                onClick={() => {
                  onCrearJugada();
                  cerrar();
                }}
              >
                🎬 Crear jugada
              </ItemMenu>
              <ItemMenu
                onClick={() => {
                  onGrabarJugada();
                  cerrar();
                }}
              >
                ⏺ Grabar jugada
              </ItemMenu>
            </>
          )}
          {titularesEnCampo > 0 && (
            <ItemMenu
              onClick={() => {
                onVaciarCampo();
                cerrar();
              }}
            >
              🧹 Vaciar campo
            </ItemMenu>
          )}
          <ItemMenu
            onClick={() => {
              nuevaAlineacion();
              cerrar();
            }}
          >
            + Nueva alineación
          </ItemMenu>
          <ItemMenu
            onClick={() => {
              setPantallaCompleta(!pantallaCompleta);
              cerrar();
            }}
          >
            {pantallaCompleta ? '⤢ Salir de pantalla completa' : '⛶ Pantalla completa (F)'}
          </ItemMenu>
          <div className="border-t border-white/10 px-4 py-2.5">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-club-plata/70">Orientación del campo</p>
            <div className="flex gap-1.5">
              {(Object.keys(ETIQUETAS_ORIENTACION) as OrientacionForzada[]).map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setOrientacionForzada(valor)}
                  aria-pressed={orientacionForzada === valor}
                  className={`min-h-[44px] flex-1 rounded-md px-1 text-xs font-medium transition-colors duration-rapido ${
                    orientacionForzada === valor ? 'bg-club-rojo text-white' : 'bg-white/5 text-club-plata hover:bg-white/10'
                  }`}
                >
                  {ETIQUETAS_ORIENTACION[valor]}
                </button>
              ))}
            </div>
          </div>
          <SeccionCuenta onAbrirActividad={onAbrirActividad} onCerrar={cerrar} />
        </div>
      )}
    </Dropdown>
  );
}

function PantallaCarga() {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-club-negro text-club-plata">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-club-rojo border-t-transparent" />
        <p className="font-display text-sm uppercase tracking-wide">Cargando pizarra táctica…</p>
      </div>
    </div>
  );
}

export default function App() {
  const cargando = useAlineacionStore((s) => s.cargando);
  const inicializar = useAlineacionStore((s) => s.inicializar);
  const titularesCount = useAlineacionStore((s) => s.historial.presente.titulares.length);

  const pantallaCompleta = useUiStore((s) => s.pantallaCompleta);
  const setPantallaCompleta = useUiStore((s) => s.setPantallaCompleta);
  const abrirDrawerPlantilla = useUiStore((s) => s.abrirDrawerPlantilla);

  const modoDibujoActivo = usePizarraStore((s) => s.modoDibujoActivo);
  const toggleModoDibujo = usePizarraStore((s) => s.toggleModoDibujo);

  const inicializarPlantilla = usePlantillaStore((s) => s.inicializar);
  const sincronizarPersonalizados = usePlantillaStore((s) => s.sincronizarPersonalizados);
  const jugadoresPersonalizados = useAlineacionStore((s) => s.historial.presente.jugadoresPersonalizados);
  const sincronizarFichas = usePlantillaStore((s) => s.sincronizarFichas);
  const fichas = useAlineacionStore((s) => s.fichas);
  const hayJugada = useAlineacionStore((s) => s.historial.presente.secuencia !== null);
  const iniciarSecuencia = useAlineacionStore((s) => s.iniciarSecuencia);
  const iniciarGrabacion = useReproduccionStore((s) => s.iniciarGrabacion);

  const modoObjetoActivo = usePizarraCampoStore((s) => s.modoObjetoActivo);
  const activarModoObjeto = usePizarraCampoStore((s) => s.activarModoObjeto);
  const desactivarModoObjeto = usePizarraCampoStore((s) => s.desactivarModoObjeto);
  const ultimoPresetCuadricula = usePizarraCampoStore((s) => s.ultimoPresetCuadricula);
  const setUltimoPresetCuadricula = usePizarraCampoStore((s) => s.setUltimoPresetCuadricula);
  // La herramienta de movimiento añade una franja de ayuda a la timeline; el
  // campo tiene que ceder ese alto o quedaría tapado por debajo.
  const modoTrayectoriaActivo = usePizarraCampoStore((s) => s.modoTrayectoriaActivo);

  const cuadricula = useAlineacionStore((s) => s.historial.presente.cuadricula);
  const actualizarCuadricula = useAlineacionStore((s) => s.actualizarCuadricula);
  const rival = useAlineacionStore((s) => s.historial.presente.rival);
  const actualizarRival = useAlineacionStore((s) => s.actualizarRival);

  const campoRef = useRef<CampoHandle>(null);
  const inicializadoRef = useRef(false);
  const [modalAlineacionesAbierto, setModalAlineacionesAbierto] = useState(false);
  const [modalExportarAbierto, setModalExportarAbierto] = useState(false);
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);
  const [modalGestionPlantillaAbierto, setModalGestionPlantillaAbierto] = useState(false);
  const [modalComparacionAbierto, setModalComparacionAbierto] = useState(false);
  const [modalZonasAbierto, setModalZonasAbierto] = useState(false);
  const [modalRivalAbierto, setModalRivalAbierto] = useState(false);
  const [modalCanchaAbierto, setModalCanchaAbierto] = useState(false);
  const [panelActividadAbierto, setPanelActividadAbierto] = useState(false);
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  // Alineaciones de antes de la sincronización por subir; `null` cuando no hay o se dejó para más tarde.
  const [porMigrar, setPorMigrar] = useState<PorMigrar | null>(null);
  const vaciarCampo = useAlineacionStore((s) => s.vaciarCampo);

  function alternarObjetos(): void {
    if (modoObjetoActivo) desactivarModoObjeto();
    else activarModoObjeto('cono');
  }

  function alternarZonas(): void {
    if (cuadricula.preset === 'off') {
      const def = ultimoPresetCuadricula === 'personalizada' ? { columnas: 4, filas: 4 } : DEFINICION_PRESETS_CUADRICULA[ultimoPresetCuadricula];
      actualizarCuadricula({ preset: ultimoPresetCuadricula, columnas: def.columnas, filas: def.filas });
    } else {
      setUltimoPresetCuadricula(cuadricula.preset);
      actualizarCuadricula({ preset: 'off', columnas: 0, filas: 0 });
    }
  }

  function alternarRival(): void {
    if (!rival) {
      setModalRivalAbierto(true);
      return;
    }
    actualizarRival({ visible: !rival.visible });
  }

  useAtajosTeclado();

  // Lo que baja de otros dispositivos se muestra sin pisar lo que se está editando (S1.7).
  useEffect(() => alBajarCambios((cambios) => void useAlineacionStore.getState().aplicarCambiosDelServidor(cambios)), []);

  useEffect(() => {
    if (inicializadoRef.current) return;
    inicializadoRef.current = true;
    // Al abrir, primero lo de este dispositivo; después se sincroniza con Supabase
    // y, si hay alineaciones de antes de la sincronización, se ofrece subirlas (S1.8).
    void inicializar().then(async () => {
      void sincronizarAhora();
      const pendientes = await porMigrarAqui(esAlineacionVaciaSinTocar);
      if (pendientes && pendientes.ids.length > 0) setPorMigrar(pendientes);
    });
    void inicializarPlantilla();
  }, [inicializar, inicializarPlantilla]);

  // Punto único donde la plantilla en memoria recoge los jugadores personalizados
  // del tablero abierto. Al ser reactivo cubre de una sola vez cargar una alineación,
  // importar un JSON, crear uno nuevo y deshacer/rehacer esa creación, sin que ninguna
  // vista tenga que cambiar cómo busca un jugador por id.
  useEffect(() => {
    sincronizarPersonalizados(jugadoresPersonalizados);
  }, [jugadoresPersonalizados, sincronizarPersonalizados]);

  // Lo mismo con las fichas guardadas de la alineación abierta: quien no está en la
  // plantilla cargada (otra categoría, ya inactivo, otro dispositivo) se pinta con ellas.
  useEffect(() => {
    sincronizarFichas(fichas);
  }, [fichas, sincronizarFichas]);

  if (cargando) return <PantallaCarga />;

  const barrasVisibles = !pantallaCompleta;
  const timelineVisible = barrasVisibles && hayJugada;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-club-negro text-white">
      {/* Con la jugada abierta, el campo cede el alto de la timeline para no quedar tapado. */}
      <main
        className={`absolute inset-0 px-2 pt-[68px] sm:px-4 ${
          timelineVisible ? (modoTrayectoriaActivo ? 'pb-[220px]' : 'pb-[184px]') : 'pb-[76px]'
        }`}
      >
        <Campo ref={campoRef} />
      </main>

      {barrasVisibles && (
        <header className="superficie-vidrio pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-white/10 px-2.5 py-2 sm:gap-3 sm:px-4">
          <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <EscudoClub />
            <SelectorFormacion />
            <NombreAlineacion />
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <ControlesHistorial onAbrirHistorial={() => setModalHistorialAbierto(true)} />
            <span className="h-6 w-px bg-white/10" aria-hidden="true" />
            <IndicadorAutoguardado />
            <MenuOpciones
              onAbrirAlineaciones={() => setModalAlineacionesAbierto(true)}
              onAbrirGestionPlantilla={() => setModalGestionPlantillaAbierto(true)}
              onAbrirComparacion={() => setModalComparacionAbierto(true)}
              onAbrirCancha={() => setModalCanchaAbierto(true)}
              onAbrirActividad={() => setPanelActividadAbierto(true)}
              onAbrirExportar={() => setModalExportarAbierto(true)}
              onCrearJugada={iniciarSecuencia}
              onGrabarJugada={() => {
                // Abre la jugada y arranca a grabar de una vez: el primer frame
                // guarda la posición de partida y los movimientos ya cuentan.
                iniciarSecuencia();
                iniciarGrabacion();
              }}
              onVaciarCampo={() => setConfirmandoVaciar(true)}
              hayJugada={hayJugada}
            />
          </div>
        </header>
      )}

      {barrasVisibles && modoDibujoActivo && (
        <div className="pointer-events-none absolute inset-x-0 top-[60px] z-30 flex justify-center px-2 sm:top-[64px]">
          <div className="pointer-events-auto">
            <BarraHerramientas />
          </div>
        </div>
      )}

      {barrasVisibles && modoObjetoActivo && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[68px] z-30 flex justify-center px-2">
          <div className="pointer-events-auto">
            <FlyoutObjetos onCerrar={desactivarModoObjeto} />
          </div>
        </div>
      )}

      {timelineVisible && (
        <div className="absolute inset-x-0 bottom-[68px] z-30">
          <TimelineTactica />
        </div>
      )}

      {barrasVisibles && (
        <footer className="superficie-vidrio absolute inset-x-0 bottom-0 z-30 flex items-center justify-center gap-1 border-t border-white/10 px-2 py-2 sm:gap-3">
          <BotonBarraInferior icono="✏️" etiqueta="Dibujo" activo={modoDibujoActivo} onClick={toggleModoDibujo} />
          <BotonBarraInferior icono="⬢" etiqueta="Objetos" activo={modoObjetoActivo} onClick={alternarObjetos} />
          <BotonBarraConOpciones
            icono="▦"
            etiqueta="Zonas"
            activo={cuadricula.preset !== 'off'}
            onAlternar={alternarZonas}
            onAbrirOpciones={() => setModalZonasAbierto(true)}
          />
          <BotonBarraConOpciones
            icono="🆚"
            etiqueta="Rival"
            activo={Boolean(rival?.visible)}
            onAlternar={alternarRival}
            onAbrirOpciones={() => setModalRivalAbierto(true)}
          />
          <BotonBarraInferior
            icono="👥"
            etiqueta="Plantilla"
            insignia={`${titularesCount}/11`}
            onClick={abrirDrawerPlantilla}
          />
          {/* Guardar/Exportar solo caben junto a los 5 grupos tácticos desde el
              breakpoint lg (tablet apaisada); por debajo viven en [⋯] (ver MenuOpciones). */}
          <div className="hidden lg:contents">
            <BotonBarraInferior icono="💾" etiqueta="Guardar" onClick={() => setModalAlineacionesAbierto(true)} />
            <BotonBarraInferior icono="⬇️" etiqueta="Exportar" onClick={() => setModalExportarAbierto(true)} />
          </div>
        </footer>
      )}

      {pantallaCompleta && (
        <button
          type="button"
          onClick={() => setPantallaCompleta(false)}
          className="superficie-vidrio absolute right-3 top-3 z-30 flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/10 px-3 text-sm font-medium text-white shadow-elevada"
        >
          ⤢ Salir (Esc)
        </button>
      )}

      <Suspense fallback={null}>
        <ModalAlineaciones abierto={modalAlineacionesAbierto} onCerrar={() => setModalAlineacionesAbierto(false)} />
        <ModalHistorial abierto={modalHistorialAbierto} onCerrar={() => setModalHistorialAbierto(false)} />
        <PantallaPlantilla abierto={modalGestionPlantillaAbierto} onCerrar={() => setModalGestionPlantillaAbierto(false)} />
        <ModalComparacion abierto={modalComparacionAbierto} onCerrar={() => setModalComparacionAbierto(false)} />
        <ModalZonas abierto={modalZonasAbierto} onCerrar={() => setModalZonasAbierto(false)} />
        <ModalRival abierto={modalRivalAbierto} onCerrar={() => setModalRivalAbierto(false)} />
        <ModalCancha abierto={modalCanchaAbierto} onCerrar={() => setModalCanchaAbierto(false)} />
        <ModalExportar
          abierto={modalExportarAbierto}
          onCerrar={() => setModalExportarAbierto(false)}
          obtenerElementos={() => campoRef.current?.obtenerElementosExportacion() ?? null}
        />
      </Suspense>
      {panelActividadAbierto && (
        <Suspense fallback={null}>
          <PanelActividad onCerrar={() => setPanelActividadAbierto(false)} />
        </Suspense>
      )}
      {porMigrar && (
        <Suspense fallback={null}>
          <ModalMigracion
            abierto
            porMigrar={porMigrar}
            migrar={migrarAqui}
            descargarRespaldo={descargarRespaldoAqui}
            onCerrar={() => setPorMigrar(null)}
          />
        </Suspense>
      )}
      <Modal abierto={confirmandoVaciar} onCerrar={() => setConfirmandoVaciar(false)} titulo="Vaciar campo" ancho="sm">
        <p className="text-sm text-club-plata">
          Se quitarán del campo todos los jugadores. La formación, los dibujos y los objetos se mantienen. Puedes deshacerlo.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={() => setConfirmandoVaciar(false)}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => {
              vaciarCampo();
              setConfirmandoVaciar(false);
            }}
          >
            Vaciar
          </Boton>
        </div>
      </Modal>
      <ToastContainer />
    </div>
  );
}
