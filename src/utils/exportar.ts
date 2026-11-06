import { COLOR, GROSOR, OPACIDAD, SOMBRA_FICHA_OFFSET_PX } from '../tokens';
import type { Alineacion, Balon, Formacion, Jugador, JugadorEnCampo, JugadorRival, ObjetoCampo, Orientacion, PaletaRival } from '../types';
import { posicionEfectivaBalon } from './balon';
import { COLORES_OBJETO, DIAMETRO_BALON_PX, PALETA_RIVAL } from './constantes';
import { porcentajeAPixeles } from './coordenadas';
import { obtenerIniciales } from './jugador';

const ESCALA_EXPORTACION = 2;
const ALTO_ENCABEZADO = 56;
/**
 * El PDF lleva la imagen en JPEG: un PNG lo guarda jsPDF descomprimido (unos
 * 11 MB por página) y el JPEG va tal cual (unos 150 KB, para WhatsApp). A esta
 * calidad no se distingue del PNG ni en los textos ni en las líneas.
 */
const CALIDAD_JPEG_PDF = 0.92;
/**
 * La ficha propia sale con radio 20 en el PNG y mide 32 en pantalla ('md').
 * Objetos, rivales y balón se reducen en la misma proporción para que
 * conserven el tamaño relativo que tienen en pantalla.
 */
const ESCALA_FICHAS = 20 / 32;
/** La misma tipografía condensada de la interfaz (CLAUDE.md), con respaldo si no llegó a cargar. */
const FUENTE = '"Barlow Condensed", "Arial Narrow", sans-serif';
const PESOS_FUENTE = ['500', '600', '700', '800'];
/** El `bg-amber-400` de la insignia de capitán en `TarjetaJugador`. */
const AMBAR_CAPITAN = '#FBBF24';

/**
 * El lienzo no espera a las fuentes web: si un peso aún no se ha usado en
 * pantalla, el texto saldría en la fuente de respaldo. Se piden todos antes de
 * dibujar; si no hay red, la exportación sigue con el respaldo.
 */
async function cargarFuentes(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all(PESOS_FUENTE.map((peso) => document.fonts.load(`${peso} 16px "Barlow Condensed"`))).catch(() => undefined);
}

export interface DatosExportacion {
  alineacion: Alineacion;
  formacion: Formacion | undefined;
  obtenerJugador: (id: string) => Jugador | undefined;
  svgCampo: SVGSVGElement;
  canvasDibujo: HTMLCanvasElement | null;
  anchoContenedor: number;
  altoContenedor: number;
  orientacion: Orientacion;
  nombreClub?: string;
  /** Dibujar la foto de cada jugador en su ficha. Por defecto, no. */
  incluirFotos?: boolean;
  /** Capas que el entrenador desmarcó en la ventana de exportar. Sin indicar, salen todas. */
  incluir?: Partial<Record<CapaOpcional, boolean>>;
}

/** Lo que el entrenador puede quitar de la imagen. Solo afecta a PNG y PDF: el JSON lleva todo. */
export type CapaOpcional = 'rival' | 'balon' | 'objetos' | 'dibujos';

type ContenidoCampo = Pick<Alineacion, 'rival' | 'balones' | 'objetos' | 'trazos' | 'titulares' | 'marcajes'>;

/** Misma visibilidad que en pantalla (Campo.tsx): qué equipos se ven según el modo del rival. */
function equiposVisibles(rival: Alineacion['rival']): { rival: boolean; propio: boolean } {
  return {
    rival: Boolean(rival?.visible) && rival?.modoVista !== 'solo_nosotros',
    propio: rival?.modoVista !== 'solo_rival',
  };
}

/** Las capas que saldrían en la imagen: la ventana de exportar solo ofrece casilla para estas. */
export function capasEnCampo(contenido: ContenidoCampo): Record<CapaOpcional, boolean> {
  return {
    rival: equiposVisibles(contenido.rival).rival && (contenido.rival?.jugadores.length ?? 0) > 0,
    balon: contenido.balones.length > 0,
    objetos: contenido.objetos.length > 0,
    dibujos: contenido.trazos.length > 0,
  };
}

