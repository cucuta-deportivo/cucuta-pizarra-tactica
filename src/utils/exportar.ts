import { FORMATO_RESPALDO, type Respaldo } from '../data/sincronizacion/migrar';
import { COLOR, GROSOR, OPACIDAD, SOMBRA_FICHA_OFFSET_PX } from '../tokens';
import type { Alineacion, Balon, Formacion, Jugador, JugadorEnCampo, JugadorRival, ObjetoCampo, Orientacion, PaletaRival } from '../types';
import { posicionEfectivaBalon } from './balon';
import { COLORES_OBJETO, DIAMETRO_BALON_PX, PALETA_RIVAL } from './constantes';
import { porcentajeAPixeles } from './coordenadas';
import { cargarFuentesBarlow } from './fuentes';
import { esDeUnaVersionMasNueva } from './formatoAlineacion';
import { obtenerIniciales } from './jugador';

const ESCALA_EXPORTACION = 2;
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
/** Las líneas de `CapaMarcajes`: rojo táctico, no el de la marca, para que lo exportado siga igual que la pantalla. */
const ROJO_MARCAJE = '#D4111E';

/**
 * Encabezado de lo exportado: banda negra con el escudo, el club, la categoría
 * y el rival, ENCIMA del campo (nunca lo tapa). Mide 76 px en una fila; si el
 * campo es estrecho (vertical) y el rival no cabe al lado, baja a su propia
 * línea y mide 100.
 */
const ALTO_ENCABEZADO = { unaFila: 76, dosFilas: 100 } as const;
const ALTO_ESCUDO = { unaFila: 52, dosFilas: 60 } as const;
const MARGEN_ENCABEZADO = 16;
const SEPARACION_CATEGORIA = 10;
/** El escudo sin año (94 × 120), el mismo de la barra superior. */
const RUTA_ESCUDO = '/escudos/escudo.png';
const PROPORCION_ESCUDO = 94 / 120;
const FUENTE_CLUB = `800 24px ${FUENTE}`;
const FUENTE_VS = `600 16px ${FUENTE}`;
const FUENTE_RIVAL_ABAJO = `700 20px ${FUENTE}`;
const FUENTE_DETALLE = `500 14px ${FUENTE}`;

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
  /** Nombre de la categoría de la alineación ("Sub-17"). Sin ella, el encabezado no la pone. */
  categoria?: string | null;
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

function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

/**
 * Un SVG dibujado como imagen no carga archivos de fuera: el monograma del
 * círculo central saldría vacío. Se exporta una copia con cada `<image>`
 * incrustada como data URL (sin señal la sirve el service worker). La que no
 * cargue se quita de la copia y la exportación sigue sin ella. El SVG de la
 * pantalla no se toca.
 */
export async function incrustarImagenes(svg: SVGSVGElement): Promise<SVGSVGElement> {
  const copia = svg.cloneNode(true) as SVGSVGElement;
  await Promise.all(
    Array.from(copia.querySelectorAll('image')).map(async (imagen) => {
      const ruta = imagen.getAttribute('href');
      if (!ruta || ruta.startsWith('data:')) return;
      try {
        const respuesta = await fetch(ruta);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        imagen.setAttribute('href', await blobADataUrl(await respuesta.blob()));
      } catch {
        imagen.remove();
      }
    }),
  );
  return copia;
}

