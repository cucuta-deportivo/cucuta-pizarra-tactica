import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alineacionRepository } from '../data/repositorio';
import { decidirBajada, type CambioBajado } from '../data/sincronizacion/bajarCambios';
import { useAlineacionStore } from '../store/alineacionStore';
import { useUiStore } from '../store/uiStore';
import { copiaPorConflicto } from '../utils/copias';
import { DEBOUNCE_AUTOGUARDADO_MS } from '../utils/constantes';
import { alineacion } from './servidorFalso';
import { sembrarPlantilla } from './fixturePlantilla';

/**
 * S1.7 en la pizarra: lo que baja del servidor se ve sin pisar nunca lo que se
 * está editando. Sin cambios aquí, la versión nueva se carga sola con un aviso
 * y se reinicia el deshacer. Con cambios, lo de aquí pasa a una copia y la
 * pizarra sigue en ella.
 */
const pizarra = () => useAlineacionStore.getState();
const avisos = () => useUiStore.getState().toasts.map((t) => t.mensaje);
const autoguardar = () => vi.advanceTimersByTimeAsync(DEBOUNCE_AUTOGUARDADO_MS + 10);

/** Como si ya estuviera subida en esa versión, sin nada pendiente. */
const subida = (id: string, version: number) =>
  alineacionRepository.actualizarMarca(id, (m) => (m ? { ...m, versionServidor: version, pendiente: false } : null));

/** Aplica aquí lo que bajaría del servidor, como lo hace la sincronización. */
async function bajar(id: string, version: number, cambios: { nombre?: string; eliminada?: boolean }): Promise<CambioBajado> {
  const remota = { id, version, ultimoCambio: `otro-${version}`, eliminada: cambios.eliminada ?? false, alineacion: alineacion(id, cambios.nombre) };
  const cambio = await alineacionRepository.reescribir(id, (actual) => decidirBajada(actual, remota, (a) => copiaPorConflicto(a)));
  return cambio!;
}

async function abrirSubida(id: string, nombre: string) {
  await alineacionRepository.guardar(alineacion(id, nombre));
  await subida(id, 1);
  await pizarra().cargarAlineacion(id);
}

