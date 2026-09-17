import { supabase } from '../../lib/supabaseClient';
import type { Categoria, Jugador, Posicion } from '../../types';

/**
 * Acceso a las tablas `categorias` y `jugadores` y al bucket privado
 * `jugadores`. Es el único sitio que conoce los nombres de columna de Supabase:
 * el store y los componentes trabajan siempre con los tipos del dominio.
 */

const BUCKET = 'jugadores';
/** Caducidad de los enlaces firmados. Corta a propósito: el bucket es privado. */
const SEGUNDOS_FIRMA = 60 * 30;
/** Se renuevan un poco antes de caducar para que nunca se vea una foto rota. */
const MARGEN_RENOVACION_MS = 60 * 1000;

interface FilaJugador {
  id: string;
  categoria_id: string;
  dorsal: number | null;
  nombre: string;
  apellido: string;
  posicion_principal: string | null;
  posicion_secundaria: string | null;
  foto_path: string | null;
  activo: boolean;
}

/** Convierte una fila de Supabase al tipo del dominio. */
function aJugador(fila: FilaJugador): Jugador {
  return {
    id: fila.id,
    categoriaId: fila.categoria_id,
    nombre: fila.nombre,
    apellido: fila.apellido,
    dorsal: fila.dorsal,
    // La tabla no guarda pie preferido; el resto de la app espera el campo.
    piePreferido: 'derecho',
    posicionNatural: (fila.posicion_principal ?? 'MC') as Posicion,
    posicionesSecundarias: fila.posicion_secundaria ? [fila.posicion_secundaria as Posicion] : [],
    fotoPath: fila.foto_path,
    // El enlace firmado se rellena aparte: no vive en la tabla.
    fotoUrl: null,
    activo: fila.activo,
  };
}

export interface DatosJugador {
  nombre: string;
  apellido: string;
  dorsal: number | null;
  posicionPrincipal: Posicion;
  posicionSecundaria: Posicion | null;
}

function aFila(datos: DatosJugador) {
  return {
    nombre: datos.nombre,
    apellido: datos.apellido,
    dorsal: datos.dorsal,
    posicion_principal: datos.posicionPrincipal,
    posicion_secundaria: datos.posicionSecundaria,
  };
}

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase.from('categorias').select('id, nombre, orden').order('orden');
  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`);
  return (data ?? []).map((c) => ({ id: c.id as string, nombre: c.nombre as string, orden: c.orden as number }));
}

export async function listarJugadores(categoriaId: string): Promise<Jugador[]> {
  const { data, error } = await supabase
    .from('jugadores')
    .select('id, categoria_id, dorsal, nombre, apellido, posicion_principal, posicion_secundaria, foto_path, activo')
    .eq('categoria_id', categoriaId)
    .eq('activo', true)
    .order('dorsal', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`No se pudo cargar la plantilla: ${error.message}`);
  return (data ?? []).map((f) => aJugador(f as FilaJugador));
}

export async function crearJugador(categoriaId: string, datos: DatosJugador): Promise<Jugador> {
  const { data, error } = await supabase
    .from('jugadores')
    .insert({ categoria_id: categoriaId, ...aFila(datos) })
    .select('id, categoria_id, dorsal, nombre, apellido, posicion_principal, posicion_secundaria, foto_path, activo')
    .single();
  if (error) throw new Error(traducirError(error.message));
  return aJugador(data as FilaJugador);
}

export async function actualizarJugador(jugadorId: string, datos: DatosJugador): Promise<void> {
  const { error } = await supabase
    .from('jugadores')
    .update({ ...aFila(datos), actualizado_en: new Date().toISOString() })
    .eq('id', jugadorId);
  if (error) throw new Error(traducirError(error.message));
}

/**
 * Desactivar, nunca borrar: las alineaciones guardadas referencian al jugador
 * y borrarlo las dejaría rotas.
 */
export async function desactivarJugador(jugadorId: string): Promise<void> {
  const { error } = await supabase
    .from('jugadores')
    .update({ activo: false, actualizado_en: new Date().toISOString() })
    .eq('id', jugadorId);
  if (error) throw new Error(`No se pudo desactivar al jugador: ${error.message}`);
}

/** El índice único de la base de datos habla en jerga; aquí se traduce. */
function traducirError(mensaje: string): string {
  if (mensaje.includes('jugadores_dorsal_categoria_idx')) {
    return 'Ese dorsal ya lo lleva otro jugador activo de la categoría.';
  }
  if (mensaje.includes('jugadores_posiciones_distintas')) {
    return 'La posición secundaria no puede ser igual a la principal.';
  }
  if (mensaje.includes('jugadores_dorsal_rango')) {
    return 'El dorsal debe estar entre 1 y 99.';
  }
  return `No se pudo guardar: ${mensaje}`;
}

// --- Fotos ---

export function rutaFoto(categoriaId: string, jugadorId: string): string {
  return `${categoriaId}/${jugadorId}.webp`;
}

export async function subirFoto(ruta: string, blob: Blob): Promise<void> {
  // `upsert` para que subir una foto nueva reemplace la anterior del mismo
  // jugador en lugar de acumular archivos huérfanos.
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
}

export async function borrarFoto(ruta: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([ruta]);
  if (error) throw new Error(`No se pudo borrar la foto: ${error.message}`);
}

export async function guardarRutaFoto(jugadorId: string, fotoPath: string | null): Promise<void> {
  const { error } = await supabase
    .from('jugadores')
    .update({ foto_path: fotoPath, actualizado_en: new Date().toISOString() })
    .eq('id', jugadorId);
  if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
}

export interface EnlaceFirmado {
  url: string;
  /** Instante en que conviene renovarlo, ya con el margen restado. */
  renovarEn: number;
}

/**
 * Enlaces firmados de TODA la categoría en una sola llamada. Pedir uno por
 * tarjeta multiplicaría las peticiones por el tamaño de la plantilla.
 */
export async function firmarFotos(rutas: string[]): Promise<Record<string, EnlaceFirmado>> {
  if (rutas.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, SEGUNDOS_FIRMA);
  if (error) throw new Error(`No se pudieron preparar las fotos: ${error.message}`);

  const renovarEn = Date.now() + SEGUNDOS_FIRMA * 1000 - MARGEN_RENOVACION_MS;
  const enlaces: Record<string, EnlaceFirmado> = {};
  for (const fila of data ?? []) {
    // Una ruta que falla (archivo borrado a mano) no debe tumbar al resto:
    // ese jugador se queda con su respaldo del dorsal.
    if (fila.signedUrl && fila.path) enlaces[fila.path] = { url: fila.signedUrl, renovarEn };
  }
  return enlaces;
}
