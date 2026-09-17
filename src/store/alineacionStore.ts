import { create } from 'zustand';
import type {
  Alineacion,
  Balon,
  ColorObjeto,
  EstadoGuardado,
  EstrategiaCambioFormacion,
  Jugador,
  JugadorEnCampo,
  JugadorRival,
  ObjetoCampo,
  PuntoNormalizado,
  TipoObjeto,
  Trazo,
} from '../types';
import { alineacionRepository, type ResumenAlineacion } from '../data/repositorio';
import { obtenerFormacion, FORMACIONES } from '../data/formaciones';
import {
  actualizarHistorial,
  crearHistorial,
  deshacerHistorial,
  rehacerHistorial,
  reiniciarHistorial,
  saltarAFuturo,
  saltarAPasado,
  type Historial,
} from './historial';
import { generarId } from '../utils/id';
import { CAPACIDAD_BANQUILLO, DEBOUNCE_AUTOGUARDADO_MS, ETIQUETAS_OBJETO, LIMITE_BALONES, LIMITE_OBJETOS } from '../utils/constantes';
import { canchaVacia, claveCelda, cuadriculaVacia, recortarAMitad, siguienteColorCelda, ubicarZonaEnLado } from '../utils/anexoA';
import { posicionEfectivaBalon } from '../utils/balon';
import { destinoDeTrayectoria, trayectoriaDe } from '../utils/trayectorias';
import { DURACION_MAXIMA_MS, DURACION_MINIMA_MS } from '../utils/interpolacion';
import { useUiStore } from './uiStore';
import { usePlantillaStore } from './plantillaStore';
import type {
  CuadriculaCampo,
  EquipoRival,
  FrameTactico,
  IdentidadCancha,
  Marcaje,
  ModoOrientacion,
  Posicion,
  SecuenciaTactica,
  TipoDestinoRuta,
  TipoEasing,
  TipoInterpolacionRuta,
} from '../types';

export interface DocumentoTactico {
  formacionId: string;
  titulares: JugadorEnCampo[];
  banquillo: string[];
  trazos: Trazo[];
  notas: string;
  objetos: ObjetoCampo[];
  balones: Balon[];
  cuadricula: CuadriculaCampo;
  rival: EquipoRival | null;
  marcajes: Marcaje[];
  cancha: IdentidadCancha;
  /**
   * Jugadores creados a mano desde el selector, que no están en la plantilla del
   * club. Viven en el documento (como los del rival) para que viajen con la
   * alineación al guardarla o exportarla: si estuvieran solo en la plantilla, un
   * JSON abierto en otro dispositivo dejaría su hueco vacío en el campo.
   */
  jugadoresPersonalizados: Jugador[];
  /**
   * Jugada animada. `null` mientras el tablero sea una pizarra fija: así todo lo
   * anterior sigue comportándose igual hasta que el entrenador crea una jugada.
   */
  secuencia: SecuenciaTactica | null;
}

function balonInicial(): Balon {
  return { id: generarId(), x: 50, y: 50, jugadorPoseedorId: null };
}

function documentoVacio(formacionId: string): DocumentoTactico {
  return {
    formacionId,
    titulares: [],
    banquillo: [],
    trazos: [],
    notas: '',
    objetos: [],
    balones: [balonInicial()],
    cuadricula: cuadriculaVacia(),
    rival: null,
    marcajes: [],
    cancha: canchaVacia(),
    jugadoresPersonalizados: [],
    secuencia: null,
  };
}

/**
 * Toma del documento vivo lo que se anima en una jugada. `base` es el frame que
 * se está reemplazando: de él se heredan los datos que NO viven en el documento
 * (nombre, duración y trayectorias). Sin esto, cada recaptura del frame activo
 * borraría lo que el entrenador acaba de definir.
 */
function frameDesdeDocumento(
  doc: DocumentoTactico,
  id: string,
  base?: Pick<FrameTactico, 'nombre' | 'duracionMs' | 'trayectorias'>,
): FrameTactico {
  return {
    id,
    nombre: base?.nombre,
    duracionMs: base?.duracionMs,
    trayectorias: base?.trayectorias,
    titulares: doc.titulares,
    jugadoresRival: doc.rival?.jugadores ?? [],
    balones: doc.balones,
    objetos: doc.objetos,
    trazos: doc.trazos,
    celdasPintadas: doc.cuadricula.celdasPintadas,
  };
}

/** Vuelca un frame sobre el documento vivo, dejando intacto todo lo que no se anima. */
function aplicarFrameADocumento(doc: DocumentoTactico, frame: FrameTactico): void {
  doc.titulares = frame.titulares;
  doc.balones = frame.balones;
  doc.objetos = frame.objetos;
  doc.trazos = frame.trazos;
  doc.cuadricula.celdasPintadas = frame.celdasPintadas;
  if (doc.rival) doc.rival.jugadores = frame.jugadoresRival;
}

/**
 * Captura automática (decisión de diseño): antes de movernos a otro frame se
 * vuelca lo que hay en pantalla al frame activo, para que nadie pierda cambios
 * por no haber pulsado un botón de guardar.
 */
function capturarFrameActivo(doc: DocumentoTactico): void {
  const secuencia = doc.secuencia;
  if (!secuencia) return;
  const activo = secuencia.frames[secuencia.indiceActivo];
  if (!activo) return;
  const candidato = frameDesdeDocumento(doc, activo.id, activo);
  // Solo se escribe si de verdad cambió algo. `frameDesdeDocumento` devuelve
  // siempre un objeto nuevo, y asignarlo a ciegas haría que Immer marcase el
  // documento como modificado y el historial se llenase de pasos vacíos cada
  // vez que se pulsa play o se toca un chip de la timeline.
  if (mismoContenidoFrame(candidato, activo)) return;
  secuencia.frames[secuencia.indiceActivo] = candidato;
}

/** Compara dos frames por su contenido táctico; el id y el nombre no cuentan. */
function mismoContenidoFrame(a: FrameTactico, b: FrameTactico): boolean {
  const soloContenido = ({ id: _id, nombre: _nombre, ...resto }: FrameTactico) => JSON.stringify(resto);
  return soloContenido(a) === soloContenido(b);
}

