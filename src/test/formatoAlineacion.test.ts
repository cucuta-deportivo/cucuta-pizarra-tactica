import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sembrarPlantilla } from './fixturePlantilla';
import { useAlineacionStore } from '../store/alineacionStore';
import { usePlantillaStore } from '../store/plantillaStore';
import { useUiStore } from '../store/uiStore';
import { alineacionRepository } from '../data/repositorio';
import { obtenerFormacion } from '../data/formaciones';
import { FORMATO_ALINEACION } from '../utils/formatoAlineacion';
import { leerArchivoDeAlineaciones } from '../utils/exportar';
import { FORMATO_RESPALDO } from '../data/sincronizacion/migrar';
import type { Alineacion } from '../types';

/**
 * Cada alineación guarda la versión de formato con que se guardó. Una versión
 * de la app que abre una de formato más nuevo no la deja editar (solo lectura,
 * con aviso) y nunca la sobrescribe: perdería lo que no conoce.
 */
const estado = () => useAlineacionStore.getState();
const doc = () => estado().historial.presente;

/** Una alineación guardada por la app, con un jugador en el campo y una jugada de dos fases. */
async function guardarUna(nombre: string): Promise<Alineacion> {
  estado().nuevaAlineacion(nombre);
  const zona = obtenerFormacion(doc().formacionId)!.zonas[0]!;
  estado().asignarJugador(zona.id, zona.x, zona.y, usePlantillaStore.getState().jugadores[0]!.id);
  estado().iniciarSecuencia();
  estado().agregarFrame();
  estado().cerrarJugada();
  await estado().guardarAhora();
  return (await alineacionRepository.obtener(estado().id))!;
}

/** La misma, como si la hubiera guardado una versión futura de la app, con un dato que esta no conoce. */
async function guardarDelFuturo(): Promise<Alineacion> {
  const actual = await guardarUna('Del futuro');
  const delFuturo = { ...actual, formato: FORMATO_ALINEACION + 1, datoQueEstaVersionNoConoce: { fases: [1, 2, 3] } } as Alineacion;
  await alineacionRepository.guardar(delFuturo);
  return delFuturo;
}

describe('formato de la alineación', () => {
  beforeEach(() => {
    sembrarPlantilla();
    useUiStore.setState({ toasts: [] });
  });

  it('al guardar, la alineación lleva el formato de esta app', async () => {
    const guardada = await guardarUna('Con formato');
    expect(guardada.formato).toBe(FORMATO_ALINEACION);
    expect(estado().alineacionSoloLectura).toBeNull();
  });

  it('una de antes, sin formato, se abre editable y al guardarla pasa al formato de esta app', async () => {
    const { formato: _formato, ...deAntes } = await guardarUna('De antes');
    await alineacionRepository.guardar(deAntes);
    await estado().cargarAlineacion(deAntes.id);
    expect(estado().alineacionSoloLectura).toBeNull();

    estado().renombrar('De antes, editada');
    await estado().guardarAhora();
    expect(await alineacionRepository.obtener(deAntes.id)).toMatchObject({ nombre: 'De antes, editada', formato: FORMATO_ALINEACION });
  });

  it('una de formato más nuevo se abre en solo lectura, con un aviso fijo', async () => {
    const delFuturo = await guardarDelFuturo();
    await estado().cargarAlineacion(delFuturo.id);
    expect(estado().alineacionSoloLectura).toEqual(delFuturo);
    const aviso = useUiStore.getState().toasts.find((t) => t.fijo);
    expect(aviso?.mensaje).toMatch(/solo lectura\. Actualiza la app para editarla/);
  });

  it('en solo lectura nada la cambia ni se guarda, y avisa de que hay que actualizar la app', async () => {
    const delFuturo = await guardarDelFuturo();
    await estado().cargarAlineacion(delFuturo.id);
    const { revision } = (await alineacionRepository.abrir(delFuturo.id))!;
    const documento = doc();
    useUiStore.setState({ toasts: [] });
    // Al abrir ya salió el aviso fijo; el de cada intento se espacia 4 s para no repetirse en cada toque.
    const ahora = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(ahora + 5000);

    estado().seleccionarFormacion('4-4-2');
    estado().activarRival('4-3-3');
    estado().agregarObjeto('cono', 50, 50, 'naranja');
    estado().abrirJugada();
    estado().renombrar('Otro nombre');
    await estado().duplicarActual();
    await estado().guardarAhora();

    expect(doc()).toBe(documento);
    expect(estado().nombre).toBe('Del futuro');
    expect(estado().estadoGuardado).toBe('guardado');
    expect(useUiStore.getState().toasts.map((t) => t.mensaje)).toEqual([
      'Actualiza la app para editar esta alineación: se guardó con una versión más nueva.',
    ]);
    const despues = await alineacionRepository.abrir(delFuturo.id);
    expect(despues).toEqual({ alineacion: delFuturo, revision });
    expect((await alineacionRepository.listar()).some((a) => a.nombre.includes('(copia'))).toBe(false);
    vi.restoreAllMocks();
  });

  it('en solo lectura se puede mirar otra fase de su jugada, sin guardar nada', async () => {
    const actual = await guardarUna('Jugada del futuro');
    const conJugadaAbierta = { ...actual, secuencia: { ...actual.jugadas![0]!, posicion: 0 }, jugadas: [], formato: FORMATO_ALINEACION + 1 };
    await alineacionRepository.guardar(conJugadaAbierta);
    await estado().cargarAlineacion(actual.id);

    estado().irAFrame(0);
    expect(doc().secuencia!.indiceActivo).toBe(0);
    expect(estado().estadoGuardado).toBe('guardado');
    expect(await alineacionRepository.obtener(actual.id)).toEqual(conJugadaAbierta);
  });

  it('el repositorio local no la sobrescribe aunque se lo pidan', async () => {
    const delFuturo = await guardarDelFuturo();
    const { formato: _formato, ...version } = delFuturo;
    expect(await alineacionRepository.guardar({ ...version, formato: FORMATO_ALINEACION, nombre: 'Pisada' })).toEqual({ guardada: false });
    expect(await alineacionRepository.obtener(delFuturo.id)).toEqual(delFuturo);
  });

  it('al abrir o crear otra, deja de ser de solo lectura', async () => {
    const delFuturo = await guardarDelFuturo();
    await estado().cargarAlineacion(delFuturo.id);
    estado().nuevaAlineacion('Nueva');
    expect(estado().alineacionSoloLectura).toBeNull();
  });

  it('importar un JSON o un respaldo de formato más nuevo pide actualizar la app', async () => {
    const delFuturo = await guardarDelFuturo();
    const aviso = 'El archivo es de una versión más nueva de la app. Actualiza la app para importarlo.';
    expect(() => leerArchivoDeAlineaciones(JSON.stringify(delFuturo))).toThrow(aviso);
    const respaldo = { formato: FORMATO_RESPALDO, creadoEn: new Date().toISOString(), alineaciones: [delFuturo] };
    expect(() => leerArchivoDeAlineaciones(JSON.stringify(respaldo))).toThrow(aviso);

    const { formato: _formato, ...deAntes } = delFuturo;
    expect(leerArchivoDeAlineaciones(JSON.stringify(deAntes)).tipo).toBe('una');
  });
});
