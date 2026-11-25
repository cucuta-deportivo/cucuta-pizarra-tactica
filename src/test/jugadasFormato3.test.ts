import { beforeEach, describe, expect, it } from 'vitest';
import { PLANTILLA_PRUEBA, sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore, type DocumentoTactico } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { useUiStore } from '../store/uiStore';
import { alineacionRepository } from '../data/repositorio';
import { obtenerFormacion } from '../data/formaciones';
import { conJugadasEnLista, FORMATO_ALINEACION } from '../utils/formatoAlineacion';
import { fichasActualizadas } from '../utils/fichas';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import type { Alineacion, FrameTactico, SecuenciaTactica } from '../types';

/**
 * F5.4b, paso 1: la alineación guarda una lista de jugadas (formato 3). Las de los
 * formatos 1 y 2 (una jugada abierta o una cerrada) se convierten al leerlas, sea
 * cual sea su origen (dispositivo, Supabase, JSON o respaldo), y al guardarse salen
 * en el formato 3.
 */
const estado = () => useAlineacionStore.getState();
const doc = () => estado().historial.presente;

function fase(id: string, jugadorId?: string): FrameTactico {
  return {
    id,
    titulares: jugadorId ? [{ jugadorId, x: 50, y: 50, esCapitan: false }] : [],
    jugadoresRival: [],
    balones: [],
    objetos: [],
    trazos: [],
    celdasPintadas: {},
  };
}

function jugada(nombre: string | undefined, ...fases: FrameTactico[]): SecuenciaTactica {
  return { nombre, frames: fases, indiceActivo: 0 };
}

/** Una alineación guardada por una versión anterior, con lo justo. */
function alineacionDeAntes(cambios: Partial<Alineacion>): Alineacion {
  const ahora = new Date().toISOString();
  return {
    id: 'al-antigua',
    nombre: 'De antes',
    formacionId: '4-4-2',
    titulares: [],
    banquillo: [],
    trazos: [],
    notas: '',
    creadaEn: ahora,
    modificadaEn: ahora,
    objetos: [],
    balones: [],
    cuadricula: cuadriculaVacia(),
    rival: null,
    marcajes: [],
    cancha: canchaVacia(),
    ...cambios,
  };
}