/** Qué se dibuja en la imagen: lo visible en pantalla menos las capas desmarcadas. */
export function elementosAExportar(contenido: ContenidoCampo, incluir: Partial<Record<CapaOpcional, boolean>> = {}) {
  const con = (capa: CapaOpcional) => incluir[capa] !== false;
  const visibles = equiposVisibles(contenido.rival);
  const rivales = con('rival') && visibles.rival ? (contenido.rival?.jugadores ?? []) : [];
  const titulares = visibles.propio ? contenido.titulares : [];
  return {
    objetos: con('objetos') ? contenido.objetos : [],
    balonesSueltos: con('balon') ? contenido.balones.filter((b) => !b.jugadorPoseedorId) : [],
    rivales,
    titulares,
    balonesEnPosesion: con('balon') ? contenido.balones.filter((b) => b.jugadorPoseedorId) : [],
    dibujos: con('dibujos'),
    // Las líneas de CapaMarcajes, pero solo las que tienen sus dos jugadores en la imagen.
    marcajes: contenido.marcajes.flatMap((marcaje) => {
      const propio = titulares.find((t) => t.jugadorId === marcaje.jugadorPropioId);
      const rival = rivales.find((r) => r.id === marcaje.jugadorRivalId);
      return propio && rival ? [{ propio, rival }] : [];
    }),
  };
}

/**
 * Carga una foto para poder dibujarla en el lienzo.
 *
 * `crossOrigin` es obligatorio: sin él el navegador marca el canvas como
 * "contaminado" y `toBlob()` falla, con lo que se rompería la exportación
 * ENTERA, no solo las fotos. Los enlaces firmados de Supabase responden con
 * `access-control-allow-origin: *`, así que la petición es legítima.
 *
 * Una foto que no carga devuelve null y esa ficha cae a su respaldo: nunca
 * debe impedir que el entrenador se lleve su alineación.
 */
function cargarFoto(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const imagen = new Image();
    imagen.crossOrigin = 'anonymous';
    imagen.onload = () => resolve(imagen);
    imagen.onerror = () => resolve(null);
    imagen.src = url;
  });
}

function svgAImagen(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const cadena = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([cadena], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolve(imagen);
    };
    imagen.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    imagen.src = url;
  });
}