/** Mete un frame nuevo con el estado actual justo detrás del activo, y se planta en él. */
function insertarFrameTrasActivo(doc: DocumentoTactico): void {
  const secuencia = doc.secuencia;
  if (!secuencia) return;
  secuencia.frames.splice(secuencia.indiceActivo + 1, 0, frameDesdeDocumento(doc, generarId()));
  secuencia.indiceActivo += 1;
}

/** Convierte una `Alineacion` guardada a `DocumentoTactico`, rellenando con valores por
 * defecto los campos del Anexo A que no existían en tableros guardados antes de esa versión. */
function documentoDesdeAlineacion(alineacion: Alineacion): DocumentoTactico {
  return {
    formacionId: alineacion.formacionId,
    titulares: alineacion.titulares,
    banquillo: alineacion.banquillo,
    trazos: alineacion.trazos,
    notas: alineacion.notas,
    objetos: alineacion.objetos ?? [],
    balones: alineacion.balones ?? [balonInicial()],
    cuadricula: alineacion.cuadricula ?? cuadriculaVacia(),
    rival: alineacion.rival ?? null,
    marcajes: alineacion.marcajes ?? [],
    cancha: alineacion.cancha ?? canchaVacia(),
    jugadoresPersonalizados: alineacion.jugadoresPersonalizados ?? [],
    secuencia: alineacion.secuencia ?? null,
  };
}

/**
 * Reacomoda a los jugadores ya colocados según el modo de vista (FA4): con los
 * dos equipos en pantalla cada uno se recoge en su mitad, y con uno solo vuelve
 * a desplegarse por todo el campo. Se parte de la zona de origen de cada jugador
 * (no de su posición actual) para que alternar de modo sea siempre reversible y
 * no vaya arrastrando errores; quien entró desde el banquillo y no tiene zona
 * solo se recorta a su mitad.
 */
function recolocarPorModo(doc: DocumentoTactico): void {
  const enAmbos = Boolean(doc.rival?.visible) && doc.rival?.modoVista === 'ambos';

  const formacionPropia = obtenerFormacion(doc.formacionId);
  for (const titular of doc.titulares) {
    const zona = formacionPropia?.zonas.find((z) => z.id === titular.zonaOrigenId);
    if (zona) {
      const destino = ubicarZonaEnLado(zona, { espejo: false, mediaCancha: enAmbos });
      titular.x = destino.x;
      titular.y = destino.y;
    } else if (enAmbos) {
      titular.y = recortarAMitad(titular.y, false);
    }
  }

  if (!doc.rival) return;
  const formacionRival = obtenerFormacion(doc.rival.formacionId);
  for (const jugador of doc.rival.jugadores) {
    const zona = formacionRival?.zonas.find((z) => z.id === jugador.zonaOrigenId);
    if (zona) {
      const destino = ubicarZonaEnLado(zona, { espejo: true, mediaCancha: enAmbos });
      jugador.x = destino.x;
      jugador.y = destino.y;
    } else if (enAmbos) {
      jugador.y = recortarAMitad(jugador.y, true);
    }
  }
}

export function alineacionDesdeDocumento(
  base: { id: string; nombre: string; creadaEn: string },
  doc: DocumentoTactico,
  modificadaEn: string,
): Alineacion {
  return {
    id: base.id,
    nombre: base.nombre,
    formacionId: doc.formacionId,
    titulares: doc.titulares,
    banquillo: doc.banquillo,
    trazos: doc.trazos,
    notas: doc.notas,
    objetos: doc.objetos,
    balones: doc.balones,
    cuadricula: doc.cuadricula,
    rival: doc.rival,
    marcajes: doc.marcajes,
    cancha: doc.cancha,
    jugadoresPersonalizados: doc.jugadoresPersonalizados,
    secuencia: doc.secuencia,
    creadaEn: base.creadaEn,
    modificadaEn,
  };
}

function etiquetaJugador(jugadorId: string): string {
  const jugador = usePlantillaStore.getState().obtenerPorId(jugadorId);
  return jugador ? jugador.apellido.toUpperCase() : 'jugador';
}

function etiquetaJugadorRival(doc: DocumentoTactico, jugadorRivalId: string): string {
  const jugador = doc.rival?.jugadores.find((j) => j.id === jugadorRivalId);
  return jugador?.apellido?.toUpperCase() || (jugador ? `#${jugador.dorsal}` : 'rival');
}

const ETIQUETAS_TRAZO: Record<Trazo['tipo'], string> = {
  libre: 'Trazo libre dibujado',
  flecha: 'Flecha dibujada',
  discontinua: 'Línea discontinua dibujada',
  zona: 'Zona dibujada',
  texto: 'Texto añadido',
};

interface AlineacionState {
  id: string;
  nombre: string;
  creadaEn: string;
  modificadaEn: string;
  historial: Historial<DocumentoTactico>;
  listado: ResumenAlineacion[];
  estadoGuardado: EstadoGuardado;
  cargando: boolean;

  inicializar: () => Promise<void>;
  refrescarListado: () => Promise<void>;
  nuevaAlineacion: (nombre?: string) => void;
  cargarAlineacion: (id: string) => Promise<void>;
  guardarAhora: () => Promise<void>;
  renombrar: (nombre: string) => void;
  duplicarActual: () => Promise<void>;
  eliminarAlineacion: (id: string) => Promise<void>;
  reemplazarDocumentoCompleto: (alineacion: Alineacion) => void;

  seleccionarFormacion: (formacionId: string, estrategia: EstrategiaCambioFormacion) => void;
  agregarJugadorPersonalizado: (jugador: Jugador) => void;
  actualizarJugadorPersonalizado: (jugadorId: string, datos: Partial<Jugador>) => void;
  asignarJugador: (zonaId: string, x: number, y: number, jugadorId: string) => void;
  moverJugador: (jugadorId: string, x: number, y: number) => void;
  intercambiarPosiciones: (jugadorIdA: string, jugadorIdB: string) => void;
  quitarDelCampo: (jugadorId: string) => void;
  enviarABanquillo: (jugadorId: string) => void;
  quitarDeBanquillo: (jugadorId: string) => void;
  moverDesdeBanquilloACampo: (jugadorId: string, x: number, y: number) => void;
  sustituirEnCampo: (jugadorEnCampoId: string, jugadorDesdeBanquilloId: string) => void;
  toggleCapitan: (jugadorId: string) => void;
  actualizarNotaJugador: (jugadorId: string, nota: string) => void;

