import { beforeEach, describe, expect, it } from 'vitest';
import { PLANTILLA_PRUEBA, sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore, type DocumentoTactico } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { alineacionRepository } from '../data/repositorio';
import { obtenerFormacion } from '../data/formaciones';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import type { Alineacion, FichaJugador } from '../types';

/**
 * S1.2: cada alineación guarda una copia de los datos de sus jugadores (su
 * "ficha") para pintarlos aunque su categoría no esté cargada, ya no estén
 * activos o se abra en otro dispositivo. Nunca guarda el enlace firmado de la
 * foto, solo su ruta en el bucket.
 */
function documentoVacio(): DocumentoTactico {
  return {
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
  };
}

function prepararAlineacion(cambios: Partial<ReturnType<typeof useAlineacionStore.getState>> = {}): void {
  const ahora = new Date().toISOString();
  useAlineacionStore.setState({
    id: generarId(),
    nombre: 'Prueba de fichas',
    creadaEn: ahora,
    modificadaEn: ahora,
    categoriaId: 'sub20',
    fichas: [],
    historial: { pasado: [], presente: documentoVacio(), etiquetaPresente: 'Alineación inicial', futuro: [] },
    estadoGuardado: 'guardado',
    ...cambios,
  });
}

const zonaDC = obtenerFormacion('4-4-2')!.zonas.find((z) => z.posicion === 'DC')!;

const fichaDe = (indice: number, cambios: Partial<FichaJugador> = {}): FichaJugador => {
  const j = PLANTILLA_PRUEBA.find((p) => p.id === `test-${String(indice).padStart(2, '0')}`)!;
  return {
    id: j.id,
    categoriaId: j.categoriaId,
    nombre: j.nombre,
    apellido: j.apellido,
    dorsal: j.dorsal,
    posicionNatural: j.posicionNatural,
    posicionesSecundarias: j.posicionesSecundarias,
    fotoPath: j.fotoPath,
    ...cambios,
  };
};

async function guardadaActual(): Promise<Alineacion | undefined> {
  await useAlineacionStore.getState().guardarAhora();
  return alineacionRepository.obtener(useAlineacionStore.getState().id);
}