function dibujarJugadorEnLienzo(
  ctx: CanvasRenderingContext2D,
  jugador: Jugador,
  titular: JugadorEnCampo,
  ancho: number,
  alto: number,
  offsetY: number,
  orientacion: Orientacion,
  foto?: HTMLImageElement,
): void {
  const punto = porcentajeAPixeles({ x: titular.x, y: titular.y }, { ancho, alto }, orientacion);
  const cx = punto.x;
  const cy = punto.y + offsetY;
  const radio = 20;

  // Esta función es el espejo en canvas de `TarjetaJugador`. Si cambia una,
  // tiene que cambiar la otra: si no, el PNG deja de ser lo que se ve en
  // pantalla, que es un criterio explícito del rediseño.

  // Sombra simulada: círculo negro desplazado, dibujado ANTES que la ficha.
  ctx.beginPath();
  ctx.arc(cx + SOMBRA_FICHA_OFFSET_PX, cy + SOMBRA_FICHA_OFFSET_PX, radio, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.sombra;
  ctx.globalAlpha = OPACIDAD.sombraFicha;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Ficha: con foto recortada en círculo, o relleno plano si no la hay.
  if (foto) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(foto, cx - radio, cy - radio, radio * 2, radio * 2);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.marca.rojoFicha;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.lineWidth = GROSOR.bordeFicha;
  ctx.strokeStyle = COLOR.campo.linea;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Sin foto, las iniciales en el centro, con la misma proporción que en pantalla.
  if (!foto) {
    ctx.fillStyle = COLOR.campo.linea;
    ctx.font = `800 ${radio * 2 * 0.32}px ${FUENTE}`;
    ctx.fillText(obtenerIniciales(jugador), cx, cy);
  }
  // El dorsal, con o sin foto, en su chapa arriba a la izquierda, como en pantalla.
  if (jugador.dorsal != null) {
    const bx = cx - radio * 0.78;
    const by = cy - radio * 0.78;
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, Math.PI * 2);
    ctx.fillStyle = COLOR.superficie.fondo;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLOR.campo.linea;
    ctx.stroke();
    ctx.fillStyle = COLOR.campo.linea;
    ctx.font = `700 11px ${FUENTE}`;
    ctx.fillText(String(jugador.dorsal), bx, by);
  }
  // La insignia de capitán, en su chapa arriba a la derecha, como en pantalla.
  if (titular.esCapitan) {
    const bx = cx + radio * 0.78;
    const by = cy - radio * 0.78;
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, Math.PI * 2);
    ctx.fillStyle = AMBAR_CAPITAN;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke();
    ctx.fillStyle = COLOR.superficie.fondo;
    ctx.font = `800 10px ${FUENTE}`;
    ctx.fillText('C', bx, by);
  }
  ctx.fillStyle = COLOR.campo.linea;

  // Apellido sobre el césped, sin recuadro.
  ctx.font = `600 11px ${FUENTE}`;
  ctx.fillText(jugador.apellido.toUpperCase(), cx, cy + radio + 10);

  // Y debajo, las posiciones en el color de etiqueta secundaria.
  const posiciones = [jugador.posicionNatural, jugador.posicionesSecundarias[0]].filter(Boolean).join(' · ');
  if (posiciones) {
    ctx.fillStyle = COLOR.campo.etiquetaSecundaria;
    ctx.font = `600 9px ${FUENTE}`;
    ctx.fillText(posiciones, cx, cy + radio + 21);
  }
}

/** La línea de `CapaMarcajes`: de centro a centro, roja y discontinua. */
function dibujarMarcajeEnLienzo(ctx: CanvasRenderingContext2D, desde: { cx: number; cy: number }, hasta: { cx: number; cy: number }): void {
  ctx.save();
  ctx.strokeStyle = COLOR.marca.rojo;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(desde.cx, desde.cy);
  ctx.lineTo(hasta.cx, hasta.cy);
  ctx.stroke();
  ctx.restore();
}

