import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Registro: ya no pregunta el rol ni un código. Toda cuenta nueva queda pendiente y quien
 * la aprueba en ⋯ → Cuentas la deja como entrenador.
 */
const supa = vi.hoisted(() => ({ signUp: vi.fn(), rpc: vi.fn() }));

vi.mock('../lib/supabaseClient', () => ({
  supabaseConfigurado: true,
  establecerRecordarDispositivo: vi.fn(),
  supabase: {
    auth: { signUp: supa.signUp, onAuthStateChange: vi.fn() },
    rpc: supa.rpc,
  },
}));

import { FormularioRegistro } from '../components/auth/FormularioRegistro';
import { useAuthStore } from '../store/authStore';

/** Por el comienzo del texto de la etiqueta: dentro llevan también los avisos de cada campo. */
function escribir(etiqueta: string, valor: string) {
  fireEvent.change(screen.getByLabelText(new RegExp('^' + etiqueta)), { target: { value: valor } });
}

describe('Registro sin rol ni código', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supa.rpc.mockResolvedValue({ data: true, error: null });
    supa.signUp.mockResolvedValue({ data: { session: null, user: { id: 'n1' } }, error: null });
    useAuthStore.setState({ enviando: false });
  });

  it('el formulario no pregunta el rol ni un código', () => {
    render(<FormularioRegistro onVolver={() => {}} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/rol/i)).toBeNull();
    expect(screen.queryByText(/código/i)).toBeNull();
    expect(screen.getByText('Un entrenador del cuerpo técnico debe aprobar tu cuenta antes de que puedas entrar.')).toBeTruthy();
  });

  it('envía solo usuario y nombre, y avisa de que falta la aprobación', async () => {
    render(<FormularioRegistro onVolver={() => {}} />);

    escribir('Nombre y apellido', 'Entrenador Nuevo');
    escribir('Usuario', 'nuevo.entrenador');
    escribir('Correo', 'nuevo@ejemplo.test');
    escribir('Contraseña', 'Pizarra-Cucuta-2026!');
    escribir('Confirmar contraseña', 'Pizarra-Cucuta-2026!');
    fireEvent.click(screen.getByRole('checkbox'));
    await screen.findByText('Disponible.');
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(supa.signUp).toHaveBeenCalledTimes(1));
    expect(supa.signUp.mock.calls[0]![0]).toEqual({
      email: 'nuevo@ejemplo.test',
      password: 'Pizarra-Cucuta-2026!',
      options: { data: { usuario: 'nuevo.entrenador', nombre_completo: 'Entrenador Nuevo' } },
    });
    expect(
      await screen.findByText('Cuenta creada. Revisa tu correo para verificarla. Antes de entrar, un entrenador del cuerpo técnico debe aprobarla.'),
    ).toBeTruthy();
  });
});
