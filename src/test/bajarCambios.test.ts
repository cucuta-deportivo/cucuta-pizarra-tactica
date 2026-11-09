import { describe, expect, it } from 'vitest';
import { crearBajador, decidirBajada, type CambioBajado } from '../data/sincronizacion/bajarCambios';
import { crearSincronizador } from '../data/sincronizacion/sincronizar';
import { crearSubidor } from '../data/sincronizacion/subirPendientes';
import { marcarPorSubir, type RegistroSincronizacion } from '../data/repositorio/AlineacionRepository';
import { MemoriaAlineacionRepository } from '../data/repositorio/memoriaAlineacionRepository';
import { ErrorSinConexion } from '../data/supabase/alineacionesApi';
import { alineacion, ServidorFalso } from './servidorFalso';
import type { Alineacion } from '../types';

/**
 * S1.7: bajar lo que cambió en otros dispositivos. Regla aprobada: nada se pisa.
 * El primero que sube se queda con la alineación y el otro conserva su trabajo
 * como copia. Borrar contra editar: gana la edición.
 */
function dispositivo(servidor: ServidorFalso, nombre: string) {
  const local = new MemoriaAlineacionRepository();
  let n = 0;
  const copiar = (a: Alineacion): Alineacion => ({ ...a, id: `${nombre}-copia-${++n}`, nombre: `${a.nombre} (copia ${nombre})` });
  const subidor = crearSubidor({ local, remoto: servidor, nuevoId: () => `${nombre}-cambio-${++n}` });
  const bajador = crearBajador({ local, remoto: servidor, copiar });
  const avisos: CambioBajado[] = [];
  const sincronizador = crearSincronizador({ subidor, bajador, alBajar: (cambios) => avisos.push(...cambios) });
  const marca = async (id: string) => (await local.todasLasMarcas()).find((m) => m.id === id);
  const nombres = async () => (await local.listar()).map((a) => a.nombre).sort();
  return { local, subidor, bajador, sincronizador, avisos, marca, nombres };
}

async function conLaOficina(nombre = 'Titular del sábado') {
  const servidor = new ServidorFalso();
  servidor.crearDesdeOtroDispositivo(alineacion('a', nombre));
  const tablet = dispositivo(servidor, 'tablet');
  await tablet.bajador.bajar();
  return { servidor, tablet };
}