  agregarTrazo: (trazo: Trazo) => void;
  eliminarTrazo: (id: string) => void;
  limpiarTrazos: () => void;
  actualizarNotas: (texto: string) => void;

  // Anexo A — FA1 objetos
  agregarObjeto: (tipo: TipoObjeto, x: number, y: number, color: ColorObjeto) => void;
  agregarObjetosMultiples: (tipo: TipoObjeto, puntos: PuntoNormalizado[], color: ColorObjeto) => void;
  moverObjeto: (id: string, x: number, y: number) => void;
  rotarObjeto: (id: string, rotacion: number) => void;
  duplicarObjeto: (id: string) => void;
  duplicarObjetoEnPosicion: (id: string, x: number, y: number) => void;
  eliminarObjeto: (id: string) => void;
  limpiarObjetos: () => void;

  // Anexo A — FA2 balón
  agregarBalon: () => void;
  moverBalon: (id: string, x: number, y: number) => void;
  anclarBalon: (id: string, jugadorId: string) => void;
  liberarBalon: (id: string) => void;
  devolverBalonCentro: (id: string) => void;
  eliminarBalon: (id: string) => void;

  // Anexo A — FA3 cuadrícula
  actualizarCuadricula: (cambios: Partial<CuadriculaCampo>) => void;
  pintarCelda: (columna: number, fila: number) => void;

  // Anexo A — FA4 rival
  activarRival: (formacionId: string) => void;
  desactivarRival: () => void;
  actualizarRival: (cambios: Partial<Omit<EquipoRival, 'jugadores'>>) => void;
  seleccionarFormacionRival: (formacionId: string) => void;
  asignarJugadorRivalAZona: (zonaId: string, x: number, y: number, posicion: Posicion, dorsal: number, apellido?: string) => void;
  moverJugadorRival: (id: string, x: number, y: number) => void;
  eliminarJugadorRival: (id: string) => void;
  agregarMarcaje: (jugadorPropioId: string, jugadorRivalId: string) => void;
  eliminarMarcaje: (id: string) => void;

  // Anexo A — FA5 identidad de cancha
  actualizarCancha: (cambios: Partial<IdentidadCancha>) => void;

  // Jugadas animadas (secuencia de frames)
  iniciarSecuencia: () => void;
  descartarSecuencia: () => void;
  agregarFrame: () => void;
  /** Cierra un frame con lo que hay en pantalla sin tocar el activo (modo grabación). */
  grabarFrame: () => void;
  duplicarFrame: (indice: number) => void;
  /** Duración de la transición que arranca en ese frame. */
  setDuracionFrame: (indice: number, duracionMs: number) => void;
  setEasingSecuencia: (easing: TipoEasing) => void;
  /** Cambia una fase de sitio dentro de la jugada. */
  moverFrame: (desde: number, hasta: number) => void;
  renombrarSecuencia: (nombre: string) => void;
  agregarFrameAlFinal: () => void;
  /** Añade un nodo a la ruta de un elemento en ese frame, creándola si no existía. */
  agregarNodoTrayectoria: (
    indiceFrame: number,
    tipo: TipoDestinoRuta,
    id: string,
    punto: PuntoNormalizado,
    indiceInsercion?: number,
  ) => void;
  moverNodoTrayectoria: (indiceFrame: number, trayectoriaId: string, nodoId: string, x: number, y: number) => void;
  eliminarNodoTrayectoria: (indiceFrame: number, trayectoriaId: string, nodoId: string) => void;
  eliminarTrayectoria: (indiceFrame: number, trayectoriaId: string) => void;
  setInterpolacionTrayectoria: (indiceFrame: number, trayectoriaId: string, tipo: TipoInterpolacionRuta) => void;
  /** Duración propia de una ruta; `undefined` la devuelve a la de la fase. */
  setDuracionTrayectoria: (indiceFrame: number, trayectoriaId: string, duracionMs: number | undefined) => void;
  setOrientacionTrayectoria: (indiceFrame: number, trayectoriaId: string, modo: ModoOrientacion) => void;
  /** Enciende o apaga una de las tres cosas visibles de una ruta. */
  alternarVisibilidadTrayectoria: (
    indiceFrame: number,
    trayectoriaId: string,
    que: 'ruta' | 'nodos' | 'estela',
  ) => void;
  eliminarFrame: (indice: number) => void;
  irAFrame: (indice: number) => void;
  renombrarFrame: (indice: number, nombre: string) => void;

  deshacer: () => void;
  rehacer: () => void;
  puedeDeshacer: () => boolean;
  puedeRehacer: () => boolean;
  irAPasado: (indice: number) => void;
  irAFuturo: (indice: number) => void;
}

let temporizadorAutoguardado: ReturnType<typeof setTimeout> | null = null;

