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
import { db } from './db';

export class DexieAlineacionRepository implements AlineacionRepository {
  async listar(): Promise<ResumenAlineacion[]> {
    const registros = await db.alineaciones.orderBy('modificadaEn').reverse().toArray();
    return registros.map((a) => ({ id: a.id, nombre: a.nombre, formacionId: a.formacionId, modificadaEn: a.modificadaEn }));
  }

  async obtener(id: string): Promise<Alineacion | undefined> {
    return db.alineaciones.get(id);
  }

  async abrir(id: string): Promise<{ alineacion: Alineacion; revision: number } | undefined> {
    return db.transaction('r', db.alineaciones, db.sincronizacion, async () => {
      const alineacion = await db.alineaciones.get(id);
      if (!alineacion) return undefined;
      return { alineacion, revision: (await db.sincronizacion.get(id))?.revision ?? 0 };
    });
  }

  // Alineación y marca en una sola transacción: nunca queda un cambio guardado sin marcar.
  async guardar(alineacion: Alineacion, revisionBase?: number): Promise<ResultadoGuardado> {
    return db.transaction('rw', db.alineaciones, db.sincronizacion, async (): Promise<ResultadoGuardado> => {
      const previo = await db.sincronizacion.get(alineacion.id);
      if (!sigueEnLaRevision(previo, revisionBase)) return { guardada: false };
      const marca = marcarPorSubir(previo, alineacion.id);
      await db.alineaciones.put(alineacion);
      await db.sincronizacion.put(marca);
      return { guardada: true, revision: marca.revision };
    });
  }

  async eliminar(id: string): Promise<void> {
    await db.transaction('rw', db.alineaciones, db.sincronizacion, async () => {
      const previo = await db.sincronizacion.get(id);
      await db.alineaciones.delete(id);
      await db.sincronizacion.put(marcarEliminadaPorSubir(previo, id));
    });
  }

  async pendientesDeSubir(): Promise<RegistroSincronizacion[]> {
    return (await db.sincronizacion.toArray()).filter((r) => r.pendiente);
  }

  async todasLasMarcas(): Promise<RegistroSincronizacion[]> {
    return db.sincronizacion.toArray();
  }

  async actualizarMarca(
    id: string,
    cambio: (actual: RegistroSincronizacion | undefined) => RegistroSincronizacion | null,
  ): Promise<RegistroSincronizacion | null> {
    return db.transaction('rw', db.sincronizacion, async () => {
      const nueva = cambio(await db.sincronizacion.get(id));
      if (nueva) await db.sincronizacion.put(nueva);
      else await db.sincronizacion.delete(id);
      return nueva;
    });
  }

  async reescribir<T>(id: string, cambio: (actual: CopiaLocal) => { escrituras: Escritura[]; resultado: T }): Promise<T> {
    return db.transaction('rw', db.alineaciones, db.sincronizacion, async () => {
      const alineacion = await db.alineaciones.get(id);
      const marca = await db.sincronizacion.get(id);
      const { escrituras, resultado } = cambio({ alineacion, marca });
      for (const escritura of escrituras) {
        if (escritura.alineacion === null) await db.alineaciones.delete(escritura.id);
        else if (escritura.alineacion) await db.alineaciones.put(escritura.alineacion);
        if (escritura.marca === null) await db.sincronizacion.delete(escritura.id);
        else if (escritura.marca) await db.sincronizacion.put(escritura.marca);
      }
      return resultado;
    });
  }
}
