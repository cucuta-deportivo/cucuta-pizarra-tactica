import { afterEach, describe, expect, it, vi } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { alineacionRepository } from '../data/repositorio';
import { DEBOUNCE_AUTOGUARDADO_MS } from '../utils/constantes';

/**
 * S1.3: un dispositivo sin alineaciones abre una vacía, pero no la guarda hasta
 * el primer cambio. Si la guardara, cada dispositivo nuevo subiría su propia
 * "Alineación inicial" vacía a la lista compartida.
 */
describe('arranque sin alineaciones guardadas', () => {
  afterEach(() => vi.useRealTimers());

  it('abre una alineación vacía y no la guarda hasta el primer cambio', async () => {
    sembrarPlantilla();
    vi.useFakeTimers();

    await useAlineacionStore.getState().inicializar();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_AUTOGUARDADO_MS * 3);

    expect(useAlineacionStore.getState().nombre).toBe('Alineación inicial');
    expect(useAlineacionStore.getState().estadoGuardado).toBe('guardado');
    expect(await alineacionRepository.listar()).toHaveLength(0);

    useAlineacionStore.getState().seleccionarFormacion('4-4-2');
    expect(useAlineacionStore.getState().estadoGuardado).toBe('pendiente');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_AUTOGUARDADO_MS + 10);

    const guardadas = await alineacionRepository.listar();
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0]).toMatchObject({ nombre: 'Alineación inicial', formacionId: '4-4-2' });
  });

  it('si ya hay alineaciones, abre la más reciente sin guardar otra', async () => {
    const antes = await alineacionRepository.listar();
    await useAlineacionStore.getState().inicializar();

    expect(useAlineacionStore.getState().id).toBe(antes[0]!.id);
    expect(await alineacionRepository.listar()).toHaveLength(antes.length);
  });
});
