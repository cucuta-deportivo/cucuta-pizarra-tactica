import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Seg4: el panel «Actividad de la cuenta» solo pide los intentos de la cuenta con sesión,
 * en la lista y en el CSV. La base hace lo mismo con la política ver_propios_intentos.
 */
const consultas = vi.hoisted(() => ({ lista: [] as Array<Array<[string, unknown[]]>> }));

vi.mock('../lib/supabaseClient', () => ({
  supabaseConfigurado: true,
  establecerRecordarDispositivo: vi.fn(),
  supabase: {
    from: (tabla: string) => {
      const llamadas: Array<[string, unknown[]]> = [['from', [tabla]]];
      consultas.lista.push(llamadas);
      const consulta: Record<string, unknown> = {};
      for (const metodo of ['select', 'eq', 'gte', 'lte', 'in', 'order', 'range', 'limit']) {
        consulta[metodo] = (...argumentos: unknown[]) => {
          llamadas.push([metodo, argumentos]);
          return consulta;
        };
      }
      consulta.then = (resolver: (valor: unknown) => void) => resolver({ data: [], error: null });
      return consulta;
    },
  },
}));

import { PanelActividad } from '../components/auth/PanelActividad';
import { useAuthStore } from '../store/authStore';

const filtrosDe = (llamadas: Array<[string, unknown[]]>) => llamadas.filter(([metodo]) => metodo === 'eq').map(([, args]) => args);

describe('Actividad de la cuenta: solo los intentos de la cuenta (Seg4)', () => {
  beforeEach(() => {
    consultas.lista = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    useAuthStore.setState({
      session: { user: { id: 'u1', email: 'profe@club.co' } } as never,
      perfil: { id: 'u1', usuario: 'profe', nombre_completo: 'Profe', rol: 'entrenador', estado: 'activo', creado_en: '' },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('la lista pide solo los intentos de la cuenta con sesión', async () => {
    render(<PanelActividad onCerrar={() => {}} />);

    await waitFor(() => expect(consultas.lista).toHaveLength(1));
    expect(consultas.lista[0]?.[0]).toEqual(['from', ['intentos_login']]);
    expect(filtrosDe(consultas.lista[0]!)).toEqual([['user_id', 'u1']]);
  });

  it('el CSV también, aunque se marque «Solo este dispositivo»', async () => {
    // jsdom no sabe descargar: se simulan el enlace del archivo y su clic.
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    onTestFinished(() => {
      Object.assign(URL, { createObjectURL, revokeObjectURL });
    });
    render(<PanelActividad onCerrar={() => {}} />);
    await waitFor(() => expect(consultas.lista).toHaveLength(1));

    fireEvent.click(screen.getByLabelText('Solo este dispositivo'));
    await waitFor(() => expect(consultas.lista).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(consultas.lista).toHaveLength(3));

    const csv = consultas.lista[2]!;
    expect(csv.some(([metodo]) => metodo === 'limit')).toBe(true);
    expect(filtrosDe(csv)[0]).toEqual(['user_id', 'u1']);
    expect(filtrosDe(csv)).toContainEqual(['dispositivo', expect.any(String)]);
  });
});
