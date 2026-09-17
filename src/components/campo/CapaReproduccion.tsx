import { useEffect, useRef } from 'react';
import { useEscalaCampo } from '../../hooks/useCampoEscala';
import { dibujarTrazo } from '../../utils/renderTrazos';
import { useAlineacionStore } from '../../store/alineacionStore';
import { usePlantillaStore } from '../../store/plantillaStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { TarjetaJugador } from '../jugador/TarjetaJugador';
import { IconoObjeto } from './IconoObjeto';
import { COLORES_OBJETO, DIAMETRO_BALON_PX, PALETA_RIVAL } from '../../utils/constantes';
import {
  duracionDeFrame,
  duracionTotal,
  EASING_POR_DEFECTO,
  interpolarPorId,
  suavizar,
  ubicacionEnTiempo,
} from '../../utils/interpolacion';
import { posicionEfectivaBalon } from '../../utils/balon';
import {
  anguloEnGrados,
  aplicarRutas,
  avanceDeRuta,
  identificadorDe,
  muestrearRuta,
  puntosDeControl,
  puntosTangente,
  recorridoHasta,
  tipoDeTrayectoria,
  trayectoriaDe,
} from '../../utils/trayectorias';
import type { Balon, FrameTactico, PuntoNormalizado, TipoDestinoRuta } from '../../types';

const COLOR_ESTELA = '#FFFFFF';
const COLOR_ESTELA_BALON = '#D4111E';

/** Dónde está un actor cualquiera dentro de un frame. */
function posicionDeActor(frame: FrameTactico, tipo: TipoDestinoRuta, id: string): PuntoNormalizado | undefined {
  if (tipo === 'titular') return frame.titulares.find((j) => j.jugadorId === id);
  if (tipo === 'rival') return frame.jugadoresRival.find((r) => r.id === id);
  if (tipo === 'objeto') return frame.objetos.find((o) => o.id === id);
  const balon = frame.balones.find((b) => b.id === id);
  return balon ? posicionEfectivaBalon(balon, frame.titulares) : undefined;
}

/**
 * Resuelve dónde está cada balón de un frame. Un balón anclado no guarda su
 * posición sino la de su poseedor, así que hay que fijarla ANTES de interpolar:
 * de lo contrario un pase se vería como un balón inmóvil en su última posición
 * suelta. Al resolverlo en el frame de origen y en el de destino, un balón que
 * cambia de dueño entre frames viaja en línea recta de un jugador al otro.
 */
function balonesResueltos(frame: FrameTactico): Balon[] {
  return frame.balones.map((balon) => ({ ...balon, ...posicionEfectivaBalon(balon, frame.titulares) }));
}

/**
 * Dibuja la jugada en movimiento. Se monta solo mientras se reproduce, y sustituye
 * a las fichas interactivas (que quedan ocultas) para que nada se pueda arrastrar
 * por accidente a mitad de una reproducción.
 *
 * El progreso se lleva con requestAnimationFrame en estado LOCAL: el store de la
 * alineación no se toca en ningún fotograma. Solo se avisa al store de
 * reproducción al cruzar de un frame al siguiente, es decir ~1 vez por segundo.
 */