export const useAlineacionStore = create<AlineacionState>((set, get) => {
  function marcarPendiente(): void {
    set({ estadoGuardado: 'pendiente' });
    if (temporizadorAutoguardado) clearTimeout(temporizadorAutoguardado);
    temporizadorAutoguardado = setTimeout(() => {
      void get().guardarAhora();
    }, DEBOUNCE_AUTOGUARDADO_MS);
  }

  function mutar(receta: (doc: DocumentoTactico) => void, etiqueta: string): void {
    set((estado) => ({ historial: actualizarHistorial(estado.historial, receta, etiqueta) }));
    marcarPendiente();
  }

  const ahoraInicial = new Date().toISOString();

  return {
    id: generarId(),
    nombre: 'Nueva alineación',
    creadaEn: ahoraInicial,
    modificadaEn: ahoraInicial,
    historial: crearHistorial(documentoVacio(FORMACIONES[0]!.id), 'Alineación inicial'),
    listado: [],
    estadoGuardado: 'guardado',
    cargando: true,

    inicializar: async () => {
      set({ cargando: true });
      const listado = await alineacionRepository.listar();
      if (listado.length === 0) {
        get().nuevaAlineacion('Alineación inicial');
        await get().guardarAhora();
      } else {
        await get().cargarAlineacion(listado[0]!.id);
      }
      set({ cargando: false });
    },

    refrescarListado: async () => {
      const listado = await alineacionRepository.listar();
      set({ listado });
    },

    nuevaAlineacion: (nombre) => {
      if (temporizadorAutoguardado) clearTimeout(temporizadorAutoguardado);
      const ahora = new Date().toISOString();
      set({
        id: generarId(),
        nombre: nombre ?? `Alineación ${new Date().toLocaleDateString('es-CO')}`,
        creadaEn: ahora,
        modificadaEn: ahora,
        historial: crearHistorial(documentoVacio(FORMACIONES[0]!.id), 'Alineación inicial'),
        estadoGuardado: 'pendiente',
      });
      marcarPendiente();
    },

    cargarAlineacion: async (id) => {
      const alineacion = await alineacionRepository.obtener(id);
      if (!alineacion) return;
      if (temporizadorAutoguardado) clearTimeout(temporizadorAutoguardado);
      set({
        id: alineacion.id,
        nombre: alineacion.nombre,
        creadaEn: alineacion.creadaEn,
        modificadaEn: alineacion.modificadaEn,
        historial: reiniciarHistorial(documentoDesdeAlineacion(alineacion), 'Alineación cargada'),
        estadoGuardado: 'guardado',
      });
    },

    guardarAhora: async () => {
      const estado = get();
      set({ estadoGuardado: 'guardando' });
      const alineacion = alineacionDesdeDocumento(estado, estado.historial.presente, new Date().toISOString());
      try {
        await alineacionRepository.guardar(alineacion);
        set({ estadoGuardado: 'guardado', modificadaEn: alineacion.modificadaEn });
        await get().refrescarListado();
      } catch {
        set({ estadoGuardado: 'error' });
        useUiStore.getState().mostrarToast({
          tipo: 'error',
          mensaje: 'No se pudo guardar la alineación. Revisa el espacio de almacenamiento.',
          accion: { etiqueta: 'Reintentar', ejecutar: () => void get().guardarAhora() },
        });
      }
    },

    renombrar: (nombre) => {
      set({ nombre });
      marcarPendiente();
    },

    duplicarActual: async () => {
      const estado = get();
      const ahora = new Date().toISOString();
      const copia = alineacionDesdeDocumento(
        { id: generarId(), nombre: `${estado.nombre} (copia)`, creadaEn: ahora },
        estado.historial.presente,
        ahora,
      );
      await alineacionRepository.guardar(copia);
      await get().cargarAlineacion(copia.id);
      await get().refrescarListado();
    },

    eliminarAlineacion: async (id) => {
      await alineacionRepository.eliminar(id);
      await get().refrescarListado();
      if (get().id === id) {
        const listado = get().listado;
        if (listado.length > 0) {
          await get().cargarAlineacion(listado[0]!.id);
        } else {
          get().nuevaAlineacion();
        }
      }
    },

    reemplazarDocumentoCompleto: (alineacion) => {
      if (temporizadorAutoguardado) clearTimeout(temporizadorAutoguardado);
      set({
        id: alineacion.id,
        nombre: alineacion.nombre,
        creadaEn: alineacion.creadaEn,
        modificadaEn: alineacion.modificadaEn,
        historial: reiniciarHistorial(documentoDesdeAlineacion(alineacion), 'Alineación importada'),
      });
      marcarPendiente();
    },

    seleccionarFormacion: (formacionId, estrategia) => {
      const formacion = obtenerFormacion(formacionId);
      if (!formacion || estrategia === 'cancelar') return;
      const etiqueta =
        estrategia === 'vaciar' ? `Formación cambiada a ${formacion.nombre} (campo vaciado)` : `Formación cambiada a ${formacion.nombre}`;
      mutar((doc) => {
        if (estrategia === 'vaciar') {
          doc.formacionId = formacionId;
          doc.titulares = [];
          return;
        }
        const formacionAnterior = obtenerFormacion(doc.formacionId);
        const zonasDisponibles = [...formacion.zonas];
        const nuevosTitulares: JugadorEnCampo[] = [];
        for (const titular of doc.titulares) {
          const zonaOrigen = formacionAnterior?.zonas.find((z) => z.id === titular.zonaOrigenId);
          const indice = zonasDisponibles.findIndex((z) => z.posicion === zonaOrigen?.posicion);
          if (indice >= 0) {
            const zonaDestino = zonasDisponibles.splice(indice, 1)[0]!;
            nuevosTitulares.push({ ...titular, x: zonaDestino.x, y: zonaDestino.y, zonaOrigenId: zonaDestino.id });
          } else if (doc.banquillo.length < CAPACIDAD_BANQUILLO) {
            doc.banquillo.push(titular.jugadorId);
          }
        }
        doc.formacionId = formacionId;
        doc.titulares = nuevosTitulares;
        // Las zonas de la formación vienen a campo completo: recolocar deja a
        // cada uno en la mitad que le toca según el modo de vista activo (FA4).
        recolocarPorModo(doc);
      }, etiqueta);
    },

    // Se registra en el documento antes de asignarlo a una zona o al banquillo, para
    // que se guarde y se exporte con la alineación. La plantilla en memoria se
    // sincroniza aparte (ver `sincronizarPersonalizados`), así ninguna vista tiene
    // que cambiar cómo busca un jugador por id.
    agregarJugadorPersonalizado: (jugador) => {
      mutar((doc) => {
        doc.jugadoresPersonalizados.push(jugador);
      }, `${jugador.apellido.toUpperCase() || `#${jugador.dorsal}`} creado`);
    },

    // Los personalizados viven en el documento, así que editarlos es un paso del
    // historial y viaja con la alineación; los de plantilla se editan aparte,
    // en `plantillaStore`, porque deben quedar cambiados en todos los tableros.
    actualizarJugadorPersonalizado: (jugadorId, datos) => {
      mutar((doc) => {
        const jugador = doc.jugadoresPersonalizados.find((j) => j.id === jugadorId);
        if (jugador) Object.assign(jugador, datos);
      }, `${(datos.apellido ?? '').toUpperCase() || 'Jugador'} actualizado`);
    },

    // Nota: la zona conceptual queda "consumida" en zonaOrigenId aunque el jugador
    // se arrastre libremente después; así se evita reabrir el hueco y superar 11 titulares.
    asignarJugador: (zonaId, x, y, jugadorId) => {
      const zona = obtenerFormacion(get().historial.presente.formacionId)?.zonas.find((z) => z.id === zonaId);
      mutar((doc) => {
        doc.banquillo = doc.banquillo.filter((id) => id !== jugadorId);
        doc.titulares = doc.titulares.filter((t) => t.jugadorId !== jugadorId);
        doc.titulares.push({ jugadorId, x, y, zonaOrigenId: zonaId, esCapitan: false });
      }, `${etiquetaJugador(jugadorId)} asignado${zona ? ` (${zona.posicion})` : ''}`);
    },

    moverJugador: (jugadorId, x, y) => {
      mutar((doc) => {
        const titular = doc.titulares.find((t) => t.jugadorId === jugadorId);
        if (titular) {
          titular.x = x;
          titular.y = y;
        }
      }, `${etiquetaJugador(jugadorId)} movido`);
    },

    intercambiarPosiciones: (idA, idB) => {
      mutar((doc) => {
        const a = doc.titulares.find((t) => t.jugadorId === idA);
        const b = doc.titulares.find((t) => t.jugadorId === idB);
        if (!a || !b) return;
        const xA = a.x;
        const yA = a.y;
        a.x = b.x;
        a.y = b.y;
        b.x = xA;
        b.y = yA;
      }, `Posiciones intercambiadas: ${etiquetaJugador(idA)} ↔ ${etiquetaJugador(idB)}`);
    },

    quitarDelCampo: (jugadorId) => {
      mutar((doc) => {
        doc.titulares = doc.titulares.filter((t) => t.jugadorId !== jugadorId);
      }, `${etiquetaJugador(jugadorId)} quitado del campo`);
    },

    enviarABanquillo: (jugadorId) => {
      mutar((doc) => {
        doc.titulares = doc.titulares.filter((t) => t.jugadorId !== jugadorId);
        if (!doc.banquillo.includes(jugadorId) && doc.banquillo.length < CAPACIDAD_BANQUILLO) {
          doc.banquillo.push(jugadorId);
        }
      }, `${etiquetaJugador(jugadorId)} enviado al banquillo`);
    },

    quitarDeBanquillo: (jugadorId) => {
      mutar((doc) => {
        doc.banquillo = doc.banquillo.filter((id) => id !== jugadorId);
      }, `${etiquetaJugador(jugadorId)} quitado del banquillo`);
    },

    moverDesdeBanquilloACampo: (jugadorId, x, y) => {
      mutar((doc) => {
        doc.banquillo = doc.banquillo.filter((id) => id !== jugadorId);
        doc.titulares = doc.titulares.filter((t) => t.jugadorId !== jugadorId);
        doc.titulares.push({ jugadorId, x, y, esCapitan: false });
      }, `${etiquetaJugador(jugadorId)} entra desde el banquillo`);
    },

    sustituirEnCampo: (jugadorEnCampoId, jugadorDesdeBanquilloId) => {
      const etiqueta = `Cambio: entra ${etiquetaJugador(jugadorDesdeBanquilloId)} por ${etiquetaJugador(jugadorEnCampoId)}`;
      mutar((doc) => {
        const titular = doc.titulares.find((t) => t.jugadorId === jugadorEnCampoId);
        if (!titular) return;
        const { x, y, zonaOrigenId } = titular;
        doc.titulares = doc.titulares.filter((t) => t.jugadorId !== jugadorEnCampoId);
        doc.banquillo = doc.banquillo.filter((id) => id !== jugadorDesdeBanquilloId);
        if (doc.banquillo.length < CAPACIDAD_BANQUILLO) doc.banquillo.push(jugadorEnCampoId);
        doc.titulares.push({ jugadorId: jugadorDesdeBanquilloId, x, y, zonaOrigenId, esCapitan: false });
      }, etiqueta);
    },

    toggleCapitan: (jugadorId) => {
      const yaEsCapitan = get().historial.presente.titulares.find((t) => t.jugadorId === jugadorId)?.esCapitan ?? false;
      mutar((doc) => {
        for (const t of doc.titulares) t.esCapitan = t.jugadorId === jugadorId ? !t.esCapitan : false;
      }, yaEsCapitan ? `Brazalete retirado a ${etiquetaJugador(jugadorId)}` : `${etiquetaJugador(jugadorId)} nombrado capitán`);
    },

    actualizarNotaJugador: (jugadorId, nota) => {
      mutar((doc) => {
        const titular = doc.titulares.find((t) => t.jugadorId === jugadorId);
        if (titular) titular.nota = nota.trim() ? nota : undefined;
      }, `Nota de ${etiquetaJugador(jugadorId)} actualizada`);
    },

    agregarTrazo: (trazo) => mutar((doc) => void doc.trazos.push(trazo), ETIQUETAS_TRAZO[trazo.tipo]),
    eliminarTrazo: (id) =>
      mutar((doc) => {
        doc.trazos = doc.trazos.filter((t) => t.id !== id);
      }, 'Trazo borrado'),
    limpiarTrazos: () =>
      mutar((doc) => {
        doc.trazos = [];
      }, 'Pizarra limpiada'),
    actualizarNotas: (texto) =>
      mutar((doc) => {
        doc.notas = texto;
      }, 'Notas editadas'),

    // --- Anexo A — FA1 objetos ---
    agregarObjeto: (tipo, x, y, color) => {
      if (get().historial.presente.objetos.length >= LIMITE_OBJETOS) {
        useUiStore.getState().mostrarToast({ tipo: 'error', mensaje: `Máximo ${LIMITE_OBJETOS} objetos por tablero.` });
        return;
      }
      mutar((doc) => {
        doc.objetos.push({ id: generarId(), tipo, x, y, color, rotacion: 0 });
      }, `${ETIQUETAS_OBJETO[tipo]} colocado`);
    },

    agregarObjetosMultiples: (tipo, puntos, color) => {
      const actuales = get().historial.presente.objetos.length;
      const disponibles = Math.max(0, LIMITE_OBJETOS - actuales);
      const aColocar = puntos.slice(0, disponibles);
      if (aColocar.length === 0) {
        useUiStore.getState().mostrarToast({ tipo: 'error', mensaje: `Máximo ${LIMITE_OBJETOS} objetos por tablero.` });
        return;
      }
      mutar((doc) => {
        for (const punto of aColocar) {
          doc.objetos.push({ id: generarId(), tipo, x: punto.x, y: punto.y, color, rotacion: 0 });
        }
      }, `${aColocar.length} × ${ETIQUETAS_OBJETO[tipo]} distribuidos`);
    },

    moverObjeto: (id, x, y) => {
      mutar((doc) => {
        const objeto = doc.objetos.find((o) => o.id === id);
        if (objeto) {
          objeto.x = x;
          objeto.y = y;
        }
      }, 'Objeto movido');
    },

    rotarObjeto: (id, rotacion) => {
      mutar((doc) => {
        const objeto = doc.objetos.find((o) => o.id === id);
        if (objeto) objeto.rotacion = rotacion;
      }, 'Objeto rotado');
    },

    duplicarObjeto: (id) => {
      if (get().historial.presente.objetos.length >= LIMITE_OBJETOS) {
        useUiStore.getState().mostrarToast({ tipo: 'error', mensaje: `Máximo ${LIMITE_OBJETOS} objetos por tablero.` });
        return;
      }
      mutar((doc) => {
        const objeto = doc.objetos.find((o) => o.id === id);
        if (!objeto) return;
        doc.objetos.push({ ...objeto, id: generarId(), x: Math.min(98, objeto.x + 3), y: Math.min(98, objeto.y + 3) });
      }, 'Objeto duplicado');
    },

    // Alt+arrastre (escritorio, Anexo A §A.1 FA1): la copia queda donde se soltó
    // el puntero y el original no se mueve, a diferencia de duplicarObjeto().
    duplicarObjetoEnPosicion: (id, x, y) => {
      if (get().historial.presente.objetos.length >= LIMITE_OBJETOS) {
        useUiStore.getState().mostrarToast({ tipo: 'error', mensaje: `Máximo ${LIMITE_OBJETOS} objetos por tablero.` });
        return;
      }
      mutar((doc) => {
        const objeto = doc.objetos.find((o) => o.id === id);
        if (!objeto) return;
        doc.objetos.push({ ...objeto, id: generarId(), x, y });
      }, 'Objeto duplicado');
    },

    eliminarObjeto: (id) =>
      mutar((doc) => {
        doc.objetos = doc.objetos.filter((o) => o.id !== id);
      }, 'Objeto eliminado'),

    limpiarObjetos: () =>
      mutar((doc) => {
        doc.objetos = [];
      }, 'Objetos eliminados'),

    // --- Anexo A — FA2 balón ---
    agregarBalon: () => {
      if (get().historial.presente.balones.length >= LIMITE_BALONES) {
        useUiStore.getState().mostrarToast({ tipo: 'error', mensaje: `Máximo ${LIMITE_BALONES} balones por tablero.` });
        return;
      }
      mutar((doc) => {
        doc.balones.push(balonInicial());
      }, 'Balón añadido');
    },

    moverBalon: (id, x, y) => {
      mutar((doc) => {
        const balon = doc.balones.find((b) => b.id === id);
        if (balon) {
          balon.x = x;
          balon.y = y;
          balon.jugadorPoseedorId = null;
        }
      }, 'Balón movido');
    },

    anclarBalon: (id, jugadorId) => {
      mutar((doc) => {
        const balon = doc.balones.find((b) => b.id === id);
        if (balon) balon.jugadorPoseedorId = jugadorId;
      }, `Balón en posesión de ${etiquetaJugador(jugadorId)}`);
    },

    liberarBalon: (id) =>
      mutar((doc) => {
        const balon = doc.balones.find((b) => b.id === id);
        if (!balon) return;
        // Se fija primero dónde estaba a la vista: mientras estuvo anclado su
        // `x`/`y` no se actualizaron, así que soltarlo sin esto lo devolvía de
        // golpe a la última posición suelta (normalmente el centro del campo).
        const punto = posicionEfectivaBalon(balon, doc.titulares);
        balon.x = punto.x;
        balon.y = punto.y;
        balon.jugadorPoseedorId = null;
      }, 'Balón liberado'),

    devolverBalonCentro: (id) =>
      mutar((doc) => {
        const balon = doc.balones.find((b) => b.id === id);
        if (balon) {
          balon.x = 50;
          balon.y = 50;
          balon.jugadorPoseedorId = null;
        }
      }, 'Balón devuelto al centro'),

    eliminarBalon: (id) =>
      mutar((doc) => {
        doc.balones = doc.balones.filter((b) => b.id !== id);
      }, 'Balón eliminado'),

    // --- Anexo A — FA3 cuadrícula ---
    actualizarCuadricula: (cambios) =>
      mutar((doc) => {
        Object.assign(doc.cuadricula, cambios);
      }, 'Cuadrícula actualizada'),

    pintarCelda: (columna, fila) => {
      const clave = claveCelda(columna, fila);
      mutar((doc) => {
        const siguiente = siguienteColorCelda(doc.cuadricula.celdasPintadas[clave]);
        if (siguiente) doc.cuadricula.celdasPintadas[clave] = siguiente;
        else delete doc.cuadricula.celdasPintadas[clave];
      }, 'Zona pintada');
    },

    // --- Anexo A — FA4 rival ---
    activarRival: (formacionId) =>
      mutar((doc) => {
        doc.rival = { nombre: 'Rival', formacionId, paleta: 'blanco', jugadores: [], visible: true, modoVista: 'ambos' };
        recolocarPorModo(doc);
      }, 'Equipo rival activado'),

    desactivarRival: () =>
      mutar((doc) => {
        doc.rival = null;
        doc.marcajes = [];
        recolocarPorModo(doc);
      }, 'Equipo rival desactivado'),

    actualizarRival: (cambios) =>
      mutar((doc) => {
        if (!doc.rival) return;
        const cambiaReparto = cambios.modoVista !== undefined || cambios.visible !== undefined;
        Object.assign(doc.rival, cambios);
        // Solo se reacomoda si cambió qué equipos se ven: renombrar o cambiar la
        // paleta no debe mover a nadie del campo.
        if (cambiaReparto) recolocarPorModo(doc);
      }, 'Rival actualizado'),

    seleccionarFormacionRival: (formacionId) => {
      const formacion = obtenerFormacion(formacionId);
      if (!formacion) return;
      mutar((doc) => {
        if (!doc.rival) return;
        doc.rival.formacionId = formacionId;
        doc.rival.jugadores = [];
        doc.marcajes = [];
      }, `Formación rival cambiada a ${formacion.nombre}`);
    },

    asignarJugadorRivalAZona: (zonaId, x, y, posicion, dorsal, apellido) =>
      mutar((doc) => {
        if (!doc.rival) return;
        const jugador: JugadorRival = { id: generarId(), dorsal, apellido, posicion, x, y, zonaOrigenId: zonaId };
        doc.rival.jugadores.push(jugador);
      }, `Rival #${dorsal} asignado`),

    moverJugadorRival: (id, x, y) =>
      mutar((doc) => {
        const jugador = doc.rival?.jugadores.find((j) => j.id === id);
        if (jugador) {
          jugador.x = x;
          jugador.y = y;
        }
      }, 'Jugador rival movido'),

    eliminarJugadorRival: (id) => {
      const etiqueta = `Rival ${etiquetaJugadorRival(get().historial.presente, id)} quitado`;
      mutar((doc) => {
        if (doc.rival) doc.rival.jugadores = doc.rival.jugadores.filter((j) => j.id !== id);
        doc.marcajes = doc.marcajes.filter((m) => m.jugadorRivalId !== id);
      }, etiqueta);
    },

    agregarMarcaje: (jugadorPropioId, jugadorRivalId) => {
      const etiqueta = `${etiquetaJugador(jugadorPropioId)} marca a ${etiquetaJugadorRival(get().historial.presente, jugadorRivalId)}`;
      mutar((doc) => {
        const yaExiste = doc.marcajes.some((m) => m.jugadorPropioId === jugadorPropioId && m.jugadorRivalId === jugadorRivalId);
        if (!yaExiste) doc.marcajes.push({ id: generarId(), jugadorPropioId, jugadorRivalId });
      }, etiqueta);
    },

    eliminarMarcaje: (id) =>
      mutar((doc) => {
        doc.marcajes = doc.marcajes.filter((m) => m.id !== id);
      }, 'Marcaje eliminado'),

    // --- Anexo A — FA5 identidad de cancha ---
    actualizarCancha: (cambios) =>
      mutar((doc) => {
        Object.assign(doc.cancha, cambios);
      }, cambios.rotado180 !== undefined ? 'Cancha rotada' : 'Identidad de cancha actualizada'),

    // --- Jugadas animadas ---
    iniciarSecuencia: () =>
      mutar((doc) => {
        if (doc.secuencia) return;
        doc.secuencia = { frames: [frameDesdeDocumento(doc, generarId(), { nombre: 'Inicio' })], indiceActivo: 0 };
      }, 'Jugada iniciada'),

    descartarSecuencia: () =>
      mutar((doc) => {
        doc.secuencia = null;
      }, 'Jugada descartada'),

    agregarFrame: () =>
      mutar((doc) => {
        const secuencia = doc.secuencia;
        if (!secuencia) return;
        // El frame nuevo arranca como copia del estado actual: así el entrenador
        // mueve solo lo que cambia en ese paso, en vez de recolocarlo todo.
        capturarFrameActivo(doc);
        insertarFrameTrasActivo(doc);
      }, 'Frame añadido'),

    grabarFrame: () =>
      mutar((doc) => {
        const secuencia = doc.secuencia;
        const activo = secuencia?.frames[secuencia.indiceActivo];
        if (!secuencia || !activo) return;
        // Un arrastre que no llegó a mover nada (se soltó fuera del campo, o
        // sobre el mismo sitio) no debe abrir un frame: la jugada se llenaría
        // de pasos idénticos y la reproducción se quedaría congelada en ellos.
        if (mismoContenidoFrame(frameDesdeDocumento(doc, activo.id, activo), activo)) return;
        // A diferencia de `agregarFrame`, aquí NO se vuelca el frame activo: el
        // documento ya trae los movimientos recién hechos, y volcarlos machacaría
        // las posiciones de partida. El activo conserva el "antes" y el nuevo
        // guarda el "después", que es lo que hace que la jugada se anime.
        insertarFrameTrasActivo(doc);
      }, 'Movimiento grabado'),

    duplicarFrame: (indice) =>
      mutar((doc) => {
        const secuencia = doc.secuencia;
        if (!secuencia) return;
        capturarFrameActivo(doc);
        const original = secuencia.frames[indice];
        if (!original) return;
        secuencia.frames.splice(indice + 1, 0, { ...original, id: generarId(), nombre: undefined });
        secuencia.indiceActivo = indice + 1;
        aplicarFrameADocumento(doc, secuencia.frames[secuencia.indiceActivo]!);
      }, 'Frame duplicado'),

    eliminarFrame: (indice) =>
      mutar((doc) => {
        const secuencia = doc.secuencia;
        // Una jugada siempre conserva al menos un frame: para quedarse sin
        // ninguno está `descartarSecuencia`, que es una acción distinta y explícita.
        if (!secuencia || secuencia.frames.length <= 1 || !secuencia.frames[indice]) return;
        secuencia.frames.splice(indice, 1);
        secuencia.indiceActivo = Math.min(secuencia.indiceActivo, secuencia.frames.length - 1);
        aplicarFrameADocumento(doc, secuencia.frames[secuencia.indiceActivo]!);
      }, 'Frame eliminado'),

    irAFrame: (indice) =>
      mutar((doc) => {
        const secuencia = doc.secuencia;
        if (!secuencia) return;
        const destino = secuencia.frames[indice];
        if (!destino) return;
        // Se captura siempre, incluso al "ir" al frame en el que ya se está: es
        // lo que recoge lo editado antes de reproducir. Sin esto, quien mueve
        // un jugador y pulsa play directamente ve la jugada anterior.
        capturarFrameActivo(doc);
        if (indice === secuencia.indiceActivo) return;
        secuencia.indiceActivo = indice;
        aplicarFrameADocumento(doc, destino);
      }, `Frame ${indice + 1}`),

    setDuracionFrame: (indice, duracionMs) =>
      mutar((doc) => {
        const frame = doc.secuencia?.frames[indice];
        if (!frame) return;
        frame.duracionMs = Math.min(DURACION_MAXIMA_MS, Math.max(DURACION_MINIMA_MS, Math.round(duracionMs)));
      }, 'Duración de la fase'),

    setEasingSecuencia: (easing) =>
      mutar((doc) => {
        if (doc.secuencia) doc.secuencia.easing = easing;
      }, 'Curva de movimiento'),

    moverFrame: (desde, hasta) =>
      mutar((doc) => {
        const secuencia = doc.secuencia;
        if (!secuencia) return;
        const ultimo = secuencia.frames.length - 1;
        if (desde < 0 || desde > ultimo || hasta < 0 || hasta > ultimo || desde === hasta) return;
        const [frame] = secuencia.frames.splice(desde, 1);
        if (!frame) return;
        secuencia.frames.splice(hasta, 0, frame);
        // La fase activa viaja con ella: mover algo y perderlo de vista desorienta.
        secuencia.indiceActivo = hasta;
      }, 'Fase movida'),

    renombrarSecuencia: (nombre) =>
      mutar((doc) => {
        if (doc.secuencia) doc.secuencia.nombre = nombre.trim() || undefined;
      }, 'Jugada renombrada'),

    agregarFrameAlFinal: () =>
      mutar((doc) => {
        const secuencia = doc.secuencia;
        if (!secuencia) return;
        capturarFrameActivo(doc);
        secuencia.frames.push(frameDesdeDocumento(doc, generarId()));
        secuencia.indiceActivo = secuencia.frames.length - 1;
      }, 'Fase añadida al final'),

    agregarNodoTrayectoria: (indiceFrame, tipo, id, punto, indiceInsercion) =>
      mutar((doc) => {
        const frame = doc.secuencia?.frames[indiceFrame];
        if (!frame) return;
        if (!frame.trayectorias) frame.trayectorias = [];
        let ruta = trayectoriaDe(frame.trayectorias, tipo, id);
        if (!ruta) {
          ruta = {
            id: generarId(),
            ...destinoDeTrayectoria(tipo, id),
            nodos: [],
            interpolacion: 'catmull-rom',
            mostrarRuta: true,
          };
          frame.trayectorias.push(ruta);
        }
        const nodo = { id: generarId(), x: punto.x, y: punto.y };
        const donde = indiceInsercion ?? ruta.nodos.length;
        ruta.nodos.splice(Math.max(0, Math.min(ruta.nodos.length, donde)), 0, nodo);
      }, 'Nodo añadido'),

    moverNodoTrayectoria: (indiceFrame, trayectoriaId, nodoId, x, y) =>
      mutar((doc) => {
        const ruta = doc.secuencia?.frames[indiceFrame]?.trayectorias?.find((t) => t.id === trayectoriaId);
        const nodo = ruta?.nodos.find((n) => n.id === nodoId);
        if (!nodo) return;
        nodo.x = Math.max(0, Math.min(100, x));
        nodo.y = Math.max(0, Math.min(100, y));
      }, 'Nodo movido'),

    eliminarNodoTrayectoria: (indiceFrame, trayectoriaId, nodoId) =>
      mutar((doc) => {
        const frame = doc.secuencia?.frames[indiceFrame];
        const ruta = frame?.trayectorias?.find((t) => t.id === trayectoriaId);
        if (!frame || !ruta) return;
        ruta.nodos = ruta.nodos.filter((n) => n.id !== nodoId);
        // Sin nodos intermedios la ruta ya no aporta nada: el movimiento vuelve
        // a ser la recta de siempre, así que se retira en vez de dejarla vacía.
        if (ruta.nodos.length === 0) frame.trayectorias = frame.trayectorias!.filter((t) => t.id !== ruta.id);
      }, 'Nodo eliminado'),

    eliminarTrayectoria: (indiceFrame, trayectoriaId) =>
      mutar((doc) => {
        const frame = doc.secuencia?.frames[indiceFrame];
        if (!frame?.trayectorias) return;
        frame.trayectorias = frame.trayectorias.filter((t) => t.id !== trayectoriaId);
      }, 'Trayectoria eliminada'),

    setInterpolacionTrayectoria: (indiceFrame, trayectoriaId, tipo) =>
      mutar((doc) => {
        const ruta = doc.secuencia?.frames[indiceFrame]?.trayectorias?.find((t) => t.id === trayectoriaId);
        if (ruta) ruta.interpolacion = tipo;
      }, 'Curva de la trayectoria'),

    setDuracionTrayectoria: (indiceFrame, trayectoriaId, duracionMs) =>
      mutar((doc) => {
        const ruta = doc.secuencia?.frames[indiceFrame]?.trayectorias?.find((t) => t.id === trayectoriaId);
        if (!ruta) return;
        if (duracionMs === undefined || !Number.isFinite(duracionMs)) {
          delete ruta.duracionMs;
          return;
        }
        ruta.duracionMs = Math.min(DURACION_MAXIMA_MS, Math.max(DURACION_MINIMA_MS, Math.round(duracionMs)));
      }, 'Duración del recorrido'),

    setOrientacionTrayectoria: (indiceFrame, trayectoriaId, modo) =>
      mutar((doc) => {
        const ruta = doc.secuencia?.frames[indiceFrame]?.trayectorias?.find((t) => t.id === trayectoriaId);
        if (ruta) ruta.orientacion = modo;
      }, 'Orientación del recorrido'),

    alternarVisibilidadTrayectoria: (indiceFrame, trayectoriaId, que) =>
      mutar((doc) => {
        const ruta = doc.secuencia?.frames[indiceFrame]?.trayectorias?.find((t) => t.id === trayectoriaId);
        if (!ruta) return;
        if (que === 'ruta') ruta.mostrarRuta = !ruta.mostrarRuta;
        // Nodos y estela son opcionales con distinto valor por defecto: los
        // nodos se ven salvo que se apaguen, la estela solo si se enciende.
        else if (que === 'nodos') ruta.mostrarNodos = ruta.mostrarNodos === false;
        else ruta.mostrarEstela = !ruta.mostrarEstela;
      }, 'Visibilidad del recorrido'),

    renombrarFrame: (indice, nombre) =>
      mutar((doc) => {
        const frame = doc.secuencia?.frames[indice];
        if (frame) frame.nombre = nombre.trim() || undefined;
      }, 'Frame renombrado'),

    deshacer: () => {
      set((estado) => ({ historial: deshacerHistorial(estado.historial) }));
      marcarPendiente();
    },
    rehacer: () => {
      set((estado) => ({ historial: rehacerHistorial(estado.historial) }));
      marcarPendiente();
    },
    puedeDeshacer: () => get().historial.pasado.length > 0,
    puedeRehacer: () => get().historial.futuro.length > 0,
    irAPasado: (indice) => {
      set((estado) => ({ historial: saltarAPasado(estado.historial, indice) }));
      marcarPendiente();
    },
    irAFuturo: (indice) => {
      set((estado) => ({ historial: saltarAFuturo(estado.historial, indice) }));
      marcarPendiente();
    },
  };
});
