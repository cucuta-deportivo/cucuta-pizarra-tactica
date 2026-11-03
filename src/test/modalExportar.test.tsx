import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalExportar } from '../components/ui/ModalExportar';
import { useAlineacionStore } from '../store/alineacionStore';
import { sembrarPlantilla } from './fixturePlantilla';
import { generarId } from '../utils/id';
import { canchaVacia, cuadriculaVacia } from '../utils/anexoA';
import * as exportar from '../utils/exportar';
import type { DocumentoTactico } from '../store/alineacionStore';

// La exportación real dibuja en un canvas que jsdom no tiene: aquí solo
// interesa qué le pide la ventana a cada función.
vi.mock('../utils/exportar', async (original) => ({
  ...(await original<typeof import('../utils/exportar')>()),
  exportarCampoAPng: vi.fn(async () => new Blob()),
  exportarCampoAPdf: vi.fn(async () => undefined),
  exportarAlineacionAJson: vi.fn(),
  descargarBlob: vi.fn(),
}));

const CASILLAS = ['Incluir rival', 'Incluir balón', 'Incluir objetos', 'Incluir dibujos (flechas, líneas, zonas)'];

function documento(cambios: Partial<DocumentoTactico> = {}): DocumentoTactico {
  return {
    formacionId: '4-3-3',
    titulares: [{ jugadorId: 'test-09', x: 50, y: 84, zonaOrigenId: 'DC-9', esCapitan: false }],
    banquillo: [],
    trazos: [{ id: 't1', tipo: 'flecha', puntos: [{ x: 10, y: 10 }, { x: 40, y: 40 }], color: '#D4111E', grosor: 2 }],
    notas: '',
    objetos: [{ id: 'o1', tipo: 'cono', x: 30, y: 20, color: 'naranja', rotacion: 0 }],
    balones: [{ id: 'b1', x: 50, y: 50, jugadorPoseedorId: null }],
    cuadricula: cuadriculaVacia(),
    rival: {
      nombre: 'Rival',
      formacionId: '4-4-2',
      paleta: 'azul',
      jugadores: [{ id: 'r1', dorsal: 5, posicion: 'DFC', x: 40, y: 80 }],
      visible: true,
      modoVista: 'ambos',
    },
    marcajes: [],
    cancha: canchaVacia(),
    jugadoresPersonalizados: [],
    secuencia: null,
    ...cambios,
  };
}

function prepararAlineacion(doc: DocumentoTactico): void {
  const ahora = new Date().toISOString();
  useAlineacionStore.setState({
    id: generarId(),
    nombre: 'Prueba de exportación',
    creadaEn: ahora,
    modificadaEn: ahora,
    historial: { pasado: [], presente: doc, etiquetaPresente: 'Alineación inicial', futuro: [] },
    estadoGuardado: 'guardado',
  });
}

const elementos = () => ({
  svg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
  canvas: null,
  ancho: 400,
  alto: 260,
  orientacion: 'horizontal' as const,
});
const ventana = (abierto = true) => <ModalExportar abierto={abierto} onCerrar={() => {}} obtenerElementos={elementos} />;

describe('ventana de exportar: qué sale en la imagen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sembrarPlantilla();
  });

  it('con rival, balón, objetos y dibujos en el campo: una casilla para cada uno, todas marcadas', () => {
    prepararAlineacion(documento());
    render(ventana());
    for (const nombre of CASILLAS) expect(screen.getByLabelText(nombre)).toBeChecked();
  });

  it('solo aparece la casilla de lo que hay en el campo', () => {
    prepararAlineacion(documento({ rival: null, trazos: [] }));
    render(ventana());
    expect(screen.queryByLabelText('Incluir rival')).toBeNull();
    expect(screen.queryByLabelText('Incluir dibujos (flechas, líneas, zonas)')).toBeNull();
    expect(screen.getByLabelText('Incluir balón')).toBeChecked();
    expect(screen.getByLabelText('Incluir objetos')).toBeChecked();
  });

  it('cada casilla es una fila de al menos 44 px de alto', () => {
    prepararAlineacion(documento());
    render(ventana());
    for (const nombre of CASILLAS) expect(screen.getByLabelText(nombre).closest('label')).toHaveClass('min-h-[44px]');
  });

  it('lo desmarcado no sale en PNG ni en PDF; el JSON lleva todo', async () => {
    prepararAlineacion(documento());
    const usuario = userEvent.setup();
    render(ventana());
    await usuario.click(screen.getByLabelText('Incluir rival'));
    await usuario.click(screen.getByLabelText('Incluir objetos'));

    await usuario.click(screen.getByRole('button', { name: /Exportar a PNG/ }));
    await waitFor(() => expect(exportar.exportarCampoAPng).toHaveBeenCalledTimes(1));
    const esperado = { rival: false, balon: true, objetos: false, dibujos: true };
    expect(vi.mocked(exportar.exportarCampoAPng).mock.calls[0]![0].incluir).toEqual(esperado);

    await usuario.click(screen.getByRole('button', { name: /Exportar a PDF/ }));
    await waitFor(() => expect(exportar.exportarCampoAPdf).toHaveBeenCalledTimes(1));
    expect(vi.mocked(exportar.exportarCampoAPdf).mock.calls[0]![0].incluir).toEqual(esperado);

    await usuario.click(screen.getByRole('button', { name: /Exportar alineación \(JSON\)/ }));
    const json = vi.mocked(exportar.exportarAlineacionAJson).mock.calls[0]![0];
    expect(json.rival?.jugadores).toHaveLength(1);
    expect(json.objetos).toHaveLength(1);
    expect(json.balones).toHaveLength(1);
    expect(json.trazos).toHaveLength(1);
  });

  it('al volver a abrir la ventana, todas vuelven a estar marcadas', async () => {
    prepararAlineacion(documento());
    const usuario = userEvent.setup();
    const { rerender } = render(ventana());
    await usuario.click(screen.getByLabelText('Incluir balón'));
    expect(screen.getByLabelText('Incluir balón')).not.toBeChecked();

    rerender(ventana(false));
    rerender(ventana(true));
    expect(screen.getByLabelText('Incluir balón')).toBeChecked();
  });
});
