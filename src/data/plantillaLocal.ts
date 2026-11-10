import type { Categoria, Jugador } from '../types';

/**
 * Copia de la plantilla en este dispositivo (S1.12), para poder poner y cambiar
 * jugadores sin señal. Se guarda cada vez que la plantilla llega de Supabase,
 * por categoría. Sin fotos: no se guardan en el dispositivo (sin señal salen
 * iniciales y dorsal) y los enlaces firmados no se guardan nunca. La ruta de la
 * foto sí, para firmarla otra vez cuando vuelva la conexión.
 */
const CLAVE = 'cucuta.plantillaGuardada.v1';

export interface PlantillaGuardada {
  categorias: Categoria[];
  porCategoria: Record<string, { jugadores: Jugador[]; guardadaEn: string }>;
}

const vacia = (): PlantillaGuardada => ({ categorias: [], porCategoria: {} });

export function leerPlantillaGuardada(): PlantillaGuardada {
  try {
    const texto = localStorage.getItem(CLAVE);
    if (!texto) return vacia();
    const valor = JSON.parse(texto) as Partial<PlantillaGuardada> | null;
    if (!valor || !Array.isArray(valor.categorias) || typeof valor.porCategoria !== 'object' || valor.porCategoria === null) return vacia();
    return { categorias: valor.categorias, porCategoria: valor.porCategoria };
  } catch {
    return vacia();
  }
}

function escribir(plantilla: PlantillaGuardada): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(plantilla));
  } catch {
    // Sin espacio o sin acceso al almacenamiento: se sigue sin copia, como antes.
  }
}

export function guardarCategorias(categorias: Categoria[]): void {
  escribir({ ...leerPlantillaGuardada(), categorias });
}

export function guardarJugadores(categoriaId: string, jugadores: Jugador[], ahora = new Date()): void {
  const actual = leerPlantillaGuardada();
  const sinEnlaces = jugadores.map((j) => ({ ...j, fotoUrl: null }));
  escribir({ ...actual, porCategoria: { ...actual.porCategoria, [categoriaId]: { jugadores: sinEnlaces, guardadaEn: ahora.toISOString() } } });
}