describe('conversión al formato 3 (al leer)', () => {
  it('formato 2: la jugada cerrada pasa a ser la primera de la lista, con id', () => {
    const vieja = alineacionDeAntes({ formato: 2, secuencia: null, jugadaCerrada: jugada('Salida ante presión', fase('f1'), fase('f2')) });
    const nueva = conJugadasEnLista(vieja);
    expect(nueva.jugadas).toHaveLength(1);
    expect(nueva.jugadas![0]).toMatchObject({ id: 'al-antigua-jugada-1', nombre: 'Salida ante presión' });
    expect(nueva.jugadas![0]!.frames.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(nueva.secuencia).toBeNull();
    expect('jugadaCerrada' in nueva).toBe(false);
  });

  it('formato 1: una jugada abierta sin nombre se llama «Jugada 1» y sabe su sitio', () => {
    const vieja = alineacionDeAntes({ secuencia: jugada(undefined, fase('f1')) });
    const nueva = conJugadasEnLista(vieja);
    expect(nueva.jugadas).toEqual([]);
    expect(nueva.secuencia).toMatchObject({ id: 'al-antigua-jugada-1', nombre: 'Jugada 1', posicion: 0 });
  });

  it('formato 1 sin jugada: lista vacía', () => {
    expect(conJugadasEnLista(alineacionDeAntes({})).jugadas).toEqual([]);
  });

  it('leer dos veces da lo mismo, y lo que ya está en el formato 3 sale tal cual', () => {
    const vieja = alineacionDeAntes({ formato: 2, jugadaCerrada: jugada(undefined, fase('f1')) });
    const una = conJugadasEnLista(vieja);
    expect(conJugadasEnLista(vieja)).toEqual(una);
    expect(conJugadasEnLista(una)).toBe(una);
  });
});

describe('guardar y volver a abrir con la lista de jugadas', () => {
  beforeEach(() => {
    sembrarPlantilla();
    useUiStore.setState({ toasts: [] });
  });

  it('una de formato 2 se abre, se edita y al guardarse sale en el formato 3, sin la jugada cerrada de antes', async () => {
    const vieja = alineacionDeAntes({ id: 'al-f2', formato: 2, secuencia: null, jugadaCerrada: jugada('Córner', fase('f1'), fase('f2')) });
    await alineacionRepository.guardar(vieja);
    await estado().cargarAlineacion('al-f2');
    expect(doc().jugadas.map((j) => j.nombre)).toEqual(['Córner']);

    estado().abrirJugada();
    expect(doc().secuencia).toMatchObject({ id: 'al-f2-jugada-1', nombre: 'Córner', posicion: 0 });
    estado().renombrarSecuencia('Córner al primer palo');
    estado().cerrarJugada();
    await estado().guardarAhora();

    const guardada = (await alineacionRepository.obtener('al-f2'))!;
    expect(guardada.formato).toBe(FORMATO_ALINEACION);
    expect(FORMATO_ALINEACION).toBe(3);
    expect(guardada.jugadas!.map((j) => [j.id, j.nombre, j.frames.length])).toEqual([['al-f2-jugada-1', 'Córner al primer palo', 2]]);
    expect(guardada.jugadaCerrada).toBeUndefined();
    expect(guardada.secuencia).toBeNull();
  });

  it('cerrar la app con una jugada abierta y volver a abrirla: la jugada y la lista quedan intactas', async () => {
    // Tres jugadas; la del medio, abierta en su fase 2.
    const abierta: SecuenciaTactica = { ...jugada('B', fase('b1'), fase('b2')), id: 'jb', indiceActivo: 1, posicion: 1 };
    const tres = alineacionDeAntes({
      id: 'al-f3',
      formato: 3,
      jugadas: [{ ...jugada('A', fase('a1')), id: 'ja' }, { ...jugada('C', fase('c1'), fase('c2'), fase('c3')), id: 'jc' }],
      secuencia: abierta,
    });
    await alineacionRepository.guardar(tres);

    // «Se cierra la app»: el estado en memoria se va y se vuelve a cargar de lo guardado.
    estado().nuevaAlineacion('Otra');
    await estado().cargarAlineacion('al-f3');
    expect(doc().secuencia).toMatchObject({ id: 'jb', nombre: 'B', indiceActivo: 1, posicion: 1 });
    expect(doc().secuencia!.frames.map((f) => f.id)).toEqual(['b1', 'b2']);
    expect(doc().jugadas.map((j) => j.id)).toEqual(['ja', 'jc']);

    // Al cerrarla vuelve a su sitio, entre A y C, y así se guarda.
    estado().cerrarJugada();
    await estado().guardarAhora();
    const guardada = (await alineacionRepository.obtener('al-f3'))!;
    expect(guardada.jugadas!.map((j) => j.id)).toEqual(['ja', 'jb', 'jc']);
    expect(guardada.jugadas![1]).not.toHaveProperty('posicion');
    expect(guardada.jugadas![1]).not.toHaveProperty('pizarra');
  });

  it('la jugada nueva lleva id y su sitio en la lista', () => {
    estado().nuevaAlineacion('Nueva');
    const zona = obtenerFormacion(doc().formacionId)!.zonas[0]!;
    estado().asignarJugador(zona.id, zona.x, zona.y, usePlantillaStore.getState().jugadores[0]!.id);
    estado().iniciarSecuencia();
    expect(doc().secuencia!.id).toEqual(expect.any(String));
    expect(doc().secuencia!.posicion).toBe(0);
  });
});

describe('fichas con varias jugadas', () => {
  it('quien solo sale en la segunda jugada cerrada conserva su ficha (por ejemplo, un traspasado)', () => {
    const soloEnLaSegunda = PLANTILLA_PRUEBA[3]!;
    const documento: DocumentoTactico = {
      formacionId: '4-4-2',
      titulares: [],
      banquillo: [],
      trazos: [],
      notas: '',
      objetos: [],
      balones: [],
      cuadricula: cuadriculaVacia(),
      rival: null,
      marcajes: [],
      cancha: canchaVacia(),
      jugadoresPersonalizados: [],
      secuencia: null,
      jugadas: [
        { ...jugada('Primera', fase('p1')), id: 'j1' },
        { ...jugada('Segunda', fase('s1', soloEnLaSegunda.id)), id: 'j2' },
      ],
    };
    const fichas = fichasActualizadas(documento, [], PLANTILLA_PRUEBA);
    expect(fichas.map((f) => f.id)).toEqual([soloEnLaSegunda.id]);
  });
});
