import type { Formacion, Posicion, ZonaFormacion } from '../types';

function zona(posicion: Posicion, x: number, y: number, indice: number): ZonaFormacion {
  return { id: `${posicion}-${indice}`, posicion, x, y };
}

export const FORMACIONES: Formacion[] = [
  {
    id: '4-3-3',
    nombre: '4-3-3',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('LI', 16, 24, 1),
      zona('DFC', 38, 20, 2),
      zona('DFC', 62, 20, 3),
      zona('LD', 84, 24, 4),
      zona('MCD', 50, 42, 5),
      zona('MC', 30, 52, 6),
      zona('MC', 70, 52, 7),
      zona('EI', 16, 76, 8),
      zona('DC', 50, 84, 9),
      zona('ED', 84, 76, 10),
    ],
  },
  {
    id: '4-4-2',
    nombre: '4-4-2',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('LI', 16, 22, 1),
      zona('DFC', 38, 18, 2),
      zona('DFC', 62, 18, 3),
      zona('LD', 84, 22, 4),
      zona('MI', 14, 48, 5),
      zona('MC', 38, 46, 6),
      zona('MC', 62, 46, 7),
      zona('MD', 86, 48, 8),
      zona('DC', 38, 80, 9),
      zona('DC', 62, 80, 10),
    ],
  },
  {
    id: '4-2-3-1',
    nombre: '4-2-3-1',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('LI', 16, 22, 1),
      zona('DFC', 38, 18, 2),
      zona('DFC', 62, 18, 3),
      zona('LD', 84, 22, 4),
      zona('MCD', 35, 40, 5),
      zona('MCD', 65, 40, 6),
      zona('EI', 18, 66, 7),
      zona('MCO', 50, 60, 8),
      zona('ED', 82, 66, 9),
      zona('DC', 50, 84, 10),
    ],
  },
  {
    id: '4-2-4',
    nombre: '4-2-4',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('LI', 16, 22, 1),
      zona('DFC', 38, 18, 2),
      zona('DFC', 62, 18, 3),
      zona('LD', 84, 22, 4),
      zona('MC', 35, 46, 5),
      zona('MC', 65, 46, 6),
      zona('EI', 16, 74, 7),
      zona('DC', 38, 84, 8),
      zona('DC', 62, 84, 9),
      zona('ED', 84, 74, 10),
    ],
  },
  {
    id: '3-5-2',
    nombre: '3-5-2',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('DFC', 30, 20, 1),
      zona('DFC', 50, 16, 2),
      zona('DFC', 70, 20, 3),
      zona('LI', 10, 42, 4),
      zona('MC', 35, 48, 5),
      zona('MC', 50, 44, 6),
      zona('MC', 65, 48, 7),
      zona('LD', 90, 42, 8),
      zona('DC', 38, 82, 9),
      zona('DC', 62, 82, 10),
    ],
  },
  {
    id: '5-3-2',
    nombre: '5-3-2',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('LI', 10, 24, 1),
      zona('DFC', 30, 18, 2),
      zona('DFC', 50, 14, 3),
      zona('DFC', 70, 18, 4),
      zona('LD', 90, 24, 5),
      zona('MC', 30, 50, 6),
      zona('MC', 50, 46, 7),
      zona('MC', 70, 50, 8),
      zona('DC', 38, 82, 9),
      zona('DC', 62, 82, 10),
    ],
  },
  {
    id: '4-1-4-1',
    nombre: '4-1-4-1',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('LI', 16, 22, 1),
      zona('DFC', 38, 18, 2),
      zona('DFC', 62, 18, 3),
      zona('LD', 84, 22, 4),
      zona('MCD', 50, 38, 5),
      zona('MI', 14, 58, 6),
      zona('MC', 38, 54, 7),
      zona('MC', 62, 54, 8),
      zona('MD', 86, 58, 9),
      zona('DC', 50, 84, 10),
    ],
  },
  {
    id: '3-4-3',
    nombre: '3-4-3',
    zonas: [
      zona('POR', 50, 6, 0),
      zona('DFC', 30, 20, 1),
      zona('DFC', 50, 16, 2),
      zona('DFC', 70, 20, 3),
      zona('MI', 14, 48, 4),
      zona('MC', 38, 46, 5),
      zona('MC', 62, 46, 6),
      zona('MD', 86, 48, 7),
      zona('EI', 16, 76, 8),
      zona('DC', 50, 82, 9),
      zona('ED', 84, 76, 10),
    ],
  },
];

