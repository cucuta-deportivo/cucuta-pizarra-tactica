import { supabase } from '../../lib/supabaseClient';
import type { Alineacion } from '../../types';

/**
 * Acceso a la tabla `alineaciones` (S1). Es el único sitio que conoce sus
 * nombres de columna: el sincronizador trabaja siempre con `Alineacion`.
 *
 * La versión, las fechas de cambio y los autores los pone el servidor (ver
 * supabase/schema.sql). Para no pisar el trabajo de otro dispositivo, cada
 * cambio se sube "desde la versión de la que parte": si ya no es la del
 * servidor, no se escribe nada y el sincronizador decide qué hacer.
 */

const TABLA = 'alineaciones';
const COLUMNAS_ESTADO = 'id, version, ultimo_cambio, eliminada_en, actualizado_en';
const COLUMNAS_FILA = `${COLUMNAS_ESTADO}, nombre, formacion, categoria_id, documento, creado_en`;
/** Ids por petición al descargar: una lista larga en la URL puede pasar el límite del servidor. */
const IDS_POR_DESCARGA = 100;
/** Filas por página al listar: Supabase no devuelve más de 1000 por petición. */
const FILAS_POR_PAGINA = 1000;

/** Lo que se escribe al subir. La versión, las fechas de cambio y los autores no: los pone el servidor. */
export interface FilaParaSubir {
  id: string;
  nombre: string;
  formacion: string;
  categoria_id: string | null;
  documento: Alineacion;
  ultimo_cambio: string;
  creado_en: string;
}

/** Las columnas que lee la app. */
export interface FilaAlineacion extends FilaParaSubir {
  version: number;
  eliminada_en: string | null;
  actualizado_en: string;
}

type FilaEstado = Pick<FilaAlineacion, 'id' | 'version' | 'ultimo_cambio' | 'eliminada_en' | 'actualizado_en'>;

export interface AlineacionRemota {
  alineacion: Alineacion;
  version: number;
  eliminada: boolean;
  ultimoCambio: string;
}

/** Lo que el servidor sabe de una alineación, sin descargar su documento. */
export interface EstadoRemoto {
  id: string;
  version: number;
  ultimoCambio: string;
  eliminada: boolean;
  actualizadoEn: string;
}

/** `sin-cambio`: no se escribió nada (la versión ya no era esa, o la fila no existe o no se ve); hay que mirar el estado. */
export type ResultadoSubida = { tipo: 'subida'; version: number } | { tipo: 'sin-cambio' };
export type ResultadoAlta = ResultadoSubida | { tipo: 'ya-existe' };

interface ErrorDeRespuesta {
  message: string;
  code: string;
}

interface RespuestaSupabase<T> {
  data: T | null;
  error: ErrorDeRespuesta | null;
  status: number;
}

/** Sin red o sin respuesta del servidor: la sincronización lo reintenta más tarde; no es un error del entrenador. */
export class ErrorSinConexion extends Error {
  constructor() {
    super('Sin conexión con el servidor.');
    this.name = 'ErrorSinConexion';
  }
}

/** Cualquier otro error del servidor (permisos, datos no válidos…), con su código de Supabase o Postgres. */
export class ErrorSupabase extends Error {
  readonly codigo: string;
  readonly estado: number;

  constructor(mensaje: string, codigo: string, estado: number) {
    super(mensaje);
    this.name = 'ErrorSupabase';
    this.codigo = codigo;
    this.estado = estado;
  }
}

/** Un fallo de red no lanza: llega como respuesta con estado 0. */
export function interpretarError(respuesta: { error: ErrorDeRespuesta; status: number }): Error {
  if (respuesta.status === 0) return new ErrorSinConexion();
  return new ErrorSupabase(respuesta.error.message, respuesta.error.code, respuesta.status);
}

/** El documento tal como se sube: sin enlaces firmados de fotos, que caducan y nunca se guardan. */
function documentoParaSubir(alineacion: Alineacion): Alineacion {
  return {
    ...alineacion,
    jugadoresPersonalizados: alineacion.jugadoresPersonalizados?.map((j) => ({ ...j, fotoUrl: null })),
  };
}

/** La alineación entera va en `documento`; nombre, formación y categoría se copian para listar sin descargarlo. */
export function filaParaSubir(alineacion: Alineacion, ultimoCambio: string): FilaParaSubir {
  return {
    id: alineacion.id,
    nombre: alineacion.nombre,
    formacion: alineacion.formacionId,
    categoria_id: alineacion.categoriaId ?? null,
    documento: documentoParaSubir(alineacion),
    ultimo_cambio: ultimoCambio,
    creado_en: alineacion.creadaEn,
  };
}

export function desdeFila(fila: FilaAlineacion): AlineacionRemota {
  return {
    alineacion: { ...fila.documento, id: fila.id },
    version: fila.version,
    eliminada: fila.eliminada_en !== null,
    ultimoCambio: fila.ultimo_cambio,
  };
}

