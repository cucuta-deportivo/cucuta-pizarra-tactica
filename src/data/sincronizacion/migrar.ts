import type { Alineacion } from '../../types';
import type { AlineacionRepository, RegistroSincronizacion } from '../repositorio/AlineacionRepository';

/**
 * Migración (S1.8): las alineaciones guardadas en este dispositivo antes de la
 * sincronización no tienen marca. Se suben una vez, con su mismo id, por el
 * camino normal de la subida. Nada se borra de aquí y repetirla no duplica: una
 * vez marcada, ya no está "por migrar". Las vacías sin tocar se quedan aquí.
 */

export type LocalMigracion = Pick<AlineacionRepository, 'listar' | 'obtener' | 'todasLasMarcas' | 'reescribir'>;

export interface PorMigrar {
  ids: string[];
  /** Vacías sin tocar: no se suben, se quedan solo en este dispositivo. */
  vacias: number;
}

export interface Respaldo {
  formato: 'respaldo-pizarra-cucuta';
  version: 1;
  creadoEn: string;
  alineaciones: Alineacion[];
}

export const FORMATO_RESPALDO = 'respaldo-pizarra-cucuta';

export async function buscarPorMigrar(local: LocalMigracion, esVacia: (alineacion: Alineacion) => boolean): Promise<PorMigrar> {
  const [resumenes, marcas] = await Promise.all([local.listar(), local.todasLasMarcas()]);
  const conMarca = new Set(marcas.map((m) => m.id));
  const ids: string[] = [];
  let vacias = 0;
  for (const { id } of resumenes) {
    if (conMarca.has(id)) continue;
    const alineacion = await local.obtener(id);
    if (!alineacion) continue;
    if (esVacia(alineacion)) vacias += 1;
    else ids.push(id);
  }
  return { ids, vacias };
}

/**
 * Por subir con su mismo id. Revisión 0, la misma con la que la pizarra abre una
 * alineación sin marca: si está abierta, sigue guardando sin hacer copia.
 */
export function marcaDeMigracion(id: string): RegistroSincronizacion {
  return { id, versionServidor: null, pendiente: true, eliminada: false, revision: 0, cambioEnCurso: null, revisionEnCurso: null, conflicto: false };
}

/** Marca por subir las que sigan sin marca (si se guardó alguna mientras tanto, ya la tiene). Devuelve las marcadas. */
export async function marcarParaSubir(local: LocalMigracion, ids: string[]): Promise<string[]> {
  const marcadas: string[] = [];
  for (const id of ids) {
    const marcada = await local.reescribir(id, ({ alineacion, marca }) =>
      alineacion && !marca ? { escrituras: [{ id, marca: marcaDeMigracion(id) }], resultado: true } : { escrituras: [], resultado: false },
    );
    if (marcada) marcadas.push(id);
  }
  return marcadas;
}

/** Cuántas de `ids` ya están en el servidor, al día y sin nada pendiente. */
export async function contarSubidas(local: Pick<LocalMigracion, 'todasLasMarcas'>, ids: string[]): Promise<number> {
  const marcaDe = new Map((await local.todasLasMarcas()).map((m) => [m.id, m]));
  return ids.filter((id) => {
    const marca = marcaDe.get(id);
    return marca !== undefined && !marca.pendiente && marca.versionServidor !== null;
  }).length;
}

/** Todas las alineaciones de este dispositivo, sin enlaces firmados de fotos (caducan y dan acceso a fotos privadas). */
export async function crearRespaldo(local: Pick<LocalMigracion, 'listar' | 'obtener'>, fecha = new Date()): Promise<Respaldo> {
  const alineaciones: Alineacion[] = [];
  for (const { id } of await local.listar()) {
    const alineacion = await local.obtener(id);
    if (!alineacion) continue;
    alineaciones.push({
      ...alineacion,
      jugadoresPersonalizados: alineacion.jugadoresPersonalizados?.map((j) => ({ ...j, fotoUrl: null })),
    });
  }
  return { formato: FORMATO_RESPALDO, version: 1, creadoEn: fecha.toISOString(), alineaciones };
}
