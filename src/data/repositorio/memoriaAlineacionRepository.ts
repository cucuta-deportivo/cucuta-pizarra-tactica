import type { Alineacion } from '../../types';
import {
  marcarEliminadaPorSubir,
  marcarPorSubir,
  sigueEnLaRevision,
  type AlineacionRepository,
  type CopiaLocal,
  type Escritura,
  type RegistroSincronizacion,
  type ResultadoGuardado,
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

  async abrir(id: string): Promise<{ alineacion: Alineacion; revision: number } | undefined> {
    const alineacion = this.almacen.get(id);
    return alineacion ? { alineacion, revision: this.registros.get(id)?.revision ?? 0 } : undefined;
  }

  async guardar(alineacion: Alineacion, revisionBase?: number): Promise<ResultadoGuardado> {
    const previo = this.registros.get(alineacion.id);
    if (!sigueEnLaRevision(previo, revisionBase)) return { guardada: false };
    const marca = marcarPorSubir(previo, alineacion.id);
    this.almacen.set(alineacion.id, alineacion);
    this.registros.set(alineacion.id, marca);
    return { guardada: true, revision: marca.revision };
  }

  async eliminar(id: string): Promise<void> {
    this.almacen.delete(id);
    this.registros.set(id, marcarEliminadaPorSubir(this.registros.get(id), id));
  }

  async pendientesDeSubir(): Promise<RegistroSincronizacion[]> {
    return [...this.registros.values()].filter((r) => r.pendiente);
  }

  async todasLasMarcas(): Promise<RegistroSincronizacion[]> {
    return [...this.registros.values()];
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

  async reescribir<T>(id: string, cambio: (actual: CopiaLocal) => { escrituras: Escritura[]; resultado: T }): Promise<T> {
    const { escrituras, resultado } = cambio({ alineacion: this.almacen.get(id), marca: this.registros.get(id) });
    for (const escritura of escrituras) {
      if (escritura.alineacion === null) this.almacen.delete(escritura.id);
      else if (escritura.alineacion) this.almacen.set(escritura.id, escritura.alineacion);
      if (escritura.marca === null) this.registros.delete(escritura.id);
      else if (escritura.marca) this.registros.set(escritura.id, escritura.marca);
    }
    return resultado;
  }
}
