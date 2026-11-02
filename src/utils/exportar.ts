import { COLOR, GROSOR, OPACIDAD, SOMBRA_FICHA_OFFSET_PX } from '../tokens';
import type { Alineacion, Balon, Formacion, Jugador, JugadorEnCampo, JugadorRival, ObjetoCampo, Orientacion, PaletaRival } from '../types';
import { posicionEfectivaBalon } from './balon';
import { COLORES_OBJETO, DIAMETRO_BALON_PX, PALETA_RIVAL } from './constantes';
import { porcentajeAPixeles } from './coordenadas';

const ESCALA_EXPORTACION = 2;
const ALTO_ENCABEZADO = 56;
/**
 * La ficha propia sale con radio 20 en el PNG y mide 32 en pantalla ('md').
 * Objetos, rivales y balón se reducen en la misma proporción para que
 * conserven el tamaño relativo que tienen en pantalla.
 */
const ESCALA_FICHAS = 20 / 32;

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
  if (jugador.dorsal != null) {
    if (foto) {
      // Con foto, el dorsal va en una chapa arriba a la izquierda, como en
      // pantalla: encima de la cara no se leería.
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
      ctx.font = '700 11px Arial';
      ctx.fillText(String(jugador.dorsal), bx, by);
    } else {
      ctx.fillStyle = COLOR.campo.linea;
      ctx.font = '700 15px Arial';
      ctx.fillText(String(jugador.dorsal), cx, cy);
    }
  }
  ctx.fillStyle = COLOR.campo.linea;

  // Apellido sobre el césped, sin recuadro.
  ctx.font = '600 11px Arial';
  ctx.fillText(jugador.apellido.toUpperCase(), cx, cy + radio + 10);

  // Y debajo, las posiciones en el color de etiqueta secundaria.
  const posiciones = [jugador.posicionNatural, jugador.posicionesSecundarias[0]].filter(Boolean).join(' · ');
  if (posiciones) {
    ctx.fillStyle = COLOR.campo.etiquetaSecundaria;
    ctx.font = '600 9px Arial';
    ctx.fillText(posiciones, cx, cy + radio + 21);
  }
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
  ctx.font = '800 12px Arial';
  ctx.fillText(String(jugador.dorsal), cx, cy);

  ctx.font = '600 7px Arial';
  const anchoPastilla = ctx.measureText(jugador.posicion).width + 8;
  trazarPastilla(ctx, cx, cy + radio, anchoPastilla, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(jugador.posicion, cx, cy + radio + 0.5);

  if (jugador.apellido) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 9px Arial';
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

export async function exportarCampoAPng(datos: DatosExportacion): Promise<Blob> {
  const { alineacion, formacion, obtenerJugador, svgCampo, canvasDibujo, anchoContenedor, altoContenedor, orientacion, nombreClub, incluirFotos } = datos;

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
  ctx.font = '700 20px Arial';
  ctx.fillText(alineacion.nombre || 'Alineación sin nombre', 16, ALTO_ENCABEZADO / 2 - 4);
  ctx.font = '400 12px Arial';
  const fecha = new Date(alineacion.modificadaEn).toLocaleDateString('es-CO');
  ctx.fillText(
    `${nombreClub ?? 'Cúcuta Deportivo'} · ${formacion?.nombre ?? '—'}${formacion?.variante ? ' ' + formacion.variante : ''} · ${fecha}`,
    16,
    ALTO_ENCABEZADO / 2 + 14,
  );

  const imagenCampo = await svgAImagen(svgCampo);
  ctx.drawImage(imagenCampo, 0, ALTO_ENCABEZADO, anchoContenedor, altoContenedor);

  if (canvasDibujo) {
    ctx.drawImage(canvasDibujo, 0, ALTO_ENCABEZADO, anchoContenedor, altoContenedor);
  }

  // Mismo orden de capas y misma visibilidad que en pantalla (Campo.tsx):
  // objetos, balón suelto, rivales, nuestros y, encima, el balón en posesión.
  const aLienzo = (x: number, y: number) => {
    const punto = porcentajeAPixeles({ x, y }, { ancho: anchoContenedor, alto: altoContenedor }, orientacion);
    return { cx: punto.x, cy: punto.y + ALTO_ENCABEZADO };
  };
  const rival = alineacion.rival;
  const rivalVisible = Boolean(rival?.visible) && rival?.modoVista !== 'solo_nosotros';
  const propioVisible = rival?.modoVista !== 'solo_rival';
  const dibujarBalon = (balon: Balon) => {
    const { x, y } = posicionEfectivaBalon(balon, alineacion.titulares);
    const { cx, cy } = aLienzo(x, y);
    dibujarBalonEnLienzo(ctx, cx, cy);
  };

  for (const objeto of alineacion.objetos) {
    const { cx, cy } = aLienzo(objeto.x, objeto.y);
    dibujarObjetoEnLienzo(ctx, objeto, cx, cy);
  }
  alineacion.balones.filter((b) => !b.jugadorPoseedorId).forEach(dibujarBalon);

  if (rival && rivalVisible) {
    for (const jugadorRival of rival.jugadores) {
      const { cx, cy } = aLienzo(jugadorRival.x, jugadorRival.y);
      const atenuado = alineacion.titulares.some((t) => Math.abs(t.x - jugadorRival.x) < 3 && Math.abs(t.y - jugadorRival.y) < 3);
      dibujarRivalEnLienzo(ctx, jugadorRival, rival.paleta, cx, cy, atenuado);
    }
  }

  if (propioVisible) {
    for (const titular of alineacion.titulares) {
      const jugador = obtenerJugador(titular.jugadorId);
      if (!jugador) continue;
      dibujarJugadorEnLienzo(
        ctx, jugador, titular, anchoContenedor, altoContenedor, ALTO_ENCABEZADO, orientacion, fotos.get(titular.jugadorId),
      );
    }
  }
  alineacion.balones.filter((b) => b.jugadorPoseedorId).forEach(dibujarBalon);

  return new Promise<Blob>((resolve, reject) => {
    lienzo.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('La exportación a PNG falló.'))), 'image/png');
  });
}

function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result as string);
    lector.onerror = () => reject(new Error('No se pudo leer la imagen generada.'));
    lector.readAsDataURL(blob);
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
  const [{ default: jsPDF }, blobPng] = await Promise.all([import('jspdf'), exportarCampoAPng(datos)]);
  const urlDatos = await blobADataUrl(blobPng);
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
  documento.addImage(urlDatos, 'PNG', margen, margen, anchoImagen, altoImagen);
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
