import type { Alineacion } from '../../types';
import {
  marcarEliminadaPorSubir,
  marcarPorSubir,
  type AlineacionRepository,
  type RegistroSincronizacion,
  type ResumenAlineacion,
} from './AlineacionRepository';

/**
 * Repositorio de respaldo cuando IndexedDB no está disponible (p. ej. dentro de
 * un artefacto de Claude). Vive solo en memoria: el trabajo se pierde al recargar,
 * por eso la UI debe ofrecer exportar/importar JSON como respaldo manual en ese caso.
 */
export class MemoriaAlineacionRepository implements AlineacionRepository {
  private almacen = new Map<string, Alineacion>();
  private registros = new Map<string, RegistroSincronizacion>();

  async listar(): Promise<ResumenAlineacion[]> {
    return [...this.almacen.values()]
      .sort((a, b) => b.modificadaEn.localeCompare(a.modificadaEn))
      .map((a) => ({ id: a.id, nombre: a.nombre, formacionId: a.formacionId, modificadaEn: a.modificadaEn }));
  }

  async obtener(id: string): Promise<Alineacion | undefined> {
    return this.almacen.get(id);
  }

  async guardar(alineacion: Alineacion): Promise<void> {
    this.almacen.set(alineacion.id, alineacion);
    this.registros.set(alineacion.id, marcarPorSubir(this.registros.get(alineacion.id), alineacion.id));
  }

  async eliminar(id: string): Promise<void> {
    this.almacen.delete(id);
    this.registros.set(id, marcarEliminadaPorSubir(this.registros.get(id), id));
  }

  async pendientesDeSubir(): Promise<RegistroSincronizacion[]> {
    return [...this.registros.values()].filter((r) => r.pendiente);
  }

  async actualizarMarca(
    id: string,
    cambio: (actual: RegistroSincronizacion | undefined) => RegistroSincronizacion | null,
  ): Promise<RegistroSincronizacion | null> {
    const nueva = cambio(this.registros.get(id));
    if (nueva) this.registros.set(id, nueva);
    else this.registros.delete(id);
    return nueva;
  }
}
