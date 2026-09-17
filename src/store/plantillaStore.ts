import { create } from 'zustand';
import type { Categoria, Jugador } from '../types';
import {
  actualizarJugador as apiActualizar,
  borrarFoto,
  crearJugador as apiCrear,
  desactivarJugador as apiDesactivar,
  firmarFotos,
  guardarRutaFoto,
  listarCategorias,
  listarJugadores,
  rutaFoto,
  subirFoto,
  type DatosJugador,
  type EnlaceFirmado,
} from '../data/supabase/plantillaApi';

const CLAVE_CATEGORIA = 'cucuta.categoriaActiva';

/**
 * Plantilla del club. Vive SOLO en Supabase: no hay caché local ni trabajo sin
 * conexión — si no hay red, la pantalla lo dice y no se inventa datos.
 *
 * Las escrituras son optimistas: se aplica el cambio en pantalla, se escribe en
 * Supabase y, si falla, se revierte y se deja el mensaje en `error`.
 */
interface PlantillaState {
  categorias: Categoria[];
  categoriaActiva: string | null;
  jugadores: Jugador[];
  cargando: boolean;
  error: string | null;
  /** Enlaces firmados por ruta del bucket, con su instante de renovación. */
  enlaces: Record<string, EnlaceFirmado>;

  obtenerPorId: (id: string) => Jugador | undefined;
  /** Jugadores creados a mano en la pizarra; se mezclan para que el campo los encuentre. */
  sincronizarPersonalizados: (personalizados: Jugador[]) => void;

  inicializar: () => Promise<void>;
  elegirCategoria: (categoriaId: string) => Promise<void>;
  recargar: () => Promise<void>;

  crearJugador: (datos: DatosJugador) => Promise<Jugador | null>;
  actualizarJugador: (jugadorId: string, datos: DatosJugador) => Promise<boolean>;
  desactivarJugador: (jugadorId: string) => Promise<void>;
  establecerFoto: (jugadorId: string, blob: Blob) => Promise<void>;
  quitarFoto: (jugadorId: string) => Promise<void>;
  limpiarError: () => void;
}