describe('bajar cambios de otros dispositivos', () => {
  it('una alineación nueva de otro dispositivo aparece aquí, al día y sin nada por subir', async () => {
    const servidor = new ServidorFalso();
    servidor.crearDesdeOtroDispositivo(alineacion('a', 'De la oficina'));
    const tablet = dispositivo(servidor, 'tablet');

    expect(await tablet.bajador.bajar()).toEqual([{ tipo: 'nueva', id: 'a', nombre: 'De la oficina' }]);
    expect((await tablet.local.obtener('a'))?.nombre).toBe('De la oficina');
    expect(await tablet.marca('a')).toMatchObject({ versionServidor: 1, pendiente: false, conflicto: false });
    expect(await tablet.local.pendientesDeSubir()).toEqual([]);
  });

  it('sin cambios aquí, la versión nueva del servidor reemplaza la local', async () => {
    const { servidor, tablet } = await conLaOficina();
    servidor.cambiarDesdeOtroDispositivo('a', 'Cambiada en la oficina');

    expect(await tablet.bajador.bajar()).toEqual([{ tipo: 'actualizada', id: 'a', nombre: 'Cambiada en la oficina' }]);
    expect((await tablet.local.obtener('a'))?.nombre).toBe('Cambiada en la oficina');
    expect(await tablet.marca('a')).toMatchObject({ versionServidor: 2, pendiente: false });
  });

  it('si todo está al día, solo pregunta el estado: no descarga ningún documento', async () => {
    const { servidor, tablet } = await conLaOficina();
    const antes = servidor.llamadas;

    expect(await tablet.bajador.bajar()).toEqual([]);
    expect(servidor.llamadas - antes).toBe(1);
  });

  it('con cambios aquí sin subir, el primero se queda: lo de aquí pasa a una copia por subir y la original toma la del servidor', async () => {
    const { servidor, tablet } = await conLaOficina();
    servidor.cambiarDesdeOtroDispositivo('a', 'De la oficina');
    await tablet.local.guardar(alineacion('a', 'De la tablet'));

    const [cambio] = await tablet.bajador.bajar();
    expect(cambio).toMatchObject({
      tipo: 'copia',
      id: 'a',
      nombre: 'De la tablet',
      borradaEnServidor: false,
      copia: { nombre: 'De la tablet (copia tablet)', revision: 1 },
    });
    const copia = cambio?.tipo === 'copia' ? cambio.copia.id : '';
    expect((await tablet.local.obtener('a'))?.nombre).toBe('De la oficina');
    expect(await tablet.marca('a')).toMatchObject({ versionServidor: 2, pendiente: false });
    expect((await tablet.local.obtener(copia))?.nombre).toBe('De la tablet (copia tablet)');
    expect(await tablet.marca(copia)).toMatchObject({ versionServidor: null, pendiente: true });
  });

  it('borrada en otro dispositivo y sin cambios aquí: se borra aquí, sin dejar nada por subir', async () => {
    const { servidor, tablet } = await conLaOficina();
    servidor.borrarDesdeOtroDispositivo('a');

    expect(await tablet.bajador.bajar()).toEqual([{ tipo: 'borrada', id: 'a', nombre: 'Titular del sábado' }]);
    expect(await tablet.local.obtener('a')).toBeUndefined();
    expect(await tablet.local.todasLasMarcas()).toEqual([]);
  });

  it('borrada en otro dispositivo con cambios aquí: gana la edición, que queda como copia', async () => {
    const { servidor, tablet } = await conLaOficina();
    servidor.borrarDesdeOtroDispositivo('a');
    await tablet.local.guardar(alineacion('a', 'Editada en la tablet'));

    expect(await tablet.bajador.bajar()).toMatchObject([{ tipo: 'copia', borradaEnServidor: true }]);
    expect(await tablet.local.obtener('a')).toBeUndefined();
    expect(await tablet.nombres()).toEqual(['Editada en la tablet (copia tablet)']);
    expect(await tablet.local.pendientesDeSubir()).toHaveLength(1);
  });

  it('una borrada en el servidor que nunca estuvo aquí no se crea', async () => {
    const servidor = new ServidorFalso();
    servidor.crearDesdeOtroDispositivo(alineacion('a'));
    servidor.borrarDesdeOtroDispositivo('a');
    const tablet = dispositivo(servidor, 'tablet');

    expect(await tablet.bajador.bajar()).toEqual([]);
    expect(await tablet.local.listar()).toEqual([]);
  });

  it('una subida propia cuya respuesta se perdió no se toma por un cambio de otro dispositivo', async () => {
    const { servidor, tablet } = await conLaOficina();
    await tablet.local.guardar(alineacion('a', 'Cambio de la tablet'));
    servidor.cortarRed('despues');
    expect(await tablet.subidor.subir()).toMatchObject({ estado: 'sin-conexion' });

    expect(await tablet.bajador.bajar()).toEqual([]);
    expect(await tablet.nombres()).toEqual(['Cambio de la tablet']);
    expect(await tablet.subidor.subir()).toMatchObject({ estado: 'al-dia', subidas: 1, conflictos: 0 });
    expect(await tablet.marca('a')).toMatchObject({ versionServidor: 2, pendiente: false });
  });

  it('lo que el servidor ya no tiene no se toca aquí (borrado por SQL, o la cuenta dejó de verlo)', async () => {
    const { servidor, tablet } = await conLaOficina();
    servidor.filas.delete('a');

    expect(await tablet.bajador.bajar()).toEqual([]);
    expect(await tablet.nombres()).toEqual(['Titular del sábado']);
  });

  it('una alineación de antes de la sincronización (sin marca) no se toca aunque el servidor tenga ese id', async () => {
    const servidor = new ServidorFalso();
    servidor.crearDesdeOtroDispositivo(alineacion('a', 'Del servidor'));
    const tablet = dispositivo(servidor, 'tablet');
    await tablet.local.reescribir('a', () => ({ escrituras: [{ id: 'a', alineacion: alineacion('a', 'De antes de S1') }], resultado: null }));

    expect(await tablet.bajador.bajar()).toEqual([]);
    expect(await tablet.nombres()).toEqual(['De antes de S1']);
  });

  it('sin red no cambia nada aquí', async () => {
    const { servidor, tablet } = await conLaOficina();
    servidor.cambiarDesdeOtroDispositivo('a', 'De la oficina');
    servidor.cortarRed('antes');

    await expect(tablet.bajador.bajar()).rejects.toBeInstanceOf(ErrorSinConexion);
    expect(await tablet.nombres()).toEqual(['Titular del sábado']);
  });
});

