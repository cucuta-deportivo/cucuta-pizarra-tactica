import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * Pantalla «Cuentas»: lista las cuentas por estado y aprueba o rechaza solo las pendientes,
 * siempre con confirmación y por las funciones de la base (aprobar_usuario, rechazar_usuario).
 */
const base = vi.hoisted(() => ({
  lecturas: [] as Array<{ tabla: string; columnas: unknown }>,
  rpc: vi.fn(),
  filas: [] as unknown[],
}));

vi.mock('../lib/supabaseClient', () => ({
  supabaseConfigurado: true,
  establecerRecordarDispositivo: vi.fn(),
  supabase: {
    from: (tabla: string) => {
      const lectura = { tabla, columnas: undefined as unknown };
      base.lecturas.push(lectura);
      const consulta: Record<string, unknown> = {
        select: (columnas: unknown) => {
          lectura.columnas = columnas;
          return consulta;
        },
        order: () => consulta,
        then: (resolver: (valor: unknown) => void) => resolver({ data: base.filas, error: null }),
      };
      return consulta;
    },
    rpc: base.rpc,
  },
}));

import { PanelCuentas } from '../components/auth/PanelCuentas';
import { useAuthStore } from '../store/authStore';

const cuenta = (id: string, usuario: string, estado: string) => ({
  id,
  usuario,
  nombre_completo: `Nombre ${usuario}`,
  estado,
  creado_en: '2026-11-19T15:00:00Z',
});

describe('Pantalla «Cuentas»', () => {
  beforeEach(() => {
    base.lecturas = [];
    base.rpc.mockReset();
    base.filas = [cuenta('p1', 'nuevo', 'pendiente'), cuenta('u1', 'profe', 'activo'), cuenta('b1', 'rechazado', 'bloqueado')];
    useAuthStore.setState({
      perfil: { id: 'u1', usuario: 'profe', nombre_completo: 'Profe', rol: 'entrenador', estado: 'activo', creado_en: '' },
    });
  });

  it('agrupa por estado, no pide correos y solo deja actuar sobre las pendientes', async () => {
    render(<PanelCuentas onCerrar={() => {}} />);

    const pendientes = await screen.findByRole('region', { name: 'Pendientes' });
    expect(within(pendientes).getByText('Nombre nuevo')).toBeTruthy();
    expect(within(pendientes).getByRole('button', { name: 'Aprobar' })).toBeTruthy();
    expect(within(pendientes).getByRole('button', { name: 'Rechazar' })).toBeTruthy();

    const activas = screen.getByRole('region', { name: 'Activas' });
    expect(within(activas).getByText('(tú)')).toBeTruthy();
    expect(within(activas).queryByRole('button')).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Bloqueadas' })).queryByRole('button')).toBeNull();

    expect(base.lecturas[0]?.tabla).toBe('perfiles');
    expect(String(base.lecturas[0]?.columnas)).not.toMatch(/email|correo/);
  });

  it('aprobar pide confirmación, llama a aprobar_usuario y vuelve a cargar la lista', async () => {
    base.rpc.mockResolvedValue({ data: null, error: null, status: 204 });
    render(<PanelCuentas onCerrar={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    expect(base.rpc).not.toHaveBeenCalled();
    expect(screen.getByText('¿Aprobar a @nuevo? Entrará como entrenador.')).toBeTruthy();

    base.filas = [cuenta('p1', 'nuevo', 'activo'), cuenta('u1', 'profe', 'activo')];
    fireEvent.click(screen.getByRole('button', { name: 'Sí, aprobar' }));

    await screen.findByText('@nuevo ya puede entrar como entrenador.');
    expect(base.rpc).toHaveBeenCalledWith('aprobar_usuario', { p_usuario_id: 'p1' });
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Activas' })).getByText('Nombre nuevo')).toBeTruthy());
    expect(base.lecturas).toHaveLength(2);
  });

  it('rechazar llama a rechazar_usuario', async () => {
    base.rpc.mockResolvedValue({ data: null, error: null, status: 204 });
    render(<PanelCuentas onCerrar={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));

    await screen.findByText('@nuevo quedó bloqueada.');
    expect(base.rpc).toHaveBeenCalledWith('rechazar_usuario', { p_usuario_id: 'p1' });
  });

  it('cancelar no cambia nada', async () => {
    render(<PanelCuentas onCerrar={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(base.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeTruthy();
  });

  it('si otro entrenador se adelantó, lo dice y actualiza la lista', async () => {
    base.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'La cuenta ya no está pendiente.' }, status: 400 });
    render(<PanelCuentas onCerrar={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    base.filas = [cuenta('p1', 'nuevo', 'bloqueado'), cuenta('u1', 'profe', 'activo')];
    fireEvent.click(screen.getByRole('button', { name: 'Sí, aprobar' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Otro entrenador ya revisó esta cuenta. La lista está actualizada.');
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Bloqueadas' })).getByText('Nombre nuevo')).toBeTruthy());
  });

  it('sin conexión lo dice así', async () => {
    base.rpc.mockResolvedValue({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 });
    render(<PanelCuentas onCerrar={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, rechazar' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Sin conexión: no se guardó el cambio. Inténtalo otra vez con señal.');
  });
});
