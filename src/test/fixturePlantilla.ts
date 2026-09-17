import { usePlantillaStore } from '../store/plantillaStore';
import type { Jugador } from '../types';

/**
 * Plantilla de prueba. Existe porque la plantilla real vive en Supabase y los
 * tests no hablan con la red: antes el fixture era la semilla del código, que
 * se retiró al pasar los jugadores a la base de datos.
 */
function jugador(indice: number, posicion: Jugador['posicionNatural']): Jugador {
  return {
    id: `test-${String(indice).padStart(2, '0')}`,
    categoriaId: 'sub20',
    nombre: `Nombre${indice}`,
    apellido: `Apellido${indice}`,
    dorsal: indice,
    posicionNatural: posicion,
    posicionesSecundarias: [],
    fotoUrl: null,
    fotoPath: null,
    piePreferido: 'derecho',
    activo: true,
  };
}

export const PLANTILLA_PRUEBA: Jugador[] = [
  jugador(1, 'POR'),
  jugador(2, 'LD'),
  jugador(3, 'LI'),
  jugador(4, 'DFC'),
  jugador(5, 'DFC'),
  jugador(6, 'MCD'),
  jugador(7, 'MC'),
  jugador(8, 'MC'),
  jugador(9, 'DC'),
  jugador(10, 'MCO'),
  jugador(11, 'EI'),
  jugador(12, 'ED'),
  jugador(13, 'SD'),
  jugador(14, 'DFC'),
];

/** Deja el store de plantilla con jugadores conocidos, sin tocar la red. */
export function sembrarPlantilla(): void {
  usePlantillaStore.setState({
    categorias: [{ id: 'sub20', nombre: 'Sub-20', orden: 5 }],
    categoriaActiva: 'sub20',
    jugadores: PLANTILLA_PRUEBA.map((j) => ({ ...j })),
    cargando: false,
    error: null,
    enlaces: {},
  });
}