function estadoDesdeFila(fila: FilaEstado): EstadoRemoto {
  return {
    id: fila.id,
    version: fila.version,
    ultimoCambio: fila.ultimo_cambio,
    eliminada: fila.eliminada_en !== null,
    actualizadoEn: fila.actualizado_en,
  };
}

export function resultadoDeSubida(filas: { version: number }[]): ResultadoSubida {
  const fila = filas[0];
  return fila ? { tipo: 'subida', version: fila.version } : { tipo: 'sin-cambio' };
}

/** Un id que ya existe no es un error: puede ser una subida anterior que sí llegó aunque se perdiera la respuesta. */
export function resultadoDeAlta(respuesta: RespuestaSupabase<{ version: number }[]>): ResultadoAlta {
  if (respuesta.error?.code === '23505') return { tipo: 'ya-existe' };
  if (respuesta.error) throw interpretarError({ error: respuesta.error, status: respuesta.status });
  return resultadoDeSubida(respuesta.data ?? []);
}

/** Sube una alineación nueva con su mismo id. Si el id ya existe, no la pisa. */
export async function crearEnServidor(alineacion: Alineacion, ultimoCambio: string): Promise<ResultadoAlta> {
  const respuesta = await supabase.from(TABLA).insert(filaParaSubir(alineacion, ultimoCambio)).select('version');
  return resultadoDeAlta(respuesta);
}

/** Sube los cambios solo si el servidor sigue en `versionBase`; si no, no escribe nada. */
export async function actualizarEnServidor(alineacion: Alineacion, versionBase: number, ultimoCambio: string): Promise<ResultadoSubida> {
  const { id, creado_en: _creadoEn, ...cambios } = filaParaSubir(alineacion, ultimoCambio);
  const respuesta = await supabase.from(TABLA).update(cambios).eq('id', id).eq('version', versionBase).select('version');
  if (respuesta.error) throw interpretarError({ error: respuesta.error, status: respuesta.status });
  return resultadoDeSubida(respuesta.data ?? []);
}

/** La marca como borrada (no se borra de verdad), solo si el servidor sigue en `versionBase`. */
export async function marcarEliminadaEnServidor(id: string, versionBase: number, ultimoCambio: string): Promise<ResultadoSubida> {
  const respuesta = await supabase
    .from(TABLA)
    .update({ eliminada_en: new Date().toISOString(), ultimo_cambio: ultimoCambio })
    .eq('id', id)
    .eq('version', versionBase)
    .select('version');
  if (respuesta.error) throw interpretarError({ error: respuesta.error, status: respuesta.status });
  return resultadoDeSubida(respuesta.data ?? []);
}

/** El estado de una alineación en el servidor, o `null` si no existe (o no se puede ver). */
export async function estadoEnServidor(id: string): Promise<EstadoRemoto | null> {
  const respuesta = await supabase.from(TABLA).select(COLUMNAS_ESTADO).eq('id', id).maybeSingle();
  if (respuesta.error) throw interpretarError({ error: respuesta.error, status: respuesta.status });
  return respuesta.data ? estadoDesdeFila(respuesta.data as FilaEstado) : null;
}

/** El estado de todas, incluidas las borradas: hace falta para propagar los borrados. */
export async function listarEstadosEnServidor(): Promise<EstadoRemoto[]> {
  const estados: EstadoRemoto[] = [];
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const respuesta = await supabase
      .from(TABLA)
      .select(COLUMNAS_ESTADO)
      .order('id')
      .range(desde, desde + FILAS_POR_PAGINA - 1);
    if (respuesta.error) throw interpretarError({ error: respuesta.error, status: respuesta.status });
    const filas = (respuesta.data ?? []) as FilaEstado[];
    estados.push(...filas.map(estadoDesdeFila));
    if (filas.length < FILAS_POR_PAGINA) return estados;
  }
}

/** Descarga las alineaciones completas, en tandas para no pasar el largo máximo de la URL. */
export async function descargarDelServidor(ids: string[]): Promise<AlineacionRemota[]> {
  const remotas: AlineacionRemota[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_DESCARGA) {
    const respuesta = await supabase.from(TABLA).select(COLUMNAS_FILA).in('id', ids.slice(i, i + IDS_POR_DESCARGA));
    if (respuesta.error) throw interpretarError({ error: respuesta.error, status: respuesta.status });
    remotas.push(...((respuesta.data ?? []) as FilaAlineacion[]).map(desdeFila));
  }
  return remotas;
}

/** Cuándo cambió por última vez cualquier alineación: comprobación barata antes de mirar más. */
export async function ultimaActualizacionEnServidor(): Promise<string | null> {
  const respuesta = await supabase
    .from(TABLA)
    .select('actualizado_en')
    .order('actualizado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (respuesta.error) throw interpretarError({ error: respuesta.error, status: respuesta.status });
  return (respuesta.data as { actualizado_en: string } | null)?.actualizado_en ?? null;
}
