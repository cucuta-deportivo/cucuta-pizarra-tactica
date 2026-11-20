import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F5.1, la llamada a Supabase del traspaso: cambia `categoria_id` en la misma
 * fila y pide la fila de vuelta, porque si la base no deja cambiarla el UPDATE
 * no da error, solo no cambia nada.
 */
const llamada = vi.hoisted(() => ({
  cambios: null as Record<string, unknown> | null,
  id: null as string | null,
  respuesta: { data: [{ id: 'a' }] as unknown[] | null, error: null as { message: string } | null },
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (cambios: Record<string, unknown>) => {
        llamada.cambios = cambios;
        return {
          eq: (_columna: string, id: string) => {
            llamada.id = id;
            return { select: async () => llamada.respuesta };
          },
        };
      },
    }),
  },
}));

const { traspasarJugador } = await import('../data/supabase/plantillaApi');
const DATOS = { nombre: 'Juan', apellido: 'Pérez', dorsal: 9, posicionPrincipal: 'DC' as const, posicionSecundaria: null };

describe('traspasarJugador (Supabase)', () => {
  beforeEach(() => {
    llamada.cambios = null;
    llamada.respuesta = { data: [{ id: 'a' }], error: null };
  });

  it('cambia la categoría de la misma fila junto con sus datos, sin tocar la foto', async () => {
    await traspasarJugador('a', 'sub17', DATOS);
    expect(llamada.id).toBe('a');
    expect(llamada.cambios).toMatchObject({ categoria_id: 'sub17', apellido: 'Pérez', dorsal: 9, posicion_principal: 'DC' });
    expect(llamada.cambios).not.toHaveProperty('foto_path');
  });

  it('si la base no cambió ninguna fila, avisa en vez de darlo por hecho', async () => {
    llamada.respuesta = { data: [], error: null };
    await expect(traspasarJugador('a', 'sub17', DATOS)).rejects.toThrow('la base de datos no aceptó el cambio');
  });

  it('el dorsal repetido llega traducido', async () => {
    llamada.respuesta = { data: null, error: { message: 'duplicate key value violates unique constraint "jugadores_dorsal_categoria_idx"' } };
    await expect(traspasarJugador('a', 'sub17', DATOS)).rejects.toThrow('Ese dorsal ya lo lleva otro jugador activo de la categoría.');
  });
});
