import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDndMonitor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { EscalaCampoProvider, useProveerEscalaCampo } from '../../hooks/useCampoEscala';
import type { DatosArrastreJugador } from '../../hooks/useDragJugador';
import { useAlineacionStore } from '../../store/alineacionStore';
import { usePizarraStore } from '../../store/pizarraStore';
import { usePizarraCampoStore } from '../../store/pizarraCampoStore';
import { usePlantillaStore } from '../../store/plantillaStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { useUiStore } from '../../store/uiStore';
import { obtenerFormacion } from '../../data/formaciones';
import type { ColorObjeto, Orientacion, Posicion, PuntoNormalizado, TipoObjeto, ZonaFormacion } from '../../types';
import { ANCHO_CAMPO_M, COLORES_OBJETO, LARGO_CAMPO_M, PAUSA_GRABACION_MS } from '../../utils/constantes';
import { posicionEfectivaBalon } from '../../utils/balon';
import { muestrearRuta, puntosDeControl, segmentoEnPunto, trayectoriaDe } from '../../utils/trayectorias';
import { pixelesAPorcentaje, VENTANA_CAMPO_COMPLETO, type VentanaRecorte } from '../../utils/coordenadas';
import { generarPuntosFila, generarPuntosRejilla, generarPuntosSlalom, ubicarZonaEnLado } from '../../utils/anexoA';
import { LineasCampo } from './LineasCampo';
import { Zona } from './Zona';
import { ZonaRival } from './ZonaRival';
import { DraggableJugador } from '../jugador/DraggableJugador';
import { MenuJugador } from '../jugador/MenuJugador';
import { SelectorJugador } from '../jugador/SelectorJugador';
import { ModalJugadorPersonalizado } from '../jugador/ModalJugadorPersonalizado';
import { ModalNotaJugador } from '../jugador/ModalNotaJugador';
import { CapaDibujo } from '../pizarra/CapaDibujo';
import { DrawerPlantilla } from '../ui/DrawerPlantilla';
import { CapaCuadricula } from './CapaCuadricula';
import { CapaReproduccion } from './CapaReproduccion';
import { CapaTrayectorias } from './CapaTrayectorias';
import { IconoObjeto } from './IconoObjeto';
import { ObjetoCampoDraggable, type DatosArrastreObjeto } from './ObjetoCampoDraggable';
import { BalonDraggable, type DatosArrastreBalon } from './BalonDraggable';
import { NodoRutaDraggable, type DatosArrastreNodo } from './NodoRutaDraggable';
import { TarjetaRivalDraggable, type DatosArrastreRival } from './TarjetaRivalDraggable';
import { CapaMarcajes } from './CapaMarcajes';
import { ModalAgregarRival } from './ModalAgregarRival';
import { ModalElegirRivalParaMarcar } from './ModalElegirRivalParaMarcar';

export interface ElementosExportacion {
  svg: SVGSVGElement;
  canvas: HTMLCanvasElement | null;
  ancho: number;
  alto: number;
  orientacion: Orientacion;
}

export interface CampoHandle {
  obtenerElementosExportacion: () => ElementosExportacion | null;
}

/**
 * Los jugadores en el campo se mueven solo con CSS transform (exigido por
 * §8.4 para mantener 60fps). Eso no dispara ningún remedido de layout, y en la
 * práctica ni siquiera `MeasuringStrategy.Always` (`CONFIG_MEDICION`) ni forzar
 * `measureDroppableContainers()` a mano evitan que dnd-kit deje cacheado el
 * rect de los droppables "slot-{id}" con la posición de cuando se montaron —
 * verificado comparando `droppableContainer.rect.current` (el valor que usa
 * `pointerWithin`) contra `nodo.getBoundingClientRect()` en el mismo instante:
 * cuando un jugador cambia de posición sin pasar por un arrastre (asignación
 * desde el selector, sustitución, "Cambiar por⬦") ese rect queda obsoleto y ya
 * no hay ningún evento de drag posterior que lo refresque a tiempo para el
 * primer soltado sobre él (p. ej. anclar el balón, FA2). Por eso el emparejamiento
 * con "slot-{id}" de aquí abajo NO usa `pointerWithin` (que confía en ese
 * caché) sino una comparación manual contra `getBoundingClientRect()` en vivo.
 *
 * Por la misma razón, `active.rect.current` (el rect de la propia tarjeta que
 * se arrastra) también queda obsoleto para las tarjetas del campo: dnd-kit lo
 * mide una sola vez al montar el draggable, y esas tarjetas se reposicionan
 * después solo con transform, sin volver a montarse. Los algoritmos basados
 * en ese rect (`closestCenter`, `rectIntersection`) heredan ese error, así
 * que para todo lo que no sea un "slot-{id}" se seguye usando `pointerWithin`
 * contra `pointerCoordinates` (la posición real del puntero, siempre fiable)
 * en vez de esos algoritmos.
 *
 * Se prioriza el "slot-{id}" puntual bajo el puntero (para el intercambio al
 * soltar encima de otro jugador); si no hay ninguno, cualquier droppable
 * grande (campo/banquillo) que contenga el puntero. Como último recurso —el
 * puntero cayó a un par de píxeles del borde del contenedor, algo que puede
 * pasar en un dedo real sobre una tablet— se cae a `rectIntersection` sobre
 * esos mismos contenedores grandes: es más permisivo (cualquier solape del
 * rect de la tarjeta cuenta) y, al excluir los "slot-{id}", no puede reabrir
 * el bug del intercambio.
 */
const CONFIG_MEDICION = { droppable: { strategy: MeasuringStrategy.Always } };

const detectarColision: CollisionDetection = (args) => {
  const puntero = args.pointerCoordinates;
  if (puntero) {
    // El "slot-{id}" propio del jugador que se arrastra sigue su posición en vivo (es el
    // mismo nodo), así que sin esta exclusión el jugador "chocaría contra sí mismo" en
    // cuanto el puntero lo alcance y el resto del gesto se leería como soltarlo sobre su
    // propio slot en vez de sobre el campo.
    const slotPropio = `slot-${args.active.id}`;
    for (const contenedor of args.droppableContainers) {
      if (typeof contenedor.id !== 'string' || !contenedor.id.startsWith('slot-') || contenedor.disabled) continue;
      if (contenedor.id === slotPropio) continue;
      const nodo = contenedor.node.current;
      if (!nodo) continue;
      const r = nodo.getBoundingClientRect();
      if (puntero.x >= r.left && puntero.x <= r.right && puntero.y >= r.top && puntero.y <= r.bottom) {
        return [{ id: contenedor.id, data: { droppableContainer: contenedor, value: 0 } }];
      }
    }
  }

  const colisionesPuntero = pointerWithin(args);
  if (colisionesPuntero.length > 0) return colisionesPuntero;

  const candidatosGrandes = args.droppableContainers.filter(
    (contenedor) => contenedor.id === 'campo' || contenedor.id === 'banquillo',
  );
  return rectIntersection({ ...args, droppableContainers: candidatosGrandes });
};