describe('decidir con lo leído al aplicar, no con lo que se listó', () => {
  const remota = { id: 'a', version: 3, ultimoCambio: 'de-otro', eliminada: false, alineacion: alineacion('a', 'Del servidor') };
  const copiar = (a: Alineacion): Alineacion => ({ ...a, id: 'copia', nombre: `${a.nombre} (copia)` });
  const limpia: RegistroSincronizacion = { ...marcarPorSubir(undefined, 'a'), versionServidor: 2, pendiente: false };

  it('si se guardó algo aquí después de listar, se hace la copia en vez de reemplazar', () => {
    const { resultado } = decidirBajada({ alineacion: alineacion('a', 'Recién guardada'), marca: { ...limpia, pendiente: true, revision: 2 } }, remota, copiar);
    expect(resultado).toMatchObject({ tipo: 'copia', copia: { id: 'copia', nombre: 'Recién guardada (copia)' } });
  });

  it('la marca nueva cuenta un cambio más: lo que estuviera abierto desde la revisión anterior no la pisa', () => {
    const { escrituras } = decidirBajada({ alineacion: alineacion('a'), marca: limpia }, remota, copiar);
    expect(escrituras).toEqual([
      { id: 'a', alineacion: remota.alineacion, marca: { ...limpia, versionServidor: 3, revision: limpia.revision + 1 } },
    ]);
  });

  it('si ya está en esa versión, nada', () => {
    expect(decidirBajada({ alineacion: alineacion('a'), marca: { ...limpia, versionServidor: 3 } }, remota, copiar)).toEqual({
      escrituras: [],
      resultado: null,
    });
  });
});

describe('sincronizar: subir y después bajar', () => {
  it('dos dispositivos con la misma alineación terminan iguales: la original con lo que subió primero y una copia con lo del otro', async () => {
    const servidor = new ServidorFalso();
    const oficina = dispositivo(servidor, 'oficina');
    const tablet = dispositivo(servidor, 'tablet');
    await oficina.local.guardar(alineacion('a', 'Titular'));
    await oficina.sincronizador.sincronizar();
    await tablet.sincronizador.sincronizar();

    await oficina.local.guardar(alineacion('a', 'Cambio de la oficina'));
    await tablet.local.guardar(alineacion('a', 'Cambio de la tablet'));
    await oficina.sincronizador.sincronizar();
    expect(await tablet.sincronizador.sincronizar()).toMatchObject({ estado: 'al-dia' });
    await oficina.sincronizador.sincronizar();

    const esperado = ['Cambio de la oficina', 'Cambio de la tablet (copia tablet)'];
    expect(await oficina.nombres()).toEqual(esperado);
    expect(await tablet.nombres()).toEqual(esperado);
    expect(await oficina.local.pendientesDeSubir()).toEqual([]);
    expect(await tablet.local.pendientesDeSubir()).toEqual([]);
    expect([...servidor.filas.values()].map((f) => f.alineacion.nombre).sort()).toEqual(esperado);
    expect(tablet.avisos).toMatchObject([{ tipo: 'nueva' }, { tipo: 'copia', nombre: 'Cambio de la tablet' }]);
  });

  it('borrar aquí lo que otro dispositivo editó: gana la edición y vuelve a aparecer aquí', async () => {
    const { servidor, tablet } = await conLaOficina();
    await tablet.local.eliminar('a');
    servidor.cambiarDesdeOtroDispositivo('a', 'Editada en la oficina');

    await tablet.sincronizador.sincronizar();
    expect(await tablet.nombres()).toEqual(['Editada en la oficina']);
    expect(servidor.filas.get('a')).toMatchObject({ eliminada: false, version: 2 });
    expect(await tablet.local.pendientesDeSubir()).toEqual([]);
  });

  it('sin red no se baja nada y lo pendiente sigue por subir', async () => {
    const { servidor, tablet } = await conLaOficina();
    await tablet.local.guardar(alineacion('a', 'Sin red'));
    servidor.cortarRed('antes');

    expect(await tablet.sincronizador.sincronizar()).toMatchObject({ estado: 'sin-conexion', cambios: [] });
    expect(await tablet.local.pendientesDeSubir()).toHaveLength(1);
  });

  it('si se corta la red al bajar, lo subido cuenta y se avisa sin conexión', async () => {
    const { servidor, tablet } = await conLaOficina();
    await tablet.local.guardar(alineacion('a', 'Subida'));
    const subir = servidor.actualizar.bind(servidor);
    servidor.actualizar = async (...args) => {
      const resultado = await subir(...args);
      servidor.cortarRed('antes');
      return resultado;
    };

    expect(await tablet.sincronizador.sincronizar()).toMatchObject({ estado: 'sin-conexion', subidas: 1, cambios: [] });
    expect(servidor.filas.get('a')?.alineacion.nombre).toBe('Subida');
  });

  it('dos vueltas a la vez no hacen dos copias', async () => {
    const { servidor, tablet } = await conLaOficina();
    servidor.cambiarDesdeOtroDispositivo('a', 'De la oficina');
    await tablet.local.guardar(alineacion('a', 'De la tablet'));

    await Promise.all([tablet.sincronizador.sincronizar(), tablet.sincronizador.sincronizar()]);
    expect(await tablet.nombres()).toEqual(['De la oficina', 'De la tablet (copia tablet)']);
    expect(servidor.filas.size).toBe(2);
  });
});