async function svgAImagen(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const cadena = new XMLSerializer().serializeToString(await incrustarImagenes(svg));
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
    ctx.fillStyle = COLOR.marca.dorado;
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
  ctx.strokeStyle = ROJO_MARCAJE;
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

/** Lo que dice el encabezado de lo exportado. Va aparte del dibujo para poder probarlo sin lienzo. */
export interface TextosEncabezado {
  club: string;
  /** Categoría de la alineación ("SUB-17"), en dorado. */
  categoria: string | null;
  rival: string | null;
  /** Segunda línea: nombre de la alineación, formación y fecha. */
  detalle: string;
}

/** El nombre que trae un rival recién añadido no dice nada: el encabezado no lo pone. */
const NOMBRE_RIVAL_POR_DEFECTO = 'rival';

export function textosEncabezado(
  alineacion: Pick<Alineacion, 'nombre' | 'modificadaEn' | 'rival'>,
  formacion: Pick<Formacion, 'nombre' | 'variante'> | undefined,
  categoria?: string | null,
  nombreClub = 'Cúcuta Deportivo',
): TextosEncabezado {
  const rival = alineacion.rival?.nombre?.trim() ?? '';
  const nombreCategoria = categoria?.trim() ?? '';
  const fecha = new Date(alineacion.modificadaEn).toLocaleDateString('es-CO');
  const esquema = `${formacion?.nombre ?? '—'}${formacion?.variante ? ' ' + formacion.variante : ''}`;
  return {
    club: nombreClub.toLocaleUpperCase('es'),
    categoria: nombreCategoria ? nombreCategoria.toLocaleUpperCase('es') : null,
    rival: rival && rival.toLocaleLowerCase('es') !== NOMBRE_RIVAL_POR_DEFECTO ? rival.toLocaleUpperCase('es') : null,
    detalle: `${alineacion.nombre || 'Alineación sin nombre'} · ${esquema} · ${fecha}`,
  };
}

export interface PlanEncabezado {
  alto: number;
  /** El rival va a la derecha de la primera línea; si no cabe, baja a la segunda. */
  unaFila: boolean;
}

/** Donde empiezan los textos: a la derecha del escudo. */
function inicioTextoEncabezado(altoEscudo: number): number {
  return MARGEN_ENCABEZADO + altoEscudo * PROPORCION_ESCUDO + 12;
}

/** `mide` devuelve el ancho de un texto con una fuente (en el lienzo, `measureText`). */
export function planEncabezado(mide: (texto: string, fuente: string) => number, ancho: number, textos: TextosEncabezado): PlanEncabezado {
  if (!textos.rival) return { alto: ALTO_ENCABEZADO.unaFila, unaFila: true };
  const izquierda = mide(textos.club, FUENTE_CLUB) + (textos.categoria ? SEPARACION_CATEGORIA + mide(textos.categoria, FUENTE_CLUB) : 0);
  const derecha = mide('vs', FUENTE_VS) + 8 + mide(textos.rival, FUENTE_CLUB);
  const unaFila = inicioTextoEncabezado(ALTO_ESCUDO.unaFila) + izquierda + 32 + derecha <= ancho - MARGEN_ENCABEZADO;
  return { alto: unaFila ? ALTO_ENCABEZADO.unaFila : ALTO_ENCABEZADO.dosFilas, unaFila };
}

function medidorDeTexto(ctx: CanvasRenderingContext2D): (texto: string, fuente: string) => number {
  return (texto, fuente) => {
    ctx.font = fuente;
    return ctx.measureText(texto).width;
  };
}

/** Corta con «…» lo que no cabe en `maximo`, con la fuente que ya tiene el contexto. */
function recortarTexto(ctx: CanvasRenderingContext2D, texto: string, maximo: number): string {
  if (ctx.measureText(texto).width <= maximo) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > maximo) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

/**
 * Banda negra con el escudo, «CÚCUTA DEPORTIVO» y la categoría en dorado; el
 * rival a la derecha o en su propia línea; debajo, alineación, formación y
 * fecha. Una raya roja la separa del campo. Si el escudo no cargó, sale sin él.
 */
function dibujarEncabezado(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  textos: TextosEncabezado,
  { alto, unaFila }: PlanEncabezado,
  escudo: HTMLImageElement | null,
): void {
  ctx.fillStyle = COLOR.marca.negro;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = COLOR.marca.rojo;
  ctx.fillRect(0, alto - 3, ancho, 3);

  const altoEscudo = unaFila ? ALTO_ESCUDO.unaFila : ALTO_ESCUDO.dosFilas;
  if (escudo) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(escudo, MARGEN_ENCABEZADO, (alto - 3 - altoEscudo) / 2, altoEscudo * PROPORCION_ESCUDO, altoEscudo);
  }
  const x = inicioTextoEncabezado(altoEscudo);
  const limite = ancho - MARGEN_ENCABEZADO;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Línea 1: club y categoría. En un campo muy estrecho la letra se reduce para que quepan.
  const izquierda =
    medidorDeTexto(ctx)(textos.club, FUENTE_CLUB) + (textos.categoria ? SEPARACION_CATEGORIA + medidorDeTexto(ctx)(textos.categoria, FUENTE_CLUB) : 0);
  const tamano = izquierda > limite - x ? Math.max(16, Math.floor((24 * (limite - x)) / izquierda)) : 24;
  const base1 = unaFila ? 35 : 32;
  ctx.font = `800 ${tamano}px ${FUENTE}`;
  ctx.fillStyle = COLOR.texto.principal;
  const club = recortarTexto(ctx, textos.club, limite - x);
  ctx.fillText(club, x, base1);
  const xCategoria = x + ctx.measureText(club).width + (SEPARACION_CATEGORIA * tamano) / 24;
  if (textos.categoria && limite - xCategoria > 20) {
    ctx.fillStyle = COLOR.marca.dorado;
    ctx.fillText(recortarTexto(ctx, textos.categoria, limite - xCategoria), xCategoria, base1);
  }

  if (unaFila) {
    if (textos.rival) {
      ctx.textAlign = 'right';
      ctx.font = FUENTE_CLUB;
      ctx.fillStyle = COLOR.texto.principal;
      ctx.fillText(textos.rival, limite, base1);
      const anchoRival = ctx.measureText(textos.rival).width;
      ctx.font = FUENTE_VS;
      ctx.fillStyle = COLOR.texto.secundario;
      ctx.fillText('vs', limite - anchoRival - 8, base1);
      ctx.textAlign = 'left';
    }
    ctx.font = FUENTE_DETALLE;
    ctx.fillStyle = COLOR.texto.secundario;
    ctx.fillText(recortarTexto(ctx, textos.detalle, limite - x), x, 57);
  } else {
    ctx.font = FUENTE_VS;
    ctx.fillStyle = COLOR.texto.secundario;
    ctx.fillText('vs', x, 58);
    const xRival = x + ctx.measureText('vs').width + 6;
    ctx.font = FUENTE_RIVAL_ABAJO;
    ctx.fillStyle = COLOR.texto.principal;
    ctx.fillText(recortarTexto(ctx, textos.rival ?? '', limite - xRival), xRival, 58);
    ctx.font = FUENTE_DETALLE;
    ctx.fillStyle = COLOR.texto.secundario;
    ctx.fillText(recortarTexto(ctx, textos.detalle, limite - x), x, 82);
  }
}

