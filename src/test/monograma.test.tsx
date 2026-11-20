import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LineasCampo } from '../components/campo/LineasCampo';
import { ModalCancha } from '../components/ui/ModalCancha';
import { useAlineacionStore } from '../store/alineacionStore';
import { incrustarImagenes } from '../utils/exportar';
import type { Orientacion, TemaCancha } from '../types';

/**
 * El monograma del club en el círculo central: centrado por el cruce de sus
 * barras, siempre derecho, sin recibir toques, con la opacidad de cada tema y
 * dentro del círculo. Medidas del original (marca/logo-arco-blanco.png,
 * 566 × 574): cruce de las barras en (234,98; 348,50), punta de la estrella en
 * (253–254, 0) y punta lateral derecha en (565–566, 347).
 */
const ORIGINAL = { ancho: 566, alto: 574 };
const CRUCE = { x: 234.98, y: 348.5 };
const RADIO_CIRCULO = 9.15;

function monograma(container: HTMLElement): SVGImageElement {
  const imagen = container.querySelector('image');
  if (!imagen) throw new Error('no se pintó el monograma');
  return imagen;
}

/** Un punto del original, en las coordenadas del campo (metros). */
function puntoDelOriginal(imagen: SVGImageElement, x: number, y: number) {
  const n = (atributo: string) => Number(imagen.getAttribute(atributo));
  return { x: n('x') + (x / ORIGINAL.ancho) * n('width'), y: n('y') + (y / ORIGINAL.alto) * n('height') };
}

describe('monograma en el círculo central', () => {
  it.each<[Orientacion, boolean, { x: number; y: number }]>([
    ['vertical', false, { x: 34, y: 52.5 }],
    ['horizontal', false, { x: 52.5, y: 34 }],
    ['vertical', true, { x: 34, y: 52.5 }],
    ['horizontal', true, { x: 52.5, y: 34 }],
  ])('en %s (girado 180°: %s) el cruce de sus barras cae en el punto central', (orientacion, rotado180, centro) => {
    const { container } = render(<LineasCampo orientacion={orientacion} rotado180={rotado180} />);
    const cruce = puntoDelOriginal(monograma(container), CRUCE.x, CRUCE.y);
    expect(cruce.x).toBeCloseTo(centro.x, 6);
    expect(cruce.y).toBeCloseTo(centro.y, 6);
  });

  it('siempre derecho: sin giro propio ni de un grupo que lo envuelva', () => {
    for (const orientacion of ['vertical', 'horizontal'] as const) {
      for (const rotado180 of [false, true]) {
        const { container, unmount } = render(<LineasCampo orientacion={orientacion} rotado180={rotado180} />);
        const imagen = monograma(container);
        expect(imagen.getAttribute('transform')).toBeNull();
        expect(imagen.parentElement?.tagName.toLowerCase()).toBe('svg');
        unmount();
      }
    }
  });

  it('mide el 78 % del diámetro y no se deforma', () => {
    const { container } = render(<LineasCampo orientacion="horizontal" />);
    const imagen = monograma(container);
    expect(Number(imagen.getAttribute('height'))).toBeCloseTo(2 * RADIO_CIRCULO * 0.78, 6);
    expect(Number(imagen.getAttribute('width')) / Number(imagen.getAttribute('height'))).toBeCloseTo(379 / 384, 6);
    expect(imagen.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('la estrella y las puntas quedan dentro del círculo, sin tocar su línea', () => {
    const { container } = render(<LineasCampo orientacion="vertical" />);
    const imagen = monograma(container);
    const distancia = (p: { x: number; y: number }) => Math.hypot(p.x - 34, p.y - 52.5);
    // 0,45 m: unos 2 px libres en un móvil de 390 px (el círculo mide 101 px) y 4 en la tablet.
    expect(RADIO_CIRCULO - distancia(puntoDelOriginal(imagen, 254, 0))).toBeGreaterThan(0.45);
    expect(RADIO_CIRCULO - distancia(puntoDelOriginal(imagen, 566, 347))).toBeGreaterThan(0.45);
    expect(RADIO_CIRCULO - distancia(puntoDelOriginal(imagen, 0, 347))).toBeGreaterThan(0.45);
  });

  it('no recibe toques ni arrastres: el balón empieza encima', () => {
    const { container } = render(<LineasCampo orientacion="horizontal" />);
    expect(monograma(container).getAttribute('pointer-events')).toBe('none');
  });

  it.each<[TemaCancha, string]>([
    ['estadio', '0.1'],
    ['neutro', '0.1'],
    ['entrenamiento', '0.1'],
    ['tactico', '0.08'],
  ])('tema %s: opacidad %s', (tema, opacidad) => {
    const { container } = render(<LineasCampo orientacion="horizontal" tema={tema} />);
    expect(monograma(container).style.opacity).toBe(opacidad);
  });

  it('solo lo quita la casilla de la Cancha: no se oculta por tener jugadores en el círculo', () => {
    // Su opacidad solo depende del tema; los jugadores se pintan encima (lo comprueba la prueba en el navegador).
    const { container } = render(<LineasCampo orientacion="horizontal" />);
    expect(monograma(container).style.opacity).toBe('0.1');
    expect(monograma(container).style.transition).toBe('');
    const sinMonograma = render(<LineasCampo orientacion="horizontal" mostrarEscudo={false} />);
    expect(sinMonograma.container.querySelector('image')).toBeNull();
  });
});

describe('exportación del monograma', () => {
  const NS = 'http://www.w3.org/2000/svg';
  function svgConMonograma(): SVGSVGElement {
    const svg = document.createElementNS(NS, 'svg');
    const imagen = document.createElementNS(NS, 'image');
    imagen.setAttribute('href', '/escudos/monograma.png');
    svg.appendChild(imagen);
    return svg;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('se incrusta en una copia del SVG, porque un SVG dibujado como imagen no carga archivos de fuera', async () => {
    const pedidas: string[] = [];
    vi.stubGlobal('fetch', async (ruta: string) => {
      pedidas.push(ruta);
      return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) };
    });
    const svg = svgConMonograma();
    const copia = await incrustarImagenes(svg);
    expect(pedidas).toEqual(['/escudos/monograma.png']);
    expect(copia.querySelector('image')?.getAttribute('href')).toBe('data:image/png;base64,iVBORw==');
    // La pantalla sigue con su archivo.
    expect(svg.querySelector('image')?.getAttribute('href')).toBe('/escudos/monograma.png');
  });

  it('si no carga, la exportación sigue sin él', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, blob: async () => new Blob() }));
    expect((await incrustarImagenes(svgConMonograma())).querySelector('image')).toBeNull();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect((await incrustarImagenes(svgConMonograma())).querySelector('image')).toBeNull();
  });
});

