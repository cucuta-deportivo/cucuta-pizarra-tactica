import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearComprobador, iniciarDisparadores } from '../data/sincronizacion/disparadores';
import { ErrorSinConexion } from '../data/supabase/alineacionesApi';

/**
 * S1.10: la app se sincroniza sola al volver la señal, al volver a la pestaña y
 * cada 45 s mientras se ve, para que la tablet vea los cambios de la oficina en
 * menos de un minuto sin recargar. La comprobación periódica es barata: solo
 * pregunta cuándo cambió algo por última vez.
 */
function entornoFalso() {
  const ventana = new EventTarget();
  const documento = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const mostrar = (estado: DocumentVisibilityState) => {
    documento.visibilityState = estado;
    documento.dispatchEvent(new Event('visibilitychange'));
  };
  return { ventana, documento, mostrar };
}

function preparar() {
  const entorno = entornoFalso();
  const sincronizar = vi.fn();
  const comprobar = vi.fn();
  const alPerderRed = vi.fn();
  const parar = iniciarDisparadores({ sincronizar, comprobar, alPerderRed, entorno, intervaloMs: 45_000 });
  return { ...entorno, sincronizar, comprobar, alPerderRed, parar };
}

describe('cuándo se sincroniza sola', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('al volver la señal, sincroniza; al perderla, lo avisa', () => {
    const { ventana, sincronizar, alPerderRed } = preparar();
    ventana.dispatchEvent(new Event('offline'));
    expect(alPerderRed).toHaveBeenCalledTimes(1);
    ventana.dispatchEvent(new Event('online'));
    expect(sincronizar).toHaveBeenCalledTimes(1);
  });

  it('cada 45 s mientras se ve, comprueba si hay cambios', () => {
    const { comprobar } = preparar();
    vi.advanceTimersByTime(44_999);
    expect(comprobar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(comprobar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(45_000);
    expect(comprobar).toHaveBeenCalledTimes(2);
  });

  it('con la pestaña oculta no comprueba; al volver a verse, comprueba enseguida y sigue cada 45 s', () => {
    const { comprobar, mostrar } = preparar();
    mostrar('hidden');
    vi.advanceTimersByTime(120_000);
    expect(comprobar).not.toHaveBeenCalled();

    mostrar('visible');
    expect(comprobar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(45_000);
    expect(comprobar).toHaveBeenCalledTimes(2);
  });

  it('al pararlos, deja de escuchar y de comprobar', () => {
    const { ventana, sincronizar, comprobar, parar } = preparar();
    parar();
    ventana.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(200_000);
    expect(sincronizar).not.toHaveBeenCalled();
    expect(comprobar).not.toHaveBeenCalled();
  });
});

describe('la comprobación barata', () => {
  function comprobador({ pendientes = 0, ultima = 't1' }: { pendientes?: number; ultima?: string | null } = {}) {
    const sincronizar = vi.fn(async () => undefined);
    const ultimaActualizacion = vi.fn(async () => ultima);
    const c = crearComprobador({ contarPendientes: async () => pendientes, ultimaActualizacion, sincronizar });
    return { c, sincronizar, ultimaActualizacion };
  }

  it('con algo por subir, sincroniza sin preguntar al servidor', async () => {
    const { c, sincronizar, ultimaActualizacion } = comprobador({ pendientes: 1 });
    expect(await c.comprobar()).toBe('sincronizada');
    expect(sincronizar).toHaveBeenCalledTimes(1);
    expect(ultimaActualizacion).not.toHaveBeenCalled();
  });

  it('si el servidor sigue como en la última vuelta, no hace nada más', async () => {
    const { c, sincronizar } = comprobador({ ultima: 't1' });
    c.recordar('t1');
    expect(await c.comprobar()).toBe('sin-cambios');
    expect(sincronizar).not.toHaveBeenCalled();
  });

  it('si cambió algo desde la última vuelta, o no hubo ninguna, sincroniza', async () => {
    const cambiado = comprobador({ ultima: 't2' });
    cambiado.c.recordar('t1');
    expect(await cambiado.c.comprobar()).toBe('sincronizada');

    const primera = comprobador({ ultima: null });
    expect(await primera.c.comprobar()).toBe('sincronizada');
  });

  it('sin red, la comprobación falla con "sin conexión" y no sincroniza', async () => {
    const sincronizar = vi.fn(async () => undefined);
    const c = crearComprobador({
      contarPendientes: async () => 0,
      ultimaActualizacion: async () => {
        throw new ErrorSinConexion();
      },
      sincronizar,
    });
    await expect(c.comprobar()).rejects.toBeInstanceOf(ErrorSinConexion);
    expect(sincronizar).not.toHaveBeenCalled();
  });
});