describe('fichas: la alineación lleva los datos de sus jugadores', () => {
  beforeEach(() => {
    sembrarPlantilla();
    prepararAlineacion();
  });

  it('al guardar, lleva una ficha de cada jugador de la plantilla que usa, con la ruta de su foto pero sin enlace firmado', async () => {
    usePlantillaStore.setState((s) => ({
      jugadores: s.jugadores.map((j) =>
        j.id === 'test-09' ? { ...j, fotoPath: 'sub20/test-09.webp', fotoUrl: 'https://enlace-firmado.example/foto' } : j,
      ),
    }));
    useAlineacionStore.getState().asignarJugador(zonaDC.id, zonaDC.x, zonaDC.y, 'test-09');
    useAlineacionStore.getState().enviarABanquillo('test-01');

    const guardada = await guardadaActual();

    expect(guardada?.fichas).toHaveLength(2);
    expect(guardada?.fichas).toContainEqual(fichaDe(9, { fotoPath: 'sub20/test-09.webp' }));
    expect(guardada?.fichas).toContainEqual(fichaDe(1));
    expect(JSON.stringify(guardada)).not.toContain('enlace-firmado');
  });

  it('un jugador personalizado no se copia como ficha: ya viaja entero con la alineación', async () => {
    const personalizado = { ...PLANTILLA_PRUEBA[0]!, id: 'personalizado-1', categoriaId: '', apellido: 'Invitado' };
    useAlineacionStore.getState().agregarJugadorPersonalizado(personalizado);
    usePlantillaStore.getState().sincronizarPersonalizados([personalizado]);
    useAlineacionStore.getState().asignarJugador(zonaDC.id, zonaDC.x, zonaDC.y, 'personalizado-1');

    const guardada = await guardadaActual();

    expect(guardada?.fichas ?? []).toEqual([]);
    expect(guardada?.jugadoresPersonalizados).toEqual([personalizado]);
  });

  it('la ficha se toma al poner al jugador: sobrevive a un cambio de categoría antes de guardar', async () => {
    useAlineacionStore.getState().asignarJugador(zonaDC.id, zonaDC.x, zonaDC.y, 'test-09');
    usePlantillaStore.setState({ jugadores: [] });

    const guardada = await guardadaActual();

    expect(guardada?.fichas).toEqual([fichaDe(9)]);
  });

  it('si la plantilla trae datos nuevos de un jugador, su ficha se actualiza al guardar', async () => {
    prepararAlineacion({
      fichas: [fichaDe(9)],
      historial: {
        pasado: [],
        presente: { ...documentoVacio(), titulares: [{ jugadorId: 'test-09', x: 50, y: 80, esCapitan: false }] },
        etiquetaPresente: 'Alineación cargada',
        futuro: [],
      },
    });
    usePlantillaStore.setState((s) => ({ jugadores: s.jugadores.map((j) => (j.id === 'test-09' ? { ...j, dorsal: 99 } : j)) }));

    const guardada = await guardadaActual();

    expect(guardada?.fichas).toEqual([fichaDe(9, { dorsal: 99 })]);
  });

  it('al abrir una alineación, sus jugadores se encuentran aunque no estén en la plantilla cargada, y no se ofrecen para elegir', async () => {
    const ficha: FichaJugador = {
      id: 'sub17-07',
      categoriaId: 'sub17',
      nombre: 'Otro',
      apellido: 'Juvenil',
      dorsal: 7,
      posicionNatural: 'MC',
      posicionesSecundarias: [],
      fotoPath: null,
    };
    const ahora = new Date().toISOString();
    const alineacion: Alineacion = {
      ...documentoVacio(),
      id: generarId(),
      nombre: 'De la Sub-17',
      creadaEn: ahora,
      modificadaEn: ahora,
      titulares: [{ jugadorId: 'sub17-07', x: 50, y: 50, esCapitan: false }],
      categoriaId: 'sub17',
      fichas: [ficha],
    };
    await alineacionRepository.guardar(alineacion);

    await useAlineacionStore.getState().cargarAlineacion(alineacion.id);
    expect(useAlineacionStore.getState().fichas).toEqual([ficha]);
    expect(useAlineacionStore.getState().categoriaId).toBe('sub17');

    // Lo que hace App con las fichas de la alineación abierta.
    usePlantillaStore.getState().sincronizarFichas(useAlineacionStore.getState().fichas);

    expect(usePlantillaStore.getState().obtenerPorId('sub17-07')).toMatchObject({ apellido: 'Juvenil', dorsal: 7, activo: false });
    expect(usePlantillaStore.getState().jugadores.some((j) => j.id === 'sub17-07')).toBe(false);
  });

  it('si el jugador está en la plantilla cargada, mandan sus datos vivos sobre la ficha guardada', () => {
    usePlantillaStore.setState((s) => ({ jugadores: s.jugadores.map((j) => (j.id === 'test-09' ? { ...j, dorsal: 99 } : j)) }));
    usePlantillaStore.getState().sincronizarFichas([fichaDe(9)]);

    expect(usePlantillaStore.getState().obtenerPorId('test-09')?.dorsal).toBe(99);
  });
});

describe('categoría de la alineación', () => {
  beforeEach(() => {
    sembrarPlantilla();
    prepararAlineacion();
  });

  it('una alineación nueva toma la categoría activa y la conserva al guardarla y al duplicarla', async () => {
    usePlantillaStore.setState({ categoriaActiva: 'sub17' });
    useAlineacionStore.getState().nuevaAlineacion('Nueva');
    expect(useAlineacionStore.getState().categoriaId).toBe('sub17');

    const guardada = await guardadaActual();
    expect(guardada?.categoriaId).toBe('sub17');

    usePlantillaStore.setState({ categoriaActiva: 'sub20' });
    await useAlineacionStore.getState().duplicarActual();
    expect(useAlineacionStore.getState().categoriaId).toBe('sub17');
  });

  it('sin categoría cargada, la alineación queda sin categoría', () => {
    usePlantillaStore.setState({ categoriaActiva: null });
    useAlineacionStore.getState().nuevaAlineacion('Sin categoría');
    expect(useAlineacionStore.getState().categoriaId).toBeNull();
  });
});