export function obtenerFormacion(id: string): Formacion | undefined {
  return FORMACIONES.find((f) => f.id === id);
}

/**
 * Dorsal de cada zona cuando la ocupa el RIVAL (F5.2): al elegir su formación
 * salen los 11 colocados con estos números. Nuestro equipo usa los dorsales
 * reales de la plantilla. Numeración aprobada por el cuerpo técnico: 1 portero,
 * 2 lateral derecho, 3 lateral izquierdo, 4 y 5 centrales, 6 medio defensivo,
 * 8 y 10 mediocampistas (10 el más ofensivo), 7 banda derecha, 11 banda
 * izquierda y 9 delantero centro. Lo que ese criterio no fija (aprobado por el
 * usuario el 19 nov 2026): a la misma altura, el de la derecha lleva el número
 * más bajo; con dos delanteros, 9 y 10, y los dos medios sin pivote, 6 y 8; con
 * tres centrales, el del medio lleva el 6; en 3-5-2 y 5-3-2 los medios de los
 * lados llevan 7 y 11; en 3-4-3 los carrileros, 2 y 3.
 */
const NUMEROS_RIVAL: Record<string, Record<string, number>> = {
  '4-3-3': { 'POR-0': 1, 'LI-1': 3, 'DFC-2': 5, 'DFC-3': 4, 'LD-4': 2, 'MCD-5': 6, 'MC-6': 10, 'MC-7': 8, 'EI-8': 11, 'DC-9': 9, 'ED-10': 7 },
  '4-4-2': { 'POR-0': 1, 'LI-1': 3, 'DFC-2': 5, 'DFC-3': 4, 'LD-4': 2, 'MI-5': 11, 'MC-6': 8, 'MC-7': 6, 'MD-8': 7, 'DC-9': 10, 'DC-10': 9 },
  '4-2-3-1': { 'POR-0': 1, 'LI-1': 3, 'DFC-2': 5, 'DFC-3': 4, 'LD-4': 2, 'MCD-5': 8, 'MCD-6': 6, 'EI-7': 11, 'MCO-8': 10, 'ED-9': 7, 'DC-10': 9 },
  '4-2-4': { 'POR-0': 1, 'LI-1': 3, 'DFC-2': 5, 'DFC-3': 4, 'LD-4': 2, 'MC-5': 8, 'MC-6': 6, 'EI-7': 11, 'DC-8': 10, 'DC-9': 9, 'ED-10': 7 },
  '3-5-2': { 'POR-0': 1, 'DFC-1': 5, 'DFC-2': 6, 'DFC-3': 4, 'LI-4': 3, 'MC-5': 11, 'MC-6': 8, 'MC-7': 7, 'LD-8': 2, 'DC-9': 10, 'DC-10': 9 },
  '5-3-2': { 'POR-0': 1, 'LI-1': 3, 'DFC-2': 5, 'DFC-3': 6, 'DFC-4': 4, 'LD-5': 2, 'MC-6': 11, 'MC-7': 8, 'MC-8': 7, 'DC-9': 10, 'DC-10': 9 },
  '4-1-4-1': { 'POR-0': 1, 'LI-1': 3, 'DFC-2': 5, 'DFC-3': 4, 'LD-4': 2, 'MCD-5': 6, 'MI-6': 11, 'MC-7': 10, 'MC-8': 8, 'MD-9': 7, 'DC-10': 9 },
  '3-4-3': { 'POR-0': 1, 'DFC-1': 5, 'DFC-2': 6, 'DFC-3': 4, 'MI-4': 3, 'MC-5': 10, 'MC-6': 8, 'MD-7': 2, 'EI-8': 11, 'DC-9': 9, 'ED-10': 7 },
};

/** El dorsal clásico del rival en esa zona; `null` si la formación o la zona no están en la tabla. */
export function numeroRivalDeZona(formacionId: string, zonaId: string): number | null {
  return NUMEROS_RIVAL[formacionId]?.[zonaId] ?? null;
}
