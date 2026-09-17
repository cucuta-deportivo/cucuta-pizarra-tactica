import { COLOR, GROSOR, OPACIDAD, SOMBRA_FICHA_OFFSET_PX } from '../tokens';
import type { Alineacion, Formacion, Jugador, JugadorEnCampo, Orientacion } from '../types';
import { porcentajeAPixeles } from './coordenadas';

const ESCALA_EXPORTACION = 2;
const ALTO_ENCABEZADO = 56;

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

  for (const titular of alineacion.titulares) {
    const jugador = obtenerJugador(titular.jugadorId);
    if (!jugador) continue;
    dibujarJugadorEnLienzo(
      ctx, jugador, titular, anchoContenedor, altoContenedor, ALTO_ENCABEZADO, orientacion, fotos.get(titular.jugadorId),
    );
  }

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
