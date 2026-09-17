import type { AlineacionRepository } from './AlineacionRepository';
import { DexieAlineacionRepository } from './dexieAlineacionRepository';
import { MemoriaAlineacionRepository } from './memoriaAlineacionRepository';

export type { AlineacionRepository, ResumenAlineacion } from './AlineacionRepository';

function indexedDBDisponible(): boolean {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Las alineaciones siguen en IndexedDB. La plantilla ya NO: vive solo en
 * Supabase, así que los repositorios locales de jugadores y fotos se retiraron
 * para que no quedaran dos sitios donde gestionar lo mismo.
 */
export const alineacionRepository: AlineacionRepository = indexedDBDisponible()
  ? new DexieAlineacionRepository()
  : new MemoriaAlineacionRepository();