interface ZonaCampoDroppableProps {
  contenedorRef: MutableRefObject<HTMLDivElement | null>;
  ancho: number;
  alto: number;
  children: ReactNode;
}

/**
 * `useDroppable` solo puede "ver" el registro real de dnd-kit si el
 * componente que lo llama es descendiente de `<DndContext>` en el árbol de
 * React. `Campo` no lo es respecto de SU PROPIO `<DndContext>`: lo está
 * creando, no está anidado dentro de él. Por eso el droppable 'campo' vivía
 * antes en un contexto interno inerte (el valor por defecto de dnd-kit) y
 * `over` llegaba `undefined` en cada suelta, sin importar el algoritmo de
 * colisión. Aislarlo en este componente hijo, renderizado dentro de
 * `<DndContext>`, lo registra en el contexto correcto.
 */
function ZonaCampoDroppable({ contenedorRef, ancho, alto, children }: ZonaCampoDroppableProps) {
  const { setNodeRef } = useDroppable({ id: 'campo' });
  const asignarRef = useCallback(
    (nodo: HTMLDivElement | null) => {
      contenedorRef.current = nodo;
      setNodeRef(nodo);
    },
    [contenedorRef, setNodeRef],
  );

  return (
    <div
      ref={asignarRef}
      className="relative touch-none select-none overflow-hidden rounded-lg shadow-elevada ring-1 ring-white/10"
      style={{ width: ancho, height: alto }}
    >
      {children}
    </div>
  );
}

interface ArrastreJugadorActivo {
  jugadorId: string;
  delta: { x: number; y: number };
}

/**
 * `useDndMonitor` tiene la misma restricción que `useDroppable`/`useDraggable`:
 * solo ve el `<DndContext>` correcto si es descendiente suyo en el árbol de
 * React (ver nota de `ZonaCampoDroppable`). Vive aparte para que el balón
 * anclado a un jugador (FA2) pueda leer el delta en vivo del arrastre de ESE
 * jugador — el suyo propio, vía `useDraggable`, no lo expone — y así seguirlo
 * sin desfase mientras se arrastra, en vez de solo saltar al soltar.
 */
function MonitorArrastreJugador({ onCambio }: { onCambio: (valor: ArrastreJugadorActivo | null) => void }) {
  useDndMonitor({
    onDragMove: (evento) => {
      const datos = evento.active.data.current as DatosArrastreJugador | undefined;
      if (datos?.tipoArrastre === 'jugador') {
        onCambio({ jugadorId: datos.jugadorId, delta: evento.delta });
      }
    },
    onDragEnd: () => onCambio(null),
    onDragCancel: () => onCambio(null),
  });
  return null;
}

function crearCoordinateGetter(pasoX: number, pasoY: number): KeyboardCoordinateGetter {
  return (evento, { currentCoordinates }) => {
    switch (evento.code) {
      case 'ArrowRight':
        evento.preventDefault();
        return { x: currentCoordinates.x + pasoX, y: currentCoordinates.y };
      case 'ArrowLeft':
        evento.preventDefault();
        return { x: currentCoordinates.x - pasoX, y: currentCoordinates.y };
      case 'ArrowDown':
        evento.preventDefault();
        return { x: currentCoordinates.x, y: currentCoordinates.y + pasoY };
      case 'ArrowUp':
        evento.preventDefault();
        return { x: currentCoordinates.x, y: currentCoordinates.y - pasoY };
      default:
        return undefined;
    }
  };
}

function calcularVentana(vista: 'completo' | 'medio' | 'tercio'): VentanaRecorte {
  if (vista === 'medio') return { desde: 50, hasta: 100 };
  if (vista === 'tercio') return { desde: 200 / 3, hasta: 100 };
  return VENTANA_CAMPO_COMPLETO;
}

type DatosArrastreCampo =
  | DatosArrastreJugador
  | DatosArrastreObjeto
  | DatosArrastreBalon
  | DatosArrastreRival
  | DatosArrastreNodo;

/** Radio en píxeles para dar por tocada una ficha con la herramienta Movimiento. */
const RADIO_TOQUE_FICHA_PX = 36;
const RADIO_TOQUE_BALON_PX = 20;
const RADIO_TOQUE_OBJETO_PX = 22;
/** Cuánto puede desviarse un toque de la línea y seguir contando como "sobre la ruta". */
const TOLERANCIA_LINEA_PX = 22;