/** Equivale al `drop-shadow` de los SVG en pantalla. Las sombras del lienzo no siguen su escala, por eso se multiplican. */
function conSombra(ctx: CanvasRenderingContext2D, desplazamiento: number, desenfoque: number, opacidad: number, dibujar: () => void): void {
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${opacidad})`;
  ctx.shadowOffsetY = desplazamiento * ESCALA_EXPORTACION;
  ctx.shadowBlur = desenfoque * ESCALA_EXPORTACION;
  dibujar();
  ctx.restore();
}

/**
 * Espejo en canvas de `IconoObjeto`: mismas figuras en su caja de 32×32,
 * centradas en el punto del objeto y giradas como en pantalla.
 */
function dibujarObjetoEnLienzo(ctx: CanvasRenderingContext2D, objeto: ObjetoCampo, cx: number, cy: number): void {
  const color = COLORES_OBJETO[objeto.color];
  const trazo = '#00000066';
  const lado = 28 * ESCALA_FICHAS;
  const rellenar = (figura: Path2D) => {
    ctx.fillStyle = color;
    ctx.fill(figura);
    ctx.strokeStyle = trazo;
    ctx.lineWidth = 1;
    ctx.stroke(figura);
  };
  const trazar = (figura: Path2D, grosor: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    ctx.stroke(figura);
  };
  const elipse = (x: number, y: number, rx: number, ry: number) => {
    const figura = new Path2D();
    figura.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    return figura;
  };

  conSombra(ctx, 2, 3, 0.5, () => {
    ctx.translate(cx, cy);
    ctx.rotate((objeto.rotacion * Math.PI) / 180);
    ctx.scale(lado / 32, lado / 32);
    ctx.translate(-16, -16);
    switch (objeto.tipo) {
      case 'cono':
        rellenar(new Path2D('M16 4 L26 28 L6 28 Z'));
        break;
      case 'cono_plano':
        rellenar(elipse(16, 18, 12, 6));
        break;
      case 'pica':
        rellenar(elipse(16, 28, 7, 2.5));
        rellenar(new Path2D('M14.5 3 H17.5 V28 H14.5 Z'));
        break;
      case 'escalera':
        trazar(new Path2D('M4 6 H28 V26 H4 Z M4 12 H28 M4 18 H28 M4 24 H28'), 2.5);
        break;
      case 'mini_porteria':
        trazar(new Path2D('M4 28 V6 H28 V28'), 2.5);
        ctx.globalAlpha = 0.6;
        trazar(new Path2D('M6 8 L11 12 M12 8 L17 12 M18 8 L23 12 M24 8 L26 10'), 1);
        break;
      case 'aro':
        trazar(elipse(16, 16, 12, 12), 4);
        break;
      case 'maniqui':
        rellenar(elipse(16, 7, 5, 5));
        rellenar(new Path2D('M8 30 L10 14 Q16 10 22 14 L24 30 Z'));
        break;
    }
  });
}

/** Rectángulo de esquinas redondas por completo, con arcos: `roundRect` no existe en Safari antiguo. */
function trazarPastilla(ctx: CanvasRenderingContext2D, cx: number, cy: number, ancho: number, alto: number): void {
  const r = alto / 2;
  ctx.beginPath();
  ctx.arc(cx - ancho / 2 + r, cy, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.arc(cx + ancho / 2 - r, cy, r, (Math.PI * 3) / 2, Math.PI / 2);
  ctx.closePath();
}

/** Espejo en canvas de `TarjetaRivalDraggable`: dorsal en la ficha, posición en una pastilla y apellido debajo. */
function dibujarRivalEnLienzo(
  ctx: CanvasRenderingContext2D,
  jugador: JugadorRival,
  paleta: PaletaRival,
  cx: number,
  cy: number,
  atenuado: boolean,
): void {
  const colores = PALETA_RIVAL[paleta];
  const radio = 27 * ESCALA_FICHAS;

  ctx.save();
  ctx.globalAlpha = atenuado ? 0.7 : 1;

  ctx.beginPath();
  ctx.arc(cx + SOMBRA_FICHA_OFFSET_PX, cy + SOMBRA_FICHA_OFFSET_PX, radio, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.sombra;
  ctx.globalAlpha *= OPACIDAD.sombraFicha;
  ctx.fill();
  ctx.globalAlpha = atenuado ? 0.7 : 1;

  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.fillStyle = colores.principal;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colores.texto;
  ctx.font = `800 12px ${FUENTE}`;
  ctx.fillText(String(jugador.dorsal), cx, cy);

  ctx.font = `600 7px ${FUENTE}`;
  const anchoPastilla = ctx.measureText(jugador.posicion).width + 8;
  trazarPastilla(ctx, cx, cy + radio, anchoPastilla, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(jugador.posicion, cx, cy + radio + 0.5);

  if (jugador.apellido) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `600 9px ${FUENTE}`;
    ctx.fillText(jugador.apellido.toUpperCase(), cx, cy + radio + 13);
  }
  ctx.restore();
}

/**
 * Espejo en canvas de `BalonDraggable`. Su caja de 24×32 se centra en el punto
 * del balón, así que la esfera (centro en 12,12) queda un poco por encima.
 */
function dibujarBalonEnLienzo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const escala = (DIAMETRO_BALON_PX * ESCALA_FICHAS) / 24;
  conSombra(ctx, 2, 2, 0.45, () => {
    ctx.translate(cx, cy);
    ctx.scale(escala, escala);
    ctx.translate(-12, -16);

    ctx.beginPath();
    ctx.ellipse(12, 27, 7, 2.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(12, 12, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#F5F5F5';
    ctx.fill();
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = '#111111';
    ctx.stroke();

    ctx.fillStyle = '#111111';
    ctx.fill(new Path2D('M12 6 L15 8.3 L14 11.8 L10 11.8 L9 8.3 Z'));
    ctx.lineWidth = 0.6;
    ctx.stroke(new Path2D('M12 6 L9.5 4 M12 6 L14.5 4 M10 11.8 L7 13 M14 11.8 L17 13 M9 8.3 L5.5 8'));
  });
}

async function dibujarCampo(datos: DatosExportacion): Promise<HTMLCanvasElement> {
  const { alineacion, formacion, obtenerJugador, svgCampo, canvasDibujo, anchoContenedor, altoContenedor, orientacion, nombreClub, incluirFotos, incluir } =
    datos;
  const elementos = elementosAExportar(alineacion, incluir);

  // Las fotos se cargan TODAS antes de empezar a dibujar: el lienzo es síncrono
  // y no se puede esperar a una imagen en mitad del trazado.
  const fotos = new Map<string, HTMLImageElement>();
  if (incluirFotos) {
    const cargadas = await Promise.all(
      alineacion.titulares.map(async (titular) => {
        const jugador = obtenerJugador(titular.jugadorId);
        if (!jugador?.fotoUrl) return null;
        const imagen = await cargarFoto(jugador.fotoUrl);
        return imagen ? ([titular.jugadorId, imagen] as const) : null;
      }),
    );
    for (const par of cargadas) if (par) fotos.set(par[0], par[1]);
  }
  await cargarFuentes();

  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(anchoContenedor * ESCALA_EXPORTACION);
  lienzo.height = Math.round((altoContenedor + ALTO_ENCABEZADO) * ESCALA_EXPORTACION);
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto de exportación.');
  ctx.scale(ESCALA_EXPORTACION, ESCALA_EXPORTACION);

  ctx.fillStyle = COLOR.superficie.fondo;
  ctx.fillRect(0, 0, anchoContenedor, altoContenedor + ALTO_ENCABEZADO);

  ctx.fillStyle = COLOR.marca.rojo;
  ctx.fillRect(0, 0, anchoContenedor, ALTO_ENCABEZADO);
  ctx.fillStyle = COLOR.texto.principal;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 20px ${FUENTE}`;
  ctx.fillText(alineacion.nombre || 'Alineación sin nombre', 16, ALTO_ENCABEZADO / 2 - 4);
  ctx.font = `500 12px ${FUENTE}`;
  const fecha = new Date(alineacion.modificadaEn).toLocaleDateString('es-CO');
  ctx.fillText(
    `${nombreClub ?? 'Cúcuta Deportivo'} · ${formacion?.nombre ?? '—'}${formacion?.variante ? ' ' + formacion.variante : ''} · ${fecha}`,
    16,
    ALTO_ENCABEZADO / 2 + 14,
  );

  const imagenCampo = await svgAImagen(svgCampo);
  ctx.drawImage(imagenCampo, 0, ALTO_ENCABEZADO, anchoContenedor, altoContenedor);

  // Mismo orden de capas que en pantalla, que lo marca el z-index de Campo.tsx:
  // marcajes y dibujos (sin z-index, los dibujos después), objetos (5), balón
  // suelto (6), rivales (8), nuestros (10) y el balón en posesión (11).
  const aLienzo = (x: number, y: number) => {
    const punto = porcentajeAPixeles({ x, y }, { ancho: anchoContenedor, alto: altoContenedor }, orientacion);
    return { cx: punto.x, cy: punto.y + ALTO_ENCABEZADO };
  };
  const dibujarBalon = (balon: Balon) => {
    const { x, y } = posicionEfectivaBalon(balon, alineacion.titulares);
    const { cx, cy } = aLienzo(x, y);
    dibujarBalonEnLienzo(ctx, cx, cy);
  };

  for (const { propio, rival } of elementos.marcajes) {
    dibujarMarcajeEnLienzo(ctx, aLienzo(propio.x, propio.y), aLienzo(rival.x, rival.y));
  }

  if (canvasDibujo && elementos.dibujos) {
    ctx.drawImage(canvasDibujo, 0, ALTO_ENCABEZADO, anchoContenedor, altoContenedor);
  }

  for (const objeto of elementos.objetos) {
    const { cx, cy } = aLienzo(objeto.x, objeto.y);
    dibujarObjetoEnLienzo(ctx, objeto, cx, cy);
  }
  elementos.balonesSueltos.forEach(dibujarBalon);

  for (const jugadorRival of elementos.rivales) {
    const { cx, cy } = aLienzo(jugadorRival.x, jugadorRival.y);
    const atenuado = alineacion.titulares.some((t) => Math.abs(t.x - jugadorRival.x) < 3 && Math.abs(t.y - jugadorRival.y) < 3);
    dibujarRivalEnLienzo(ctx, jugadorRival, alineacion.rival!.paleta, cx, cy, atenuado);
  }

  for (const titular of elementos.titulares) {
    const jugador = obtenerJugador(titular.jugadorId);
    if (!jugador) continue;
    dibujarJugadorEnLienzo(
      ctx, jugador, titular, anchoContenedor, altoContenedor, ALTO_ENCABEZADO, orientacion, fotos.get(titular.jugadorId),
    );
  }
  elementos.balonesEnPosesion.forEach(dibujarBalon);

  return lienzo;
}

