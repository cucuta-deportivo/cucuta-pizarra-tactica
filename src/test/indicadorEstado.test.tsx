import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describirEstado, IndicadorEstado } from '../components/ui/IndicadorEstado';
import { ToastContainer } from '../components/ui/ToastContainer';
import { estadoTrasVuelta, useSincronizacionStore, type SincronizacionState } from '../store/sincronizacionStore';
import { useAlineacionStore } from '../store/alineacionStore';
import { useUiStore } from '../store/uiStore';

/**
 * S1.9: el indicador dice si lo de aquí está guardado y si está en Supabase. Se
 * toca para sincronizar en el momento (en la tablet no hay que esperar).
 */
const sincronizacion = (cambios: Partial<SincronizacionState> = {}): SincronizacionState => ({
  estado: 'al-dia',
  pendientes: 0,
  mensaje: null,
  ultimaVez: null,
  ...cambios,
});

describe('qué dice el indicador', () => {
  it('lo de guardar en este dispositivo va primero', () => {
    expect(describirEstado('error', sincronizacion()).texto).toBe('Error al guardar');
    expect(describirEstado('pendiente', sincronizacion()).texto).toBe('Guardando…');
    expect(describirEstado('guardando', sincronizacion({ estado: 'sin-conexion' })).texto).toBe('Guardando…');
  });

  it('sin sincronización (sin Supabase o sin cuenta activa), como antes', () => {
    expect(describirEstado('guardado', sincronizacion({ estado: 'inactiva' })).texto).toBe('Guardado');
  });

  it('con sincronización', () => {
    expect(describirEstado('guardado', sincronizacion()).texto).toBe('Sincronizado');
    expect(describirEstado('guardado', sincronizacion({ pendientes: 2 })).texto).toBe('Guardado · 2 por subir');
    expect(describirEstado('guardado', sincronizacion({ estado: 'sincronizando' })).texto).toBe('Sincronizando…');
    expect(describirEstado('guardado', sincronizacion({ estado: 'sin-conexion', pendientes: 3 })).texto).toBe('Sin conexión · 3 por subir');
    expect(describirEstado('guardado', sincronizacion({ estado: 'sin-conexion' })).texto).toBe('Sin conexión');
    expect(describirEstado('guardado', sincronizacion({ estado: 'error', mensaje: 'permiso denegado' }))).toMatchObject({
      texto: 'Error al sincronizar',
      detalle: 'permiso denegado',
    });
  });

  it('el estado tras una vuelta: al día guarda la hora; sin conexión o con error, no', () => {
    const ahora = new Date('2026-11-09T18:40:00Z');
    expect(estadoTrasVuelta({ estado: 'al-dia' }, 0, ahora)).toEqual({ estado: 'al-dia', pendientes: 0, mensaje: null, ultimaVez: ahora.toISOString() });
    expect(estadoTrasVuelta({ estado: 'sin-conexion' }, 2, ahora)).toEqual({ estado: 'sin-conexion', pendientes: 2, mensaje: null });
    expect(estadoTrasVuelta({ estado: 'error', mensaje: 'x' }, 1, ahora)).toEqual({ estado: 'error', pendientes: 1, mensaje: 'x' });
  });
});

describe('el indicador en la pantalla', () => {
  it('muestra el estado y, al tocarlo, sincroniza', async () => {
    const usuario = userEvent.setup();
    useAlineacionStore.setState({ estadoGuardado: 'guardado' });
    useSincronizacionStore.setState(sincronizacion({ estado: 'sin-conexion', pendientes: 1 }));
    const sincronizar = vi.fn();
    render(<IndicadorEstado onSincronizar={sincronizar} />);

    const boton = screen.getByRole('button', { name: /Sin conexión · 1 por subir/ });
    await usuario.click(boton);
    expect(sincronizar).toHaveBeenCalledTimes(1);
  });

  it('si esta cuenta no sincroniza, no es un botón', () => {
    useAlineacionStore.setState({ estadoGuardado: 'guardado' });
    useSincronizacionStore.setState(sincronizacion({ estado: 'inactiva' }));
    render(<IndicadorEstado onSincronizar={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Guardado')).toBeInTheDocument();
  });
});

describe('los avisos no tapan la barra inferior', () => {
  it('se colocan a la altura que se les pide', () => {
    useUiStore.setState({ toasts: [{ id: 't', tipo: 'info', mensaje: 'Hola' }] });
    render(<ToastContainer abajo={84} />);
    expect(screen.getByText('Hola').closest('[aria-live]')).toHaveStyle({ bottom: '84px' });
  });
});
