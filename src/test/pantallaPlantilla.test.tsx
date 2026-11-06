import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PantallaPlantilla } from '../components/plantilla/PantallaPlantilla';
import { sembrarPlantilla } from './fixturePlantilla';

describe('PantallaPlantilla', () => {
  afterEach(() => vi.restoreAllMocks());

  it('abierta no programa su propia renovación de enlaces: ya la hace plantillaStore cada 30 s', () => {
    sembrarPlantilla();
    const programar = vi.spyOn(window, 'setInterval');
    render(<PantallaPlantilla abierto onCerrar={() => undefined} />);
    // Consulta síncrona: las de tipo findBy sondean con setInterval y contarían aquí.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(programar).not.toHaveBeenCalled();
  });
});