export const usePlantillaStore = create<PlantillaState>((set, get) => ({
  categorias: [],
  categoriaActiva: null,
  jugadores: [],
  cargando: false,
  error: null,
  enlaces: {},

  obtenerPorId: (id) => get().jugadores.find((j) => j.id === id),

  sincronizarPersonalizados: (personalizados) =>
    set((estado) => {
      const deSupabase = estado.jugadores.filter((j) => !personalizados.some((p) => p.id === j.id));
      return { jugadores: [...deSupabase, ...personalizados] };
    }),

  limpiarError: () => set({ error: null }),

  inicializar: async () => {
    set({ cargando: true, error: null });
    try {
      const categorias = await listarCategorias();
      const guardada = localStorage.getItem(CLAVE_CATEGORIA);
      // La categoría guardada puede haber desaparecido de la tabla: se cae a la primera.
      const activa = categorias.find((c) => c.id === guardada)?.id ?? categorias[0]?.id ?? null;
      set({ categorias, categoriaActiva: activa });
      if (activa) await get().recargar();
      else set({ cargando: false });
    } catch (fallo) {
      set({ cargando: false, error: mensajeDe(fallo) });
    }
  },

  elegirCategoria: async (categoriaId) => {
    localStorage.setItem(CLAVE_CATEGORIA, categoriaId);
    set({ categoriaActiva: categoriaId, jugadores: [], enlaces: {} });
    await get().recargar();
  },

  recargar: async () => {
    const categoriaId = get().categoriaActiva;
    if (!categoriaId) return;
    set({ cargando: true, error: null });
    try {
      const jugadores = await listarJugadores(categoriaId);
      // Un único lote de enlaces firmados para toda la categoría.
      const rutas = jugadores.map((j) => j.fotoPath).filter((r): r is string => Boolean(r));
      const enlaces = await firmarFotos(rutas);
      set({ jugadores: conEnlaces(jugadores, enlaces), enlaces, cargando: false });
    } catch (fallo) {
      set({ cargando: false, error: mensajeDe(fallo) });
    }
  },

  crearJugador: async (datos) => {
    const categoriaId = get().categoriaActiva;
    if (!categoriaId) return null;
    try {
      // Sin optimismo aquí: el id lo genera la base de datos y hace falta para
      // la ruta de la foto, así que se espera la respuesta.
      const jugador = await apiCrear(categoriaId, datos);
      set((estado) => ({ jugadores: [...estado.jugadores, jugador], error: null }));
      return jugador;
    } catch (fallo) {
      set({ error: mensajeDe(fallo) });
      return null;
    }
  },

  actualizarJugador: async (jugadorId, datos) => {
    const anteriores = get().jugadores;
    set({
      jugadores: anteriores.map((j) =>
        j.id === jugadorId
          ? {
              ...j,
              nombre: datos.nombre,
              apellido: datos.apellido,
              dorsal: datos.dorsal,
              posicionNatural: datos.posicionPrincipal,
              posicionesSecundarias: datos.posicionSecundaria ? [datos.posicionSecundaria] : [],
            }
          : j,
      ),
      error: null,
    });
    try {
      await apiActualizar(jugadorId, datos);
      return true;
    } catch (fallo) {
      set({ jugadores: anteriores, error: mensajeDe(fallo) });
      return false;
    }
  },

  desactivarJugador: async (jugadorId) => {
    const anteriores = get().jugadores;
    set({ jugadores: anteriores.filter((j) => j.id !== jugadorId), error: null });
    try {
      await apiDesactivar(jugadorId);
    } catch (fallo) {
      set({ jugadores: anteriores, error: mensajeDe(fallo) });
    }
  },

  establecerFoto: async (jugadorId, blob) => {
    const jugador = get().jugadores.find((j) => j.id === jugadorId);
    if (!jugador) return;
    const ruta = rutaFoto(jugador.categoriaId, jugadorId);
    try {
      await subirFoto(ruta, blob);
      await guardarRutaFoto(jugadorId, ruta);
      const enlaces = await firmarFotos([ruta]);
      set((estado) => ({
        enlaces: { ...estado.enlaces, ...enlaces },
        jugadores: estado.jugadores.map((j) =>
          j.id === jugadorId ? { ...j, fotoPath: ruta, fotoUrl: enlaces[ruta]?.url ?? null } : j,
        ),
        error: null,
      }));
    } catch (fallo) {
      set({ error: mensajeDe(fallo) });
    }
  },

  quitarFoto: async (jugadorId) => {
    const anteriores = get().jugadores;
    const jugador = anteriores.find((j) => j.id === jugadorId);
    if (!jugador?.fotoPath) return;
    const ruta = jugador.fotoPath;
    set({
      jugadores: anteriores.map((j) => (j.id === jugadorId ? { ...j, fotoPath: null, fotoUrl: null } : j)),
      error: null,
    });
    try {
      await borrarFoto(ruta);
      await guardarRutaFoto(jugadorId, null);
    } catch (fallo) {
      set({ jugadores: anteriores, error: mensajeDe(fallo) });
    }
  },
}));

function conEnlaces(jugadores: Jugador[], enlaces: Record<string, EnlaceFirmado>): Jugador[] {
  return jugadores.map((j) => ({ ...j, fotoUrl: j.fotoPath ? (enlaces[j.fotoPath]?.url ?? null) : null }));
}

const SIN_RED = 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';

/**
 * Los fallos de red de `fetch` llegan como "TypeError: Failed to fetch", que no
 * le dice nada a un entrenador. Se traducen; el resto de errores de Supabase sí
 * son informativos (dorsal repetido, posiciones iguales) y se dejan pasar.
 */
function mensajeDe(fallo: unknown): string {
  if (!(fallo instanceof Error)) return SIN_RED;
  if (/failed to fetch|networkerror|load failed/i.test(fallo.message)) return SIN_RED;
  return fallo.message;
}

/**
 * Renueva los enlaces firmados que estén a punto de caducar. Lo llama la
 * pantalla de plantilla con un temporizador; así una sesión larga no acaba
 * mostrando fotos rotas.
 */
export async function renovarEnlacesCaducados(): Promise<void> {
  const { jugadores, enlaces } = usePlantillaStore.getState();
  const ahora = Date.now();
  const caducadas = jugadores
    .map((j) => j.fotoPath)
    .filter((r): r is string => Boolean(r) && (!enlaces[r!] || enlaces[r!]!.renovarEn <= ahora));
  if (caducadas.length === 0) return;
  try {
    const nuevos = await firmarFotos(caducadas);
    usePlantillaStore.setState((estado) => ({
      enlaces: { ...estado.enlaces, ...nuevos },
      jugadores: conEnlaces(estado.jugadores, { ...estado.enlaces, ...nuevos }),
    }));
  } catch {
    // Si falla la renovación las tarjetas caen a su respaldo del dorsal; no
    // merece la pena molestar al entrenador con un error por esto.
  }
}
