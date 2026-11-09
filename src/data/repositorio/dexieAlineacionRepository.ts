import type { Alineacion } from '../../types';
import {
  marcarEliminadaPorSubir,
  marcarPorSubir,
  type AlineacionRepository,
  type RegistroSincronizacion,
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

  // Alineación y marca en una sola transacción: nunca queda un cambio guardado sin marcar.
  async guardar(alineacion: Alineacion): Promise<void> {
    await db.transaction('rw', db.alineaciones, db.sincronizacion, async () => {
      const previo = await db.sincronizacion.get(alineacion.id);
      await db.alineaciones.put(alineacion);
      await db.sincronizacion.put(marcarPorSubir(previo, alineacion.id));
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
}