export function CapaReproduccion() {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const paletaRival = useAlineacionStore((s) => s.historial.presente.rival?.paleta ?? 'blanco');
  const irAFrame = useAlineacionStore((s) => s.irAFrame);
  const obtenerPorId = usePlantillaStore((s) => s.obtenerPorId);
  const { aPixeles, ancho, alto } = useEscalaCampo();

  const reproduciendo = useReproduccionStore((s) => s.reproduciendo);
  const velocidad = useReproduccionStore((s) => s.velocidad);
  const indiceFrame = useReproduccionStore((s) => s.indiceFrame);
  const tiempoMs = useReproduccionStore((s) => s.tiempoMs);
  const setIndiceFrame = useReproduccionStore((s) => s.setIndiceFrame);
  const pausar = useReproduccionStore((s) => s.pausar);

  const rafRef = useRef<number | null>(null);
  const estelaRef = useRef<HTMLCanvasElement | null>(null);

  const frames = secuencia?.frames ?? [];
  const total = duracionTotal(frames);
  // La posición manda sobre el índice: de un instante salen la fase y el avance
  // dentro de ella. Es lo que hace que arrastrar la barra a mitad de una
  // transición muestre exactamente ese punto y no la fase más cercana.
  const { indice, progreso } = ubicacionEnTiempo(frames, tiempoMs);
  const actual = frames[indice];
  const siguiente = frames[indice + 1];

  // El resto de la interfaz (chips, controles) sigue al índice; se avisa solo
  // al cruzar de fase, no en cada fotograma.
  useEffect(() => {
    if (indice !== indiceFrame) setIndiceFrame(indice);
  }, [indice, indiceFrame, setIndiceFrame]);

  useEffect(() => {
    if (!reproduciendo) return;
    // El bucle lee y escribe el reloj con getState() en vez de depender de
    // `tiempoMs`: si estuviera en las dependencias, el efecto se recrearía 60
    // veces por segundo y la animación se reiniciaría sin parar.
    let anterior: number | null = null;
    function paso(ahora: number): void {
      if (anterior === null) anterior = ahora;
      const avance = (ahora - anterior) * velocidad;
      anterior = ahora;
      const siguienteMs = useReproduccionStore.getState().tiempoMs + avance;
      if (siguienteMs >= total) {
        // Fin de la jugada: se descansa en la última fase y el tablero se queda
        // ahí, o al desmontarse esta capa se vería saltar al frame de partida.
        useReproduccionStore.getState().setTiempoMs(total);
        pausar();
        irAFrame(Math.max(0, frames.length - 1));
        return;
      }
      useReproduccionStore.getState().setTiempoMs(siguienteMs);
      rafRef.current = requestAnimationFrame(paso);
    }
    rafRef.current = requestAnimationFrame(paso);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [reproduciendo, velocidad, total, frames.length, pausar, irAFrame]);

  if (!actual) return null;

  const easing = secuencia?.easing ?? EASING_POR_DEFECTO;
  const curva = (x: number) => suavizar(x, easing);
  const t = siguiente ? curva(progreso) : 0;
  // Cada ruta puede tener su propia duración dentro del tramo, así que se le
  // pasa el avance SIN curva y ella aplica la suya sobre su propio reloj.
  const avance = { progresoLineal: siguiente ? progreso : 0, duracionTramoMs: duracionDeFrame(actual), curva };
  const frameActual: FrameTactico = actual;
  const destino: FrameTactico = siguiente ?? actual;

  // La recta es el caso por defecto; `aplicarRutas` sustituye la posición solo
  // en las fichas que tienen un recorrido por nodos definido para este tramo.
  const rutas = actual.trayectorias;
  const balonesDesde = balonesResueltos(actual);
  const balonesHasta = balonesResueltos(destino);

  const titulares = aplicarRutas(
    interpolarPorId(actual.titulares, destino.titulares, (j) => j.jugadorId, t),
    actual.titulares,
    destino.titulares,
    (j) => j.jugadorId,
    rutas,
    'titular',
    avance,
  );
  const rivales = aplicarRutas(
    interpolarPorId(actual.jugadoresRival, destino.jugadoresRival, (j) => j.id, t),
    actual.jugadoresRival,
    destino.jugadoresRival,
    (j) => j.id,
    rutas,
    'rival',
    avance,
  );
  const balones = aplicarRutas(
    interpolarPorId(balonesDesde, balonesHasta, (b) => b.id, t),
    balonesDesde,
    balonesHasta,
    (b) => b.id,
    rutas,
    'balon',
    avance,
  );
  const objetos = aplicarRutas(
    interpolarPorId(actual.objetos, destino.objetos, (o) => o.id, t),
    actual.objetos,
    destino.objetos,
    (o) => o.id,
    rutas,
    'objeto',
    avance,
  );

  /**
   * Hacia dónde mira un titular. El ángulo se calcula sobre los puntos YA
   * convertidos a píxeles: el campo intercambia ejes según su orientación, así
   * que un ángulo sacado de las coordenadas normalizadas apuntaría mal en
   * horizontal.
   */
  function orientacionDe(jugadorId: string): number | undefined {
    const ruta = trayectoriaDe(rutas, 'titular', jugadorId);
    const origen = frameActual.titulares.find((j) => j.jugadorId === jugadorId);
    if (ruta?.orientacion !== 'seguir-ruta' || !origen) {
      // 'manual': se respeta la rotación guardada, si la hay.
      return origen?.rotacion;
    }
    const llegada = destino.titulares.find((j) => j.jugadorId === jugadorId);
    if (!llegada) return origen.rotacion;

    const muestreada = muestrearRuta(puntosDeControl(origen, ruta.nodos, llegada), ruta.interpolacion);
    if (muestreada.longitud === 0) return origen.rotacion;
    const [antes, despues] = puntosTangente(muestreada, avanceDeRuta(ruta, avance));
    return anguloEnGrados(aPixeles(antes), aPixeles(despues)) ?? origen.rotacion;
  }

  const estiloEn = (x: number, y: number, zIndex: number) => {
    const punto = aPixeles({ x, y });
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      transform: `translate3d(${punto.x}px, ${punto.y}px, 0) translate(-50%, -50%)`,
      zIndex,
      pointerEvents: 'none' as const,
    };
  };

  const colores = PALETA_RIVAL[paletaRival];

  /**
   * Estela: el trozo de ruta ya recorrido, dibujado detrás del actor. Es solo
   * un efecto visual — no participa en el cálculo de ninguna posición.
   *
   * Se pinta aquí y no en `CapaTrayectorias` porque esa capa se apaga durante
   * la reproducción, que es justo cuando la estela tiene sentido. Va en canvas y
   * no en DOM: se redibuja en cada fotograma y crear nodos sería carísimo.
   */
  function pintarEstelas(canvas: HTMLCanvasElement | null): void {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(ancho * dpr)) {
      canvas.width = Math.max(1, Math.round(ancho * dpr));
      canvas.height = Math.max(1, Math.round(alto * dpr));
      canvas.style.width = `${ancho}px`;
      canvas.style.height = `${alto}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    if (!siguiente || !rutas) return;

    for (const ruta of rutas) {
      if (!ruta.mostrarEstela || ruta.nodos.length === 0) continue;
      const tipo = tipoDeTrayectoria(ruta);
      const id = tipo ? identificadorDe(ruta, tipo) : undefined;
      if (!tipo || !id) continue;

      const origen = posicionDeActor(frameActual, tipo, id);
      const llegada = posicionDeActor(destino, tipo, id);
      if (!origen || !llegada) continue;

      const muestreada = muestrearRuta(puntosDeControl(origen, ruta.nodos, llegada), ruta.interpolacion);
      const trozo = recorridoHasta(muestreada, avanceDeRuta(ruta, avance));
      if (trozo.length < 2) continue;

      ctx.globalAlpha = 0.4;
      dibujarTrazo(
        ctx,
        { id: 'estela', tipo: 'libre', puntos: trozo, color: tipo === 'balon' ? COLOR_ESTELA_BALON : COLOR_ESTELA, grosor: 2 },
        aPixeles,
      );
      ctx.globalAlpha = 1;
    }
  }

  return (
    <>
      <canvas
        ref={(nodo) => {
          estelaRef.current = nodo;
          pintarEstelas(nodo);
        }}
        className="pointer-events-none absolute inset-0"
        style={{ zIndex: 4 }}
        aria-hidden="true"
      />

      {objetos.map((objeto) => (
        <div key={objeto.id} style={estiloEn(objeto.x, objeto.y, 5)}>
          <IconoObjeto tipo={objeto.tipo} color={COLORES_OBJETO[objeto.color]} rotacion={objeto.rotacion} />
        </div>
      ))}

      {balones.map((balon) => (
        <div key={balon.id} style={estiloEn(balon.x, balon.y, 11)}>
          <svg
            width={DIAMETRO_BALON_PX}
            height={DIAMETRO_BALON_PX * 1.35}
            viewBox="0 0 24 32"
            className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
            aria-hidden="true"
          >
            <ellipse cx="12" cy="27" rx="7" ry="2.4" fill="#000000" opacity="0.35" />
            <circle cx="12" cy="12" r="10" fill="#F5F5F5" stroke="#111111" strokeWidth="0.75" />
            <polygon points="12,6 15,8.3 14,11.8 10,11.8 9,8.3" fill="#111111" />
            <path d="M12 6 L9.5 4 M12 6 L14.5 4 M10 11.8 L7 13 M14 11.8 L17 13 M9 8.3 L5.5 8" stroke="#111111" strokeWidth="0.6" fill="none" />
          </svg>
        </div>
      ))}

      {rivales.map((rival) => (
        <div key={rival.id} style={estiloEn(rival.x, rival.y, 8)}>
          <div className="sin-seleccion flex flex-col items-center gap-0.5" style={{ width: 54 + 16 }}>
            <div
              className="relative flex items-center justify-center rounded-full border-2 border-black/30 font-display font-extrabold shadow-tarjeta"
              style={{ width: 54, height: 54, background: colores.principal, color: colores.texto, fontSize: 54 * 0.32 }}
            >
              {rival.dorsal}
            </div>
          </div>
        </div>
      ))}

      {titulares.map((titular) => {
        const jugador = obtenerPorId(titular.jugadorId);
        if (!jugador) return null;
        return (
          <div key={titular.jugadorId} style={estiloEn(titular.x, titular.y, 10)}>
            <TarjetaJugador
              jugador={jugador}
              tamano="md"
              esCapitan={titular.esCapitan}
              rotacion={orientacionDe(titular.jugadorId)}
            />
          </div>
        );
      })}
    </>
  );
}