export const Campo = forwardRef<CampoHandle>(function Campo(_props, ref) {
  const esAnchoMedio = useMediaQuery('(min-width: 640px)');
  const orientacionForzada = useUiStore((s) => s.orientacionForzada);
  const orientacion: Orientacion =
    orientacionForzada === 'auto' ? (esAnchoMedio ? 'horizontal' : 'vertical') : orientacionForzada;

  const documento = useAlineacionStore((s) => s.historial.presente);
  const asignarJugador = useAlineacionStore((s) => s.asignarJugador);
  const agregarJugadorPersonalizado = useAlineacionStore((s) => s.agregarJugadorPersonalizado);
  const moverJugador = useAlineacionStore((s) => s.moverJugador);
  const moverDesdeBanquilloACampo = useAlineacionStore((s) => s.moverDesdeBanquilloACampo);
  const intercambiarPosiciones = useAlineacionStore((s) => s.intercambiarPosiciones);
  const sustituirEnCampo = useAlineacionStore((s) => s.sustituirEnCampo);
  const quitarDelCampo = useAlineacionStore((s) => s.quitarDelCampo);
  const enviarABanquillo = useAlineacionStore((s) => s.enviarABanquillo);
  const toggleCapitan = useAlineacionStore((s) => s.toggleCapitan);
  const actualizarNotaJugador = useAlineacionStore((s) => s.actualizarNotaJugador);

  const agregarObjeto = useAlineacionStore((s) => s.agregarObjeto);
  const agregarObjetosMultiples = useAlineacionStore((s) => s.agregarObjetosMultiples);
  const moverObjeto = useAlineacionStore((s) => s.moverObjeto);
  const rotarObjeto = useAlineacionStore((s) => s.rotarObjeto);
  const duplicarObjeto = useAlineacionStore((s) => s.duplicarObjeto);
  const duplicarObjetoEnPosicion = useAlineacionStore((s) => s.duplicarObjetoEnPosicion);
  const eliminarObjeto = useAlineacionStore((s) => s.eliminarObjeto);

  const moverBalon = useAlineacionStore((s) => s.moverBalon);
  const anclarBalon = useAlineacionStore((s) => s.anclarBalon);
  const liberarBalon = useAlineacionStore((s) => s.liberarBalon);
  const devolverBalonCentro = useAlineacionStore((s) => s.devolverBalonCentro);
  const eliminarBalon = useAlineacionStore((s) => s.eliminarBalon);

  const pintarCelda = useAlineacionStore((s) => s.pintarCelda);

  const asignarJugadorRivalAZona = useAlineacionStore((s) => s.asignarJugadorRivalAZona);
  const moverJugadorRival = useAlineacionStore((s) => s.moverJugadorRival);
  const eliminarJugadorRival = useAlineacionStore((s) => s.eliminarJugadorRival);
  const agregarMarcaje = useAlineacionStore((s) => s.agregarMarcaje);
  const eliminarMarcaje = useAlineacionStore((s) => s.eliminarMarcaje);

  // Se suscribe a la lista, no a `obtenerPorId`: esa función tiene identidad estable
  // y Zustand no re-renderizaría al añadirse un jugador personalizado, así que su
  // ficha no aparecería hasta que otra cosa provocara un render.
  const jugadoresPlantilla = usePlantillaStore((s) => s.jugadores);
  const obtenerPorId = (id: string) => jugadoresPlantilla.find((j) => j.id === id);
  const modoDibujoActivo = usePizarraStore((s) => s.modoDibujoActivo);
  const mostrarToast = useUiStore((s) => s.mostrarToast);

  const modoObjetoActivo = usePizarraCampoStore((s) => s.modoObjetoActivo);
  const tipoObjetoActivo = usePizarraCampoStore((s) => s.tipoObjetoActivo);
  const colorObjetoActivo = usePizarraCampoStore((s) => s.colorObjetoActivo);
  const herramientaDistribucion = usePizarraCampoStore((s) => s.herramientaDistribucion);
  const nDistribucion = usePizarraCampoStore((s) => s.nDistribucion);
  const puntoDistribucionA = usePizarraCampoStore((s) => s.puntoDistribucionA);
  const setPuntoDistribucionA = usePizarraCampoStore((s) => s.setPuntoDistribucionA);

  const formacion = useMemo(() => obtenerFormacion(documento.formacionId), [documento.formacionId]);
  const formacionRival = useMemo(
    () => (documento.rival ? obtenerFormacion(documento.rival.formacionId) : undefined),
    [documento.rival],
  );

  const outerRef = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState({ ancho: 0, alto: 0 });
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (!entrada) return;
      setDisponible({ ancho: entrada.contentRect.width, alto: entrada.contentRect.height });
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const ventana = useMemo(() => calcularVentana(documento.cancha.vista), [documento.cancha.vista]);
  const fraccionVentana = (ventana.hasta - ventana.desde) / 100;
  const ratioAncho = orientacion === 'vertical' ? ANCHO_CAMPO_M : LARGO_CAMPO_M * fraccionVentana;
  const ratioAlto = orientacion === 'vertical' ? LARGO_CAMPO_M * fraccionVentana : ANCHO_CAMPO_M;
  const dimensionesCampo = useMemo(() => {
    if (disponible.ancho === 0 || disponible.alto === 0) return { ancho: 0, alto: 0 };
    const escalaFit = Math.min(disponible.ancho / ratioAncho, disponible.alto / ratioAlto);
    return { ancho: ratioAncho * escalaFit, alto: ratioAlto * escalaFit };
  }, [disponible, ratioAncho, ratioAlto]);

  const escala = useProveerEscalaCampo(orientacion, ventana, documento.cancha.rotado180);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle(ref, () => ({
    obtenerElementosExportacion: () => {
      if (!svgRef.current) return null;
      return { svg: svgRef.current, canvas: canvasRef.current, ancho: dimensionesCampo.ancho, alto: dimensionesCampo.alto, orientacion };
    },
  }));

  const pasoTeclado = { x: escala.ancho / 100, y: escala.alto / 100 };
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: crearCoordinateGetter(pasoTeclado.x || 5, pasoTeclado.y || 5) }),
  );

  const [zonaActiva, setZonaActiva] = useState<ZonaFormacion | null>(null);
  const [zonaParaPersonalizado, setZonaParaPersonalizado] = useState<ZonaFormacion | null>(null);
  const [menu, setMenu] = useState<{ jugadorId: string; x: number; y: number } | null>(null);
  const [cambioParaId, setCambioParaId] = useState<string | null>(null);
  const [notaParaId, setNotaParaId] = useState<string | null>(null);
  const [zonaRivalActiva, setZonaRivalActiva] = useState<ZonaFormacion | null>(null);
  const [menuBalon, setMenuBalon] = useState<{ balonId: string; x: number; y: number } | null>(null);
  const [menuRival, setMenuRival] = useState<{ jugadorRivalId: string; x: number; y: number } | null>(null);
  const objetoSeleccionadoId = usePizarraCampoStore((s) => s.objetoSeleccionadoId);
  const setObjetoSeleccionadoId = usePizarraCampoStore((s) => s.setObjetoSeleccionadoId);
  const [marcandoDesdeId, setMarcandoDesdeId] = useState<string | null>(null);
  const [arrastreJugadorActivo, setArrastreJugadorActivo] = useState<ArrastreJugadorActivo | null>(null);
  /**
   * Copia local de un objeto justo antes de eliminarlo por arrastrarlo fuera del
   * campo (FA1): `eliminarObjeto` sigue disparándose de inmediato (para que
   * Deshacer funcione igual que siempre), y esta lista solo sostiene la última
   * imagen del objeto en pantalla mientras se desvanece con CSS, puramente visual.
   */
  const [fantasmasDesvaneciendo, setFantasmasDesvaneciendo] = useState<
    { id: string; tipo: TipoObjeto; x: number; y: number; color: ColorObjeto; rotacion: number }[]
  >([]);

  // Alt+arrastre (Anexo A §A.1 FA1, "Duplicar"): se rastrea aparte porque el
  // DragEndEvent de dnd-kit no expone el estado de las teclas modificadoras.
  const altPresionadoRef = useRef(false);
  useEffect(() => {
    function alPresionar(evento: KeyboardEvent): void {
      if (evento.key === 'Alt') altPresionadoRef.current = true;
    }
    function alSoltar(evento: KeyboardEvent): void {
      if (evento.key === 'Alt') altPresionadoRef.current = false;
    }
    function alPerderFoco(): void {
      altPresionadoRef.current = false;
    }
    window.addEventListener('keydown', alPresionar);
    window.addEventListener('keyup', alSoltar);
    window.addEventListener('blur', alPerderFoco);
    return () => {
      window.removeEventListener('keydown', alPresionar);
      window.removeEventListener('keyup', alSoltar);
      window.removeEventListener('blur', alPerderFoco);
    };
  }, []);

  // Con los dos equipos en pantalla a la vez, cada formación se comprime en su
  // propia mitad; con uno solo, cada equipo despliega el campo entero (FA4).
  const enModoAmbos = Boolean(documento.rival?.visible) && documento.rival?.modoVista === 'ambos';

  const zonasVacias = useMemo(
    () =>
      formacion?.zonas
        .filter((z) => !documento.titulares.some((t) => t.zonaOrigenId === z.id))
        .map((z) => ubicarZonaEnLado(z, { espejo: false, mediaCancha: enModoAmbos })) ?? [],
    [formacion, documento.titulares, enModoAmbos],
  );

  const rivalZonasVacias = useMemo(
    () =>
      formacionRival?.zonas
        .filter((z) => !documento.rival!.jugadores.some((j) => j.zonaOrigenId === z.id))
        .map((z) => ubicarZonaEnLado(z, { espejo: true, mediaCancha: enModoAmbos })) ?? [],
    [formacionRival, documento.rival, enModoAmbos],
  );

  const centroOcupado = useMemo(() => {
    const cerca = (p: { x: number; y: number }) => Math.abs(p.x - 50) < 14 && Math.abs(p.y - 50) < 10;
    return documento.titulares.some(cerca) || (documento.rival?.jugadores.some(cerca) ?? false);
  }, [documento.titulares, documento.rival]);

  // Durante la reproducción manda `CapaReproduccion`: las fichas interactivas se
  // ocultan para que no se puedan arrastrar por accidente ni se dupliquen en pantalla.
  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);
  // Previsualizar (barra arrastrada a un instante intermedio) manda lo mismo que
  // reproducir: lo que se ve es un cálculo, no un estado que se pueda editar.
  const previsualizando = useReproduccionStore((s) => s.previsualizando);
  const enAnimacion = reproduciendo || previsualizando;
  // Dibujos y celdas pintadas viven en cada fase, así que durante la animación
  // hay que mostrar los de la fase que se ve, no los de la que se edita. Se
  // dirige con el índice de fase (cambia una vez por tramo) y no con el reloj,
  // que cambiaría 60 veces por segundo y re-renderizaría todo el campo.
  const indiceEnReproduccion = useReproduccionStore((s) => s.indiceFrame);
  const frameMostrado = enAnimacion ? documento.secuencia?.frames[indiceEnReproduccion] : undefined;

  // --- Herramienta "Movimiento" (trayectorias por nodos) ---
  const modoTrayectoriaActivo = usePizarraCampoStore((s) => s.modoTrayectoriaActivo);
  const sujetoTrayectoria = usePizarraCampoStore((s) => s.sujetoTrayectoria);
  const setSujetoTrayectoria = usePizarraCampoStore((s) => s.setSujetoTrayectoria);
  const agregarNodoTrayectoria = useAlineacionStore((s) => s.agregarNodoTrayectoria);
  const moverNodoTrayectoria = useAlineacionStore((s) => s.moverNodoTrayectoria);
  const eliminarNodoTrayectoria = useAlineacionStore((s) => s.eliminarNodoTrayectoria);
  const indiceFrameActivo = documento.secuencia?.indiceActivo ?? 0;
  const rutasDelFrame = documento.secuencia?.frames[indiceFrameActivo]?.trayectorias;
  const rutaEnEdicion = sujetoTrayectoria
    ? trayectoriaDe(rutasDelFrame, sujetoTrayectoria.tipo, sujetoTrayectoria.id)
    : undefined;
  const rivalVisible =
    !enAnimacion && Boolean(documento.rival?.visible) && documento.rival?.modoVista !== 'solo_nosotros';
  const propioVisible = !enAnimacion && documento.rival?.modoVista !== 'solo_rival';
  const interaccionBloqueada = modoDibujoActivo || modoObjetoActivo || enAnimacion;

  // --- Modo grabación ---
  // Los movimientos seguidos se agrupan: el frame se cierra cuando pasan
  // PAUSA_GRABACION_MS sin tocar el campo. Así una línea defensiva entera se
  // mueve en un solo paso de la jugada en vez de abrir un frame por jugador.
  const grabando = useReproduccionStore((s) => s.grabando);
  const grabarFrame = useAlineacionStore((s) => s.grabarFrame);
  const temporizadorGrabacionRef = useRef<number | null>(null);

  function registrarMovimientoGrabado(): void {
    // Se lee del store en vez de la variable de render: `onDragEnd` puede
    // dispararse con una clausura vieja si la grabación se activó hace nada.
    if (!useReproduccionStore.getState().grabando) return;
    if (temporizadorGrabacionRef.current !== null) window.clearTimeout(temporizadorGrabacionRef.current);
    temporizadorGrabacionRef.current = window.setTimeout(() => {
      temporizadorGrabacionRef.current = null;
      useAlineacionStore.getState().grabarFrame();
    }, PAUSA_GRABACION_MS);
  }

  useEffect(() => {
    if (grabando) return;
    // Al parar de grabar se cierra el frame pendiente: si no, el último
    // movimiento se perdería por haber caído dentro de la ventana de pausa.
    if (temporizadorGrabacionRef.current === null) return;
    window.clearTimeout(temporizadorGrabacionRef.current);
    temporizadorGrabacionRef.current = null;
    grabarFrame();
  }, [grabando, grabarFrame]);

  useEffect(
    () => () => {
      if (temporizadorGrabacionRef.current !== null) window.clearTimeout(temporizadorGrabacionRef.current);
    },
    [],
  );

  function manejarClicColocacion(evento: ReactMouseEvent<HTMLDivElement>): void {
    const punto = escala.aPorcentaje(evento.clientX, evento.clientY);
    if (herramientaDistribucion === 'ninguna') {
      agregarObjeto(tipoObjetoActivo, punto.x, punto.y, colorObjetoActivo);
      return;
    }
    if (!puntoDistribucionA) {
      setPuntoDistribucionA(punto);
      return;
    }
    let puntos: PuntoNormalizado[];
    if (herramientaDistribucion === 'fila') puntos = generarPuntosFila(puntoDistribucionA, punto, nDistribucion);
    else if (herramientaDistribucion === 'slalom') puntos = generarPuntosSlalom(puntoDistribucionA, punto, nDistribucion, ANCHO_CAMPO_M);
    else puntos = generarPuntosRejilla(puntoDistribucionA, punto);
    agregarObjetosMultiples(tipoObjetoActivo, puntos, colorObjetoActivo);
    setPuntoDistribucionA(null);
  }

  /**
   * Toques con la herramienta Movimiento activa. Se hace acierto manual contra
   * las posiciones en vez de poner  en las fichas porque el sensor de
   * dnd-kit llama a preventDefault y los clics nunca llegan a un draggable.
   *
   * Primer toque sobre una ficha: pasa a ser el sujeto. Toques siguientes en el
   * campo: van añadiendo nodos a su recorrido.
   */
  function manejarClicTrayectoria(evento: ReactMouseEvent<HTMLDivElement>): void {
    const punto = escala.aPorcentaje(evento.clientX, evento.clientY);
    const px = escala.aPixeles(punto);
    const cerca = (destino: PuntoNormalizado, radio: number): boolean => {
      const p = escala.aPixeles(destino);
      return Math.hypot(p.x - px.x, p.y - px.y) <= radio;
    };

    const titular = documento.titulares.find((t) => cerca(t, RADIO_TOQUE_FICHA_PX));
    if (titular) {
      setSujetoTrayectoria({ tipo: 'titular', id: titular.jugadorId });
      return;
    }
    const rival = rivalVisible ? documento.rival?.jugadores.find((r) => cerca(r, RADIO_TOQUE_FICHA_PX)) : undefined;
    if (rival) {
      setSujetoTrayectoria({ tipo: 'rival', id: rival.id });
      return;
    }
    const balon = documento.balones.find((b) =>
      cerca(posicionEfectivaBalon(b, documento.titulares), RADIO_TOQUE_BALON_PX),
    );
    if (balon) {
      setSujetoTrayectoria({ tipo: 'balon', id: balon.id });
      return;
    }
    // Los objetos van los últimos: son pequeños y suelen quedar debajo de las
    // fichas, así que tocar un jugador que esté encima de un cono elige al jugador.
    const objeto = documento.objetos.find((o) => cerca(o, RADIO_TOQUE_OBJETO_PX));
    if (objeto) {
      setSujetoTrayectoria({ tipo: 'objeto', id: objeto.id });
      return;
    }

    // Sin sujeto no hay a qué añadir el nodo: el primer toque elige la ficha.
    if (!sujetoTrayectoria) return;

    // Si el toque cae sobre la línea ya dibujada, el nodo se mete EN ESE TRAMO
    // en vez de al final: es la diferencia entre dar forma al recorrido y solo
    // ir alargándolo.
    const insercion = indiceDeInsercion(punto, px);
    agregarNodoTrayectoria(indiceFrameActivo, sujetoTrayectoria.tipo, sujetoTrayectoria.id, punto, insercion);
  }

  /**
   * Devuelve en qué posición de la lista de nodos debe entrar uno nuevo, o
   * `undefined` para añadirlo al final. El acierto se mide en píxeles, no en
   * porcentaje, para que la tolerancia se sienta igual en cualquier zoom.
   */
  function indiceDeInsercion(punto: PuntoNormalizado, px: PuntoNormalizado): number | undefined {
    if (!rutaEnEdicion || !sujetoTrayectoria) return undefined;
    const siguienteFrame = documento.secuencia?.frames[indiceFrameActivo + 1];
    if (!siguienteFrame) return undefined;

    const posicionEn = (frame: typeof siguienteFrame, sujeto: typeof sujetoTrayectoria): PuntoNormalizado | undefined => {
      if (sujeto.tipo === 'titular') return frame.titulares.find((t) => t.jugadorId === sujeto.id);
      if (sujeto.tipo === 'rival') return frame.jugadoresRival.find((r) => r.id === sujeto.id);
      if (sujeto.tipo === 'objeto') return frame.objetos.find((o) => o.id === sujeto.id);
      const balon = frame.balones.find((b) => b.id === sujeto.id);
      return balon ? posicionEfectivaBalon(balon, frame.titulares) : undefined;
    };
    const frameActual = documento.secuencia?.frames[indiceFrameActivo];
    const origen = frameActual ? posicionEn(frameActual, sujetoTrayectoria) : undefined;
    const destino = posicionEn(siguienteFrame, sujetoTrayectoria);
    if (!origen || !destino) return undefined;

    const muestreada = muestrearRuta(
      puntosDeControl(origen, rutaEnEdicion.nodos, destino),
      rutaEnEdicion.interpolacion,
    );
    const cercano = segmentoEnPunto(muestreada, punto);
    if (!cercano) return undefined;
    const enPx = escala.aPixeles(cercano.puntoEnRuta);
    if (Math.hypot(enPx.x - px.x, enPx.y - px.y) > TOLERANCIA_LINEA_PX) return undefined;
    return cercano.indiceSegmento;
  }

  function manejarFinArrastre(evento: DragEndEvent): void {
    const datos = evento.active.data.current as DatosArrastreCampo | undefined;
    if (!datos) return;
    const idDestino = evento.over?.id;
    const dentroDelCampo = idDestino === 'campo' || (typeof idDestino === 'string' && idDestino.startsWith('slot-'));

    function posicionTrasArrastre(basePctX: number, basePctY: number) {
      const basePx = escala.aPixeles({ x: basePctX, y: basePctY });
      const finalPx = { x: basePx.x + evento.delta.x, y: basePx.y + evento.delta.y };
      return pixelesAPorcentaje(finalPx, { ancho: escala.ancho, alto: escala.alto }, orientacion, ventana);
    }

    // "imantar" (FA3): con la cuadrícula activa y el imán encendido, el jugador
    // queda en el centro de la celda más cercana; con el imán apagado (o sin
    // cuadrícula) manda el arrastre libre, sin tocar el punto.
    function snapACeldaSiCorresponde(punto: PuntoNormalizado): PuntoNormalizado {
      const { preset, columnas, filas, imantar } = documento.cuadricula;
      if (!imantar || preset === 'off' || columnas === 0 || filas === 0) return punto;
      const col = Math.min(columnas - 1, Math.max(0, Math.floor((punto.x / 100) * columnas)));
      const fila = Math.min(filas - 1, Math.max(0, Math.floor((punto.y / 100) * filas)));
      return { x: ((col + 0.5) / columnas) * 100, y: ((fila + 0.5) / filas) * 100 };
    }

    if (datos.tipoArrastre === 'objeto') {
      if (!dentroDelCampo) {
        const objetoEliminado = documento.objetos.find((o) => o.id === datos.objetoId);
        if (objetoEliminado) {
          setFantasmasDesvaneciendo((previos) => [...previos, { ...objetoEliminado }]);
          setTimeout(() => {
            setFantasmasDesvaneciendo((previos) => previos.filter((f) => f.id !== objetoEliminado.id));
          }, 300);
        }
        eliminarObjeto(datos.objetoId);
        mostrarToast({
          tipo: 'info',
          mensaje: 'Objeto eliminado.',
          accion: { etiqueta: 'Deshacer', ejecutar: () => useAlineacionStore.getState().deshacer() },
        });
        return;
      }
      const actual = documento.objetos.find((o) => o.id === datos.objetoId);
      if (!actual) return;
      const punto = posicionTrasArrastre(actual.x, actual.y);
      if (altPresionadoRef.current) {
        duplicarObjetoEnPosicion(datos.objetoId, punto.x, punto.y);
      } else {
        moverObjeto(datos.objetoId, punto.x, punto.y);
      }
      return;
    }

    if (datos.tipoArrastre === 'balon') {
      const actual = documento.balones.find((b) => b.id === datos.balonId);
      if (!actual) return;
      if (typeof idDestino === 'string' && idDestino.startsWith('slot-')) {
        anclarBalon(datos.balonId, idDestino.slice('slot-'.length));
        return;
      }
      if (!dentroDelCampo) return;
      const base = posicionEfectivaBalon(actual, documento.titulares);
      const punto = posicionTrasArrastre(base.x, base.y);
      moverBalon(datos.balonId, punto.x, punto.y);
      return;
    }

    if (datos.tipoArrastre === 'rival') {
      if (!dentroDelCampo) return;
      const actual = documento.rival?.jugadores.find((j) => j.id === datos.jugadorRivalId);
      if (!actual) return;
      const punto = posicionTrasArrastre(actual.x, actual.y);
      moverJugadorRival(datos.jugadorRivalId, punto.x, punto.y);
      return;
    }

    if (datos.tipoArrastre === 'nodo') {
      const nodo = rutasDelFrame?.find((t) => t.id === datos.trayectoriaId)?.nodos.find((n) => n.id === datos.nodoId);
      if (!nodo) return;
      const punto = posicionTrasArrastre(nodo.x, nodo.y);
      moverNodoTrayectoria(indiceFrameActivo, datos.trayectoriaId, datos.nodoId, punto.x, punto.y);
      return;
    }

    const { origen, jugadorId } = datos;

    if (idDestino === 'banquillo') {
      if (origen === 'campo') enviarABanquillo(jugadorId);
      return;
    }

    if (typeof idDestino === 'string' && idDestino.startsWith('slot-')) {
      const jugadorDestino = idDestino.slice('slot-'.length);
      if (jugadorDestino === jugadorId) return;
      if (origen === 'campo') intercambiarPosiciones(jugadorId, jugadorDestino);
      else sustituirEnCampo(jugadorDestino, jugadorId);
      return;
    }

    if (idDestino === 'campo') {
      // `evento.active.rect.current.initial` no sirve como punto de partida
      // para las tarjetas del campo: dnd-kit lo mide una sola vez (al montar
      // el draggable) y nuestras tarjetas se reposicionan solo con transform
      // después, sin volver a montarse, así que ese rect queda anclado a la
      // esquina del contenedor en vez de a la posición real de la tarjeta.
      // En su lugar, se parte de la posición ya conocida y siempre correcta
      // (la que usa el propio render, guardada en el documento) y se le suma
      // el delta de arrastre, que sí es fiable.
      let basePx: { x: number; y: number };
      if (origen === 'campo') {
        const titularActual = documento.titulares.find((t) => t.jugadorId === jugadorId);
        if (!titularActual) return;
        basePx = escala.aPixeles({ x: titularActual.x, y: titularActual.y });
      } else {
        const rectInicial = evento.active.rect.current.initial;
        const rectContenedor = escala.contenedorRef.current?.getBoundingClientRect();
        if (!rectInicial || !rectContenedor) return;
        basePx = {
          x: rectInicial.left + rectInicial.width / 2 - rectContenedor.left,
          y: rectInicial.top + rectInicial.height / 2 - rectContenedor.top,
        };
      }
      const puntoFinalPx = { x: basePx.x + evento.delta.x, y: basePx.y + evento.delta.y };
      const puntoCrudo = pixelesAPorcentaje(puntoFinalPx, { ancho: escala.ancho, alto: escala.alto }, orientacion, ventana);
      const punto = snapACeldaSiCorresponde(puntoCrudo);
      if (origen === 'campo') moverJugador(jugadorId, punto.x, punto.y);
      else moverDesdeBanquilloACampo(jugadorId, punto.x, punto.y);
    }
    // soltado fuera del campo: no-op, la tarjeta regresa por transición CSS
  }

  // Derivados de `menu`: solo válidos mientras el menú contextual sigue abierto.
  // `MenuJugador` cierra el menú (setMenu(null)) en el mismo lote de React que
  // dispara la acción elegida, así que cualquier modal que la acción abra
  // (Cambiar por⬦, Nota⬦, Marcar a⬦) ya vería `menu` en null en su primer
  // render. Por eso esos flujos se derivan de su propio id, no de `menu`.
  const jugadorMenu = menu ? obtenerPorId(menu.jugadorId) : undefined;
  const tituarMenu = menu ? documento.titulares.find((t) => t.jugadorId === menu.jugadorId) : undefined;

  const titularCambio = cambioParaId ? documento.titulares.find((t) => t.jugadorId === cambioParaId) : undefined;
  const jugadorCambio = cambioParaId ? obtenerPorId(cambioParaId) : undefined;
  const zonaOrigenCambio = titularCambio?.zonaOrigenId ? formacion?.zonas.find((z) => z.id === titularCambio.zonaOrigenId) : undefined;

  const titularNota = notaParaId ? documento.titulares.find((t) => t.jugadorId === notaParaId) : undefined;
  const jugadorNota = notaParaId ? obtenerPorId(notaParaId) : undefined;

  return (
    <div ref={outerRef} className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <DndContext
        sensors={sensores}
        collisionDetection={detectarColision}
        measuring={CONFIG_MEDICION}
        onDragEnd={(evento) => {
          manejarFinArrastre(evento);
          registrarMovimientoGrabado();
        }}
      >
        <MonitorArrastreJugador onCambio={setArrastreJugadorActivo} />
        <EscalaCampoProvider value={escala}>
          <ZonaCampoDroppable contenedorRef={escala.contenedorRef} ancho={dimensionesCampo.ancho} alto={dimensionesCampo.alto}>
            <LineasCampo
              orientacion={orientacion}
              ref={svgRef}
              tema={documento.cancha.tema}
              mostrarEscudo={documento.cancha.mostrarEscudo}
              mostrarValla={documento.cancha.mostrarValla}
              ventana={ventana}
              rotado180={documento.cancha.rotado180}
              centroOcupado={centroOcupado}
            />

            <CapaCuadricula
              cuadricula={documento.cuadricula}
              orientacion={orientacion}
              interactiva={!modoDibujoActivo && !modoObjetoActivo && documento.cuadricula.preset !== 'off'}
              onPintarCelda={pintarCelda}
            />

            {/*
              Captura clics para colocar objetos (FA1). Solo intercepta punteros
              mientras el modo objeto está activo: si quedara "auto" siempre que
              no se dibuja, esta capa (por encima en el orden del DOM) tapa los
              clics de las zonas fantasma y de las celdas de la cuadrícula, que
              no tienen z-index propio.
            */}
            {modoObjetoActivo && (
              <div
                className="absolute inset-0"
                style={{ zIndex: 3, cursor: 'crosshair' }}
                onClick={manejarClicColocacion}
              />
            )}

            {propioVisible &&
              zonasVacias.map((zona, indice) => (
                <Zona key={zona.id} zona={zona} indice={indice} deshabilitada={interaccionBloqueada} onSeleccionar={() => setZonaActiva(zona)} />
              ))}

            {rivalVisible &&
              rivalZonasVacias.map((zona, indice) => (
                <ZonaRival
                  key={zona.id}
                  zona={zona}
                  indice={indice}
                  deshabilitada={interaccionBloqueada}
                  onSeleccionar={() => setZonaRivalActiva(zona)}
                />
              ))}

            {!enAnimacion &&
              documento.objetos.map((objeto) => (
              <ObjetoCampoDraggable
                key={objeto.id}
                objeto={objeto}
                seleccionado={objetoSeleccionadoId === objeto.id}
                deshabilitado={interaccionBloqueada}
                onSeleccionar={() => setObjetoSeleccionadoId(objeto.id)}
                onRotar={(rotacion) => rotarObjeto(objeto.id, rotacion)}
                onDuplicar={() => duplicarObjeto(objeto.id)}
              />
            ))}

            {fantasmasDesvaneciendo.map((fantasma) => {
              const punto = escala.aPixeles({ x: fantasma.x, y: fantasma.y });
              return (
                <div
                  key={`fantasma-${fantasma.id}`}
                  className="pointer-events-none absolute animar-salida-objeto"
                  style={{ left: punto.x, top: punto.y, transform: 'translate(-50%, -50%)', zIndex: 5 }}
                  aria-hidden="true"
                >
                  <IconoObjeto tipo={fantasma.tipo} color={COLORES_OBJETO[fantasma.color]} rotacion={fantasma.rotacion} />
                </div>
              );
            })}

            {!enAnimacion &&
              documento.balones.map((balon) => {
              const propietario = balon.jugadorPoseedorId ? documento.titulares.find((t) => t.jugadorId === balon.jugadorPoseedorId) : undefined;
              const { x: xPct, y: yPct } = posicionEfectivaBalon(balon, documento.titulares);
              const deltaExterno =
                propietario && arrastreJugadorActivo?.jugadorId === propietario.jugadorId ? arrastreJugadorActivo.delta : undefined;
              return (
                <BalonDraggable
                  key={balon.id}
                  balon={balon}
                  xPct={xPct}
                  yPct={yPct}
                  deltaExterno={deltaExterno}
                  deshabilitado={interaccionBloqueada}
                  onDevolverCentro={() => devolverBalonCentro(balon.id)}
                  onLiberar={() => liberarBalon(balon.id)}
                  onMenuContextual={(x, y) => setMenuBalon({ balonId: balon.id, x, y })}
                />
              );
            })}

            {documento.rival && !enAnimacion && (
              <CapaMarcajes
                marcajes={documento.marcajes}
                titulares={documento.titulares}
                jugadoresRival={documento.rival.jugadores}
                onEliminar={eliminarMarcaje}
              />
            )}

            {rivalVisible &&
              documento.rival!.jugadores.map((jugadorRival) => (
                <TarjetaRivalDraggable
                  key={jugadorRival.id}
                  jugador={jugadorRival}
                  paleta={documento.rival!.paleta}
                  atenuado={documento.titulares.some((t) => Math.abs(t.x - jugadorRival.x) < 3 && Math.abs(t.y - jugadorRival.y) < 3)}
                  deshabilitado={interaccionBloqueada}
                  onMenuContextual={(jugadorRivalId, x, y) => setMenuRival({ jugadorRivalId, x, y })}
                />
              ))}

            {propioVisible &&
              documento.titulares.map((titular) => {
                const jugador = obtenerPorId(titular.jugadorId);
                if (!jugador) return null;
                return (
                  <DraggableJugador
                    key={titular.jugadorId}
                    jugador={jugador}
                    origen="campo"
                    xPct={titular.x}
                    yPct={titular.y}
                    esCapitan={titular.esCapitan}
                    nota={titular.nota}
                    tamano={enModoAmbos ? 'compacto' : 'md'}
                    esSlotDestino
                    deshabilitado={interaccionBloqueada}
                    onMenuContextual={interaccionBloqueada ? undefined : (id, x, y) => setMenu({ jugadorId: id, x, y })}
                  />
                );
              })}

            {/*
              Captura de toques de la herramienta Movimiento. Va POR ENCIMA de
              las fichas (zIndex 20) para recibir el toque antes que ellas: los
              draggables se comen los clics, así que el acierto se hace a mano.
            */}
            {modoTrayectoriaActivo && !enAnimacion && (
              <div
                className="absolute inset-0"
                style={{ zIndex: 20, cursor: 'crosshair' }}
                onClick={manejarClicTrayectoria}
              />
            )}

            {/* Los nodos solo se ven mientras se edita esa trayectoria (§6). */}
            {modoTrayectoriaActivo &&
              !enAnimacion &&
              rutaEnEdicion?.mostrarNodos !== false &&
              rutaEnEdicion?.nodos.map((nodo, indice) => (
                <NodoRutaDraggable
                  key={nodo.id}
                  nodo={nodo}
                  trayectoriaId={rutaEnEdicion.id}
                  indice={indice}
                  color={sujetoTrayectoria?.tipo === 'balon' ? '#D4111E' : '#FFFFFF'}
                  onEliminar={() => eliminarNodoTrayectoria(indiceFrameActivo, rutaEnEdicion.id, nodo.id)}
                />
              ))}

            <CapaTrayectorias />

            {enAnimacion && <CapaReproduccion />}

            <CapaDibujo ref={canvasRef} trazosMostrados={frameMostrado?.trazos} />
          </ZonaCampoDroppable>

          {menu && jugadorMenu && (
            <MenuJugador
              x={menu.x}
              y={menu.y}
              onCerrar={() => setMenu(null)}
              acciones={[
                { etiqueta: 'Quitar del campo', onSeleccionar: () => quitarDelCampo(menu.jugadorId), peligro: true },
                { etiqueta: 'Cambiar por⬦', onSeleccionar: () => setCambioParaId(menu.jugadorId) },
                { etiqueta: 'Enviar al banquillo', onSeleccionar: () => enviarABanquillo(menu.jugadorId) },
                {
                  etiqueta: tituarMenu?.esCapitan ? 'Quitar brazalete de capitán' : 'Nombrar capitán',
                  onSeleccionar: () => toggleCapitan(menu.jugadorId),
                },
                { etiqueta: tituarMenu?.nota ? 'Editar nota⬦' : 'Añadir nota⬦', onSeleccionar: () => setNotaParaId(menu.jugadorId) },
                ...(documento.rival && documento.rival.jugadores.length > 0
                  ? [{ etiqueta: 'Marcar a⬦', onSeleccionar: () => setMarcandoDesdeId(menu.jugadorId) }]
                  : []),
              ]}
            />
          )}

          {menuBalon && (
            <MenuJugador
              x={menuBalon.x}
              y={menuBalon.y}
              onCerrar={() => setMenuBalon(null)}
              acciones={[
                ...(documento.balones.find((b) => b.id === menuBalon.balonId)?.jugadorPoseedorId
                  ? [{ etiqueta: 'Liberar del jugador', onSeleccionar: () => liberarBalon(menuBalon.balonId) }]
                  : []),
                { etiqueta: 'Devolver al centro', onSeleccionar: () => devolverBalonCentro(menuBalon.balonId) },
                { etiqueta: 'Eliminar balón', onSeleccionar: () => eliminarBalon(menuBalon.balonId), peligro: true },
              ]}
            />
          )}

          {menuRival && (
            <MenuJugador
              x={menuRival.x}
              y={menuRival.y}
              onCerrar={() => setMenuRival(null)}
              acciones={[{ etiqueta: 'Quitar del campo', onSeleccionar: () => eliminarJugadorRival(menuRival.jugadorRivalId), peligro: true }]}
            />
          )}

          <ModalNotaJugador
            abierto={notaParaId !== null}
            nombreJugador={jugadorNota?.apellido ?? ''}
            notaActual={titularNota?.nota ?? ''}
            onGuardar={(nota) => {
              if (notaParaId) actualizarNotaJugador(notaParaId, nota);
            }}
            onCerrar={() => setNotaParaId(null)}
          />

          <SelectorJugador
            abierto={zonaActiva !== null}
            posicionSugerida={zonaActiva?.posicion ?? null}
            onCerrar={() => setZonaActiva(null)}
            onSeleccionarJugador={(jugadorId) => {
              if (zonaActiva) asignarJugador(zonaActiva.id, zonaActiva.x, zonaActiva.y, jugadorId);
            }}
            onCrearPersonalizado={() => setZonaParaPersonalizado(zonaActiva)}
          />

          <ModalJugadorPersonalizado
            abierto={zonaParaPersonalizado !== null}
            posicionSugerida={zonaParaPersonalizado?.posicion ?? null}
            onCerrar={() => setZonaParaPersonalizado(null)}
            onCrear={(jugador) => {
              agregarJugadorPersonalizado(jugador);
              if (zonaParaPersonalizado) {
                asignarJugador(zonaParaPersonalizado.id, zonaParaPersonalizado.x, zonaParaPersonalizado.y, jugador.id);
              }
            }}
          />

          <SelectorJugador
            abierto={cambioParaId !== null}
            titulo="Cambiar por⬦"
            posicionSugerida={zonaOrigenCambio?.posicion ?? jugadorCambio?.posicionNatural ?? null}
            onCerrar={() => setCambioParaId(null)}
            onSeleccionarJugador={(entranteId) => {
              if (cambioParaId) sustituirEnCampo(cambioParaId, entranteId);
            }}
          />

          <ModalAgregarRival
            abierto={zonaRivalActiva !== null}
            posicion={zonaRivalActiva?.posicion ?? null}
            onCerrar={() => setZonaRivalActiva(null)}
            onAgregar={(dorsal, apellido) => {
              if (zonaRivalActiva) {
                asignarJugadorRivalAZona(
                  zonaRivalActiva.id,
                  zonaRivalActiva.x,
                  zonaRivalActiva.y,
                  zonaRivalActiva.posicion as Posicion,
                  dorsal,
                  apellido,
                );
              }
            }}
          />

          <ModalElegirRivalParaMarcar
            abierto={marcandoDesdeId !== null}
            jugadoresRival={documento.rival?.jugadores ?? []}
            onCerrar={() => setMarcandoDesdeId(null)}
            onElegir={(jugadorRivalId) => {
              if (marcandoDesdeId) agregarMarcaje(marcandoDesdeId, jugadorRivalId);
            }}
          />

          <DrawerPlantilla />
        </EscalaCampoProvider>
      </DndContext>
    </div>
  );
});