async function dibujarCampo(datos: DatosExportacion): Promise<HTMLCanvasElement> {
  const {
    alineacion, formacion, obtenerJugador, svgCampo, canvasDibujo, anchoContenedor, altoContenedor, orientacion, nombreClub, categoria, incluirFotos, incluir,
  } = datos;
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
  // El escudo se carga como una foto: si falla, el encabezado sale sin él y la exportación sigue.
  const [escudo] = await Promise.all([cargarFoto(RUTA_ESCUDO), cargarFuentesBarlow()]);

  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear el contexto de exportación.');
  // El alto del encabezado depende de lo que mida el texto: se mide antes de dar
  // tamaño al lienzo (cambiarlo reinicia el contexto, no las medidas ya tomadas).
  const textos = textosEncabezado(alineacion, formacion, categoria, nombreClub);
  const encabezado = planEncabezado(medidorDeTexto(ctx), anchoContenedor, textos);
  const altoEncabezado = encabezado.alto;
  lienzo.width = Math.round(anchoContenedor * ESCALA_EXPORTACION);
  lienzo.height = Math.round((altoContenedor + altoEncabezado) * ESCALA_EXPORTACION);
  ctx.scale(ESCALA_EXPORTACION, ESCALA_EXPORTACION);

  ctx.fillStyle = COLOR.superficie.fondo;
  ctx.fillRect(0, 0, anchoContenedor, altoContenedor + altoEncabezado);
  dibujarEncabezado(ctx, anchoContenedor, textos, encabezado, escudo);

  const imagenCampo = await svgAImagen(svgCampo);
  ctx.drawImage(imagenCampo, 0, altoEncabezado, anchoContenedor, altoContenedor);

  // Mismo orden de capas que en pantalla, que lo marca el z-index de Campo.tsx:
  // marcajes y dibujos (sin z-index, los dibujos después), objetos (5), balón
  // suelto (6), rivales (8), nuestros (10) y el balón en posesión (11).
  const aLienzo = (x: number, y: number) => {
    const punto = porcentajeAPixeles({ x, y }, { ancho: anchoContenedor, alto: altoContenedor }, orientacion);
    return { cx: punto.x, cy: punto.y + altoEncabezado };
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
    ctx.drawImage(canvasDibujo, 0, altoEncabezado, anchoContenedor, altoContenedor);
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
      ctx, jugador, titular, anchoContenedor, altoContenedor, altoEncabezado, orientacion, fotos.get(titular.jugadorId),
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
  // Proporción de la imagen entera, encabezado incluido: su alto depende del ancho del campo.
  const anchoTotal = lienzo.width;
  const altoTotal = lienzo.height;
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

function leerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
}

export function analizarAlineacionDesdeJson(texto: string): Alineacion {
  const valor = leerJson(texto);
  if (!esAlineacionValida(valor)) {
    throw new Error('El archivo no tiene el formato esperado de una alineación.');
  }
  return valor;
}

/** S1.8: `respaldo-alineaciones-AAAA-MM-DD.json`, con la fecha local del día. */
export function nombreDelRespaldo(fecha: Date): string {
  const dosCifras = (n: number) => String(n).padStart(2, '0');
  return `respaldo-alineaciones-${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}.json`;
}

export function exportarRespaldoAJson(respaldo: Respaldo): void {
  const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' });
  descargarBlob(blob, nombreDelRespaldo(new Date(respaldo.creadoEn)));
}

/** Lo que trae un archivo de "Importar JSON": una alineación, o un respaldo con varias (S1.8). */
export type ArchivoDeAlineaciones = { tipo: 'una'; alineacion: Alineacion } | { tipo: 'respaldo'; alineaciones: Alineacion[] };

/** Importarla en esta versión la guardaría sin lo que esta no conoce: se pide actualizar la app. */
const AVISO_ARCHIVO_MAS_NUEVO = 'El archivo es de una versión más nueva de la app. Actualiza la app para importarlo.';

export function leerArchivoDeAlineaciones(texto: string): ArchivoDeAlineaciones {
  const valor = leerJson(texto);
  const registro = valor as Partial<Respaldo> | null;
  if (registro && typeof registro === 'object' && registro.formato === FORMATO_RESPALDO) {
    // Todo o nada: un respaldo a medias confundiría más que ayudaría.
    if (!Array.isArray(registro.alineaciones) || !registro.alineaciones.every(esAlineacionValida)) {
      throw new Error('El respaldo tiene alineaciones con un formato que no se reconoce.');
    }
    if (registro.alineaciones.some(esDeUnaVersionMasNueva)) throw new Error(AVISO_ARCHIVO_MAS_NUEVO);
    return { tipo: 'respaldo', alineaciones: registro.alineaciones };
  }
  if (!esAlineacionValida(valor)) {
    throw new Error('El archivo no tiene el formato esperado de una alineación.');
  }
  if (esDeUnaVersionMasNueva(valor)) throw new Error(AVISO_ARCHIVO_MAS_NUEVO);
  return { tipo: 'una', alineacion: valor };
}