describe('casilla del monograma en la ventana Cancha', () => {
  beforeEach(() => {
    useAlineacionStore.getState().nuevaAlineacion();
  });

  it.each<TemaCancha>(['estadio', 'neutro', 'entrenamiento', 'tactico'])('aparece con el tema %s y lo quita', async (tema) => {
    useAlineacionStore.getState().actualizarCancha({ tema });
    render(<ModalCancha abierto onCerrar={() => {}} />);
    const casilla = screen.getByRole('checkbox', { name: 'Monograma en el círculo central' });
    expect(casilla).toBeChecked();
    await userEvent.click(casilla);
    expect(useAlineacionStore.getState().historial.presente.cancha.mostrarEscudo).toBe(false);
  });

  it('cada casilla tiene una zona táctil de 44 px de alto (toda su fila)', () => {
    render(<ModalCancha abierto onCerrar={() => {}} />);
    const casillas = screen.getAllByRole('checkbox');
    expect(casillas.map((c) => c.closest('label')?.textContent?.trim())).toEqual([
      'Monograma en el círculo central',
      'Vallas perimetrales',
      'Girar 180° (perspectiva rival)',
    ]);
    for (const casilla of casillas) expect(casilla.closest('label')).toHaveClass('min-h-[44px]');
  });

  it('las vallas siguen siendo solo del tema Estadio', () => {
    useAlineacionStore.getState().actualizarCancha({ tema: 'neutro' });
    render(<ModalCancha abierto onCerrar={() => {}} />);
    expect(screen.queryByRole('checkbox', { name: 'Vallas perimetrales' })).toBeNull();
  });
});
