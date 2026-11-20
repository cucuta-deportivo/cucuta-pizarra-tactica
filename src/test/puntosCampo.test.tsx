import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LineasCampo } from '../components/campo/LineasCampo';
import type { Orientacion } from '../types';

/**
 * Punto central y puntos de penalti. Un `<circle>` se coloca con cx/cy: con
 * x/y los tres salían en la esquina (0, 0) del campo, en pantalla y en lo
 * exportado. Campo de 68 × 105 m; los penaltis a 11 m de cada portería.
 */
function puntos(orientacion: Orientacion, rotado180 = false) {
  const { container } = render(<LineasCampo orientacion={orientacion} rotado180={rotado180} />);
  return Array.from(container.querySelectorAll('circle'))
    .filter((c) => c.getAttribute('r') === '0.42')
    .map((c) => ({
      cx: Number(c.getAttribute('cx')),
      cy: Number(c.getAttribute('cy')),
      conXY: c.hasAttribute('x') || c.hasAttribute('y'),
    }));
}

const ordenar = (lista: { cx: number; cy: number }[]) => [...lista].sort((a, b) => a.cx - b.cx || a.cy - b.cy);

describe('punto central y puntos de penalti', () => {
  it.each<[Orientacion, boolean, { cx: number; cy: number }[]]>([
    ['vertical', false, [{ cx: 34, cy: 11 }, { cx: 34, cy: 52.5 }, { cx: 34, cy: 94 }]],
    ['horizontal', false, [{ cx: 11, cy: 34 }, { cx: 52.5, cy: 34 }, { cx: 94, cy: 34 }]],
    ['vertical', true, [{ cx: 34, cy: 11 }, { cx: 34, cy: 52.5 }, { cx: 34, cy: 94 }]],
    ['horizontal', true, [{ cx: 11, cy: 34 }, { cx: 52.5, cy: 34 }, { cx: 94, cy: 34 }]],
  ])('en %s (girado 180°: %s) cada uno está en su sitio', (orientacion, rotado180, esperados) => {
    const encontrados = puntos(orientacion, rotado180);
    expect(encontrados).toHaveLength(3);
    expect(encontrados.some((p) => p.conXY)).toBe(false);
    ordenar(encontrados).forEach((p, i) => {
      expect(p.cx).toBeCloseTo(esperados[i]!.cx, 6);
      expect(p.cy).toBeCloseTo(esperados[i]!.cy, 6);
    });
  });
});
