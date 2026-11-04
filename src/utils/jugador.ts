import type { Jugador } from '../types';

/** Lo que lleva la ficha cuando no hay foto: la misma función en pantalla y en la exportación. */
export function obtenerIniciales(jugador: Jugador): string {
  return `${jugador.nombre.charAt(0)}${jugador.apellido.charAt(0)}`.toUpperCase();
}