export async function exportarCampoAPng(datos: DatosExportacion): Promise<Blob> {
  const lienzo = await dibujarCampo(datos);
  return new Promise<Blob>((resolve, reject) => {
    lienzo.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('La exportación a PNG falló.'))), 'image/png');
  });
}

export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export async function exportarCampoAPdf(datos: DatosExportacion): Promise<void> {
  const [{ default: jsPDF }, lienzo] = await Promise.all([import('jspdf'), dibujarCampo(datos)]);
  const urlDatos = lienzo.toDataURL('image/jpeg', CALIDAD_JPEG_PDF);
  const anchoTotal = datos.anchoContenedor;
  const altoTotal = datos.altoContenedor + ALTO_ENCABEZADO;
  const documento = new jsPDF({
    orientation: anchoTotal >= altoTotal ? 'landscape' : 'portrait',
    unit: 'pt',
  });
  const anchoPagina = documento.internal.pageSize.getWidth();
  const altoPagina = documento.internal.pageSize.getHeight();
  const margen = 24;
  const anchoDisponible = anchoPagina - margen * 2;
  const altoDisponible = altoPagina - margen * 2;
  const relacion = altoTotal / anchoTotal;
  let anchoImagen = anchoDisponible;
  let altoImagen = anchoImagen * relacion;
  if (altoImagen > altoDisponible) {
    altoImagen = altoDisponible;
    anchoImagen = altoImagen / relacion;
  }
  documento.addImage(urlDatos, 'JPEG', margen, margen, anchoImagen, altoImagen);
  documento.save(`${datos.alineacion.nombre || 'alineacion'}.pdf`);
}

export function exportarAlineacionAJson(alineacion: Alineacion): void {
  const contenido = JSON.stringify(alineacion, null, 2);
  const blob = new Blob([contenido], { type: 'application/json' });
  descargarBlob(blob, `${alineacion.nombre || 'alineacion'}.json`);
}

function esAlineacionValida(valor: unknown): valor is Alineacion {
  if (typeof valor !== 'object' || valor === null) return false;
  const registro = valor as Record<string, unknown>;
  return (
    typeof registro['id'] === 'string' &&
    typeof registro['nombre'] === 'string' &&
    typeof registro['formacionId'] === 'string' &&
    Array.isArray(registro['titulares']) &&
    Array.isArray(registro['banquillo']) &&
    Array.isArray(registro['trazos'])
  );
}

export function analizarAlineacionDesdeJson(texto: string): Alineacion {
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!esAlineacionValida(valor)) {
    throw new Error('El archivo no tiene el formato esperado de una alineación.');
  }
  return valor;
}