describe('la pizarra con lo que baja de otros dispositivos', () => {
  beforeEach(() => {
    sembrarPlantilla();
    vi.useFakeTimers();
    useUiStore.setState({ toasts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('guardar varias veces seguidas no crea copias: cada guardado parte del anterior', async () => {
    await abrirSubida('g1', 'Del sábado');
    pizarra().renombrar('Uno');
    await autoguardar();
    pizarra().renombrar('Dos');
    await Promise.all([pizarra().guardarAhora(), pizarra().guardarAhora()]);

    expect(pizarra().id).toBe('g1');
    expect((await alineacionRepository.obtener('g1'))?.nombre).toBe('Dos');
    expect((await alineacionRepository.listar()).filter((a) => a.nombre.includes('copia'))).toEqual([]);
  });

  it('sin cambios aquí, la versión nueva de la abierta se carga sola, avisa y reinicia el deshacer', async () => {
    await abrirSubida('p1', 'Del sábado');
    pizarra().seleccionarFormacion('4-4-2');
    await autoguardar();
    await subida('p1', 2);
    expect(pizarra().puedeDeshacer()).toBe(true);

    await pizarra().aplicarCambiosDelServidor([await bajar('p1', 3, { nombre: 'De la oficina' })]);

    expect(pizarra().nombre).toBe('De la oficina');
    expect(pizarra().historial.presente.formacionId).toBe('4-3-3');
    expect(pizarra().puedeDeshacer()).toBe(false);
    expect(avisos()).toContain('«De la oficina» se actualizó con cambios de otro dispositivo.');
  });

  it('con cambios sin guardar no se recarga; al guardar, lo de aquí pasa a copia y la pizarra sigue en ella', async () => {
    await abrirSubida('p2', 'Del sábado');
    pizarra().renombrar('Mi versión');

    await pizarra().aplicarCambiosDelServidor([await bajar('p2', 2, { nombre: 'De la oficina' })]);
    expect(pizarra().nombre).toBe('Mi versión');

    await autoguardar();
    const copia = pizarra().id;
    expect(copia).not.toBe('p2');
    expect(pizarra().nombre).toMatch(/^Mi versión \(copia computador \d+ \w+ \d\d:\d\d\)$/);
    expect((await alineacionRepository.obtener('p2'))?.nombre).toBe('De la oficina');
    expect((await alineacionRepository.obtener(copia))?.nombre).toBe(pizarra().nombre);
    expect(avisos().some((a) => a.startsWith('«Mi versión» cambió en otra ventana o dispositivo'))).toBe(true);
    expect(useUiStore.getState().toasts.find((t) => t.mensaje.includes('cambió en otra ventana'))?.fijo).toBe(true);

    pizarra().renombrar('Sigo en la copia');
    await autoguardar();
    expect(pizarra().id).toBe(copia);
    expect((await alineacionRepository.obtener(copia))?.nombre).toBe('Sigo en la copia');
  });

  it('si al bajar lo de aquí pasó a copia, la pizarra sigue en la copia y conserva el deshacer', async () => {
    await abrirSubida('p3', 'Del sábado');
    pizarra().seleccionarFormacion('4-4-2');
    await autoguardar();

    const cambio = await bajar('p3', 2, { nombre: 'De la oficina' });
    expect(cambio.tipo).toBe('copia');
    await pizarra().aplicarCambiosDelServidor([cambio]);

    const copia = cambio.tipo === 'copia' ? cambio.copia : null;
    expect(pizarra()).toMatchObject({ id: copia?.id, nombre: copia?.nombre });
    expect(pizarra().puedeDeshacer()).toBe(true);
    expect((await alineacionRepository.obtener('p3'))?.nombre).toBe('De la oficina');
    expect(avisos()).toContain(`Otro dispositivo cambió «Del sábado» antes. Tus cambios quedaron en «${copia?.nombre}».`);

    pizarra().renombrar('Sigo aquí');
    await autoguardar();
    expect(pizarra().id).toBe(copia?.id);
    expect((await alineacionRepository.listar()).filter((a) => a.nombre.startsWith('Sigo aquí'))).toHaveLength(1);
  });

  it('borrada en otro dispositivo y sin cambios aquí: abre otra y avisa', async () => {
    await alineacionRepository.guardar(alineacion('p4-otra', 'Otra'));
    await abrirSubida('p4', 'Se borra');

    await pizarra().aplicarCambiosDelServidor([await bajar('p4', 2, { eliminada: true })]);

    expect(pizarra().id).not.toBe('p4');
    expect(await alineacionRepository.obtener('p4')).toBeUndefined();
    expect(avisos()).toContain('«Se borra» se borró en otro dispositivo.');
  });

  it('borrada la única: abre una vacía que no se guarda hasta el primer cambio', async () => {
    for (const { id } of await alineacionRepository.listar()) {
      await alineacionRepository.reescribir(id, () => ({ escrituras: [{ id, alineacion: null, marca: null }], resultado: null }));
    }
    await abrirSubida('p5', 'La única');

    await pizarra().aplicarCambiosDelServidor([await bajar('p5', 2, { eliminada: true })]);
    await autoguardar();

    expect(pizarra()).toMatchObject({ nombre: 'Alineación inicial', estadoGuardado: 'guardado' });
    expect(await alineacionRepository.listar()).toEqual([]);
  });

  it('lo que cambia en otras alineaciones solo refresca la lista, sin tocar la abierta ni avisar', async () => {
    await abrirSubida('p6', 'Abierta');
    await alineacionRepository.guardar(alineacion('p6-otra', 'Antes'));
    await subida('p6-otra', 1);

    await pizarra().aplicarCambiosDelServidor([await bajar('p6-otra', 2, { nombre: 'Cambiada fuera' })]);

    expect(pizarra().nombre).toBe('Abierta');
    expect(pizarra().listado.map((a) => a.nombre)).toContain('Cambiada fuera');
    expect(avisos()).toEqual([]);
  });
});
