import { describe, expect, it } from 'vitest';
import { crearBajador } from '../data/sincronizacion/bajarCambios';
import { buscarPorMigrar, contarSubidas, crearRespaldo, marcarParaSubir } from '../data/sincronizacion/migrar';
import { crearSincronizador } from '../data/sincronizacion/sincronizar';
import { crearSubidor } from '../data/sincronizacion/subirPendientes';
import { MemoriaAlineacionRepository } from '../data/repositorio/memoriaAlineacionRepository';
import { alineacion, ServidorFalso } from './servidorFalso';
import type { Alineacion } from '../types';

/**
 * S1.8: las alineaciones guardadas antes de la sincronización (sin marca) se
 * suben una vez, con su mismo id. Nada se borra de este dispositivo, repetirla
 * no duplica y las vacías sin tocar se quedan aquí.
 */
const esVacia = (a: Alineacion) => a.nombre === 'Alineación inicial';

/** Un dispositivo con datos de antes de S1: alineaciones guardadas sin marca. */
async function conDatosViejos(...nombres: string[]) {
  const local = new MemoriaAlineacionRepository();
  for (const [i, nombre] of nombres.entries()) {
    const id = `vieja-${i + 1}`;
    await local.reescribir(id, () => ({ escrituras: [{ id, alineacion: alineacion(id, nombre) }], resultado: null }));
  }
  const servidor = new ServidorFalso();
  let n = 0;
  const subidor = crearSubidor({ local, remoto: servidor, nuevoId: () => `cambio-${++n}` });
  const bajador = crearBajador({ local, remoto: servidor, copiar: (a) => ({ ...a, id: `copia-${++n}` }) });
  const sincronizador = crearSincronizador({ subidor, bajador, alBajar: () => undefined });
  return { local, servidor, sincronizador };
}

describe('migración de las alineaciones de antes de la sincronización', () => {
  it('por migrar: las que no tienen marca, sin las vacías sin tocar ni las que ya se sincronizan', async () => {
    const { local } = await conDatosViejos('Titular', 'Alineación inicial', 'Contra el líder');
    await local.guardar(alineacion('nueva', 'Hecha después de S1'));

    expect(await buscarPorMigrar(local, esVacia)).toEqual({ ids: ['vieja-1', 'vieja-3'], vacias: 1 });
  });

  it('al migrar, cada una queda por subir con su mismo id y revisión 0; si ya tenía marca, no se toca', async () => {
    const { local } = await conDatosViejos('Titular', 'Contra el líder');
    await local.guardar(alineacion('vieja-2', 'Editada antes de migrar'));

    expect(await marcarParaSubir(local, ['vieja-1', 'vieja-2'])).toEqual(['vieja-1']);
    const marcas = await local.todasLasMarcas();
    expect(marcas.find((m) => m.id === 'vieja-1')).toEqual({
      id: 'vieja-1',
      versionServidor: null,
      pendiente: true,
      eliminada: false,
      revision: 0,
      cambioEnCurso: null,
      revisionEnCurso: null,
      conflicto: false,
    });
    expect(marcas.find((m) => m.id === 'vieja-2')?.revision).toBe(1);
  });

  it('se suben con su mismo id y se cuentan las que llegaron; nada se borra de aquí', async () => {
    const { local, servidor, sincronizador } = await conDatosViejos('Titular', 'Contra el líder');
    const { ids } = await buscarPorMigrar(local, esVacia);

    await marcarParaSubir(local, ids);
    await sincronizador.sincronizar();

    expect([...servidor.filas.keys()].sort()).toEqual(['vieja-1', 'vieja-2']);
    expect(servidor.filas.get('vieja-1')).toMatchObject({ version: 1, alineacion: { nombre: 'Titular' } });
    expect(await contarSubidas(local, ids)).toBe(2);
    expect((await local.listar()).map((a) => a.id).sort()).toEqual(['vieja-1', 'vieja-2']);
  });

  it('repetirla no duplica: lo migrado deja de estar por migrar y el servidor no cambia', async () => {
    const { local, servidor, sincronizador } = await conDatosViejos('Titular');
    await marcarParaSubir(local, (await buscarPorMigrar(local, esVacia)).ids);
    await sincronizador.sincronizar();

    expect(await buscarPorMigrar(local, esVacia)).toEqual({ ids: [], vacias: 0 });
    expect(await marcarParaSubir(local, ['vieja-1'])).toEqual([]);
    await sincronizador.sincronizar();
    expect(servidor.filas.size).toBe(1);
    expect(servidor.filas.get('vieja-1')?.version).toBe(1);
  });

  it('sin red a mitad, las que faltan siguen pendientes y suben en la siguiente vuelta sin duplicar', async () => {
    const { local, servidor, sincronizador } = await conDatosViejos('Titular', 'Contra el líder', 'Copa');
    const { ids } = await buscarPorMigrar(local, esVacia);
    await marcarParaSubir(local, ids);
    const crear = servidor.crear.bind(servidor);
    let altas = 0;
    servidor.crear = async (...args) => {
      if (++altas === 2) servidor.cortarRed('antes');
      return crear(...args);
    };

    expect(await sincronizador.sincronizar()).toMatchObject({ estado: 'sin-conexion', subidas: 1 });
    expect(await contarSubidas(local, ids)).toBe(1);

    await sincronizador.sincronizar();
    expect(await contarSubidas(local, ids)).toBe(3);
    expect(servidor.filas.size).toBe(3);
  });

  it('el respaldo lleva todas las de este dispositivo (también las vacías y las ya sincronizadas), sin enlaces firmados', async () => {
    const { local } = await conDatosViejos('Titular', 'Alineación inicial');
    const conFoto: Alineacion = {
      ...alineacion('nueva', 'Con personalizado'),
      jugadoresPersonalizados: [
        {
          id: 'p1',
          categoriaId: 'x',
          nombre: 'Juan',
          apellido: 'Prueba',
          dorsal: 9,
          posicionNatural: 'DC',
          posicionesSecundarias: [],
          fotoUrl: 'https://ejemplo.supabase.co/storage/v1/object/sign/jugadores/p1.jpg?token=secreto',
          fotoPath: null,
          piePreferido: 'derecho',
          activo: true,
        },
      ],
    };
    await local.guardar(conFoto);

    const respaldo = await crearRespaldo(local, new Date('2026-11-09T12:00:00Z'));
    expect(respaldo).toMatchObject({ formato: 'respaldo-pizarra-cucuta', version: 1, creadoEn: '2026-11-09T12:00:00.000Z' });
    expect(respaldo.alineaciones.map((a) => a.nombre).sort()).toEqual(['Alineación inicial', 'Con personalizado', 'Titular']);
    expect(JSON.stringify(respaldo)).not.toContain('token=');
  });
});
