import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalMigracion } from '../components/ui/ModalMigracion';

/** S1.8: la ventana que ofrece el respaldo y sube las alineaciones de este navegador. */
function abrir(resultado: { subidas: number; total: number }, porMigrar = { ids: ['a', 'b'], vacias: 0 }) {
  const migrar = vi.fn(async (_ids: string[], alAvanzar: (subidas: number) => void) => {
    alAvanzar(1);
    return resultado;
  });
  const descargarRespaldo = vi.fn(async () => undefined);
  const onCerrar = vi.fn();
  render(<ModalMigracion abierto porMigrar={porMigrar} migrar={migrar} descargarRespaldo={descargarRespaldo} onCerrar={onCerrar} />);
  return { migrar, descargarRespaldo, onCerrar };
}

describe('ventana de migración', () => {
  it('dice cuántas hay, ofrece el respaldo con su advertencia y sube al pedirlo', async () => {
    const usuario = userEvent.setup();
    const { migrar, descargarRespaldo } = abrir({ subidas: 2, total: 2 });

    expect(screen.getByText(/Hay 2 alineaciones guardadas solo en este navegador/)).toBeInTheDocument();
    expect(screen.getByText('El archivo tiene datos de jugadores: guárdalo en un lugar privado.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /Descargar respaldo/ }));
    expect(descargarRespaldo).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole('button', { name: 'Subir ahora' }));
    expect(migrar).toHaveBeenCalledWith(['a', 'b'], expect.any(Function));
    expect(await screen.findByText('Subidas 2 de 2.')).toBeInTheDocument();
  });

  it('si no suben todas, avisa de que las demás se reintentan solas', async () => {
    const usuario = userEvent.setup();
    abrir({ subidas: 1, total: 3 }, { ids: ['a', 'b', 'c'], vacias: 1 });

    expect(screen.getByText('1 vacía sin tocar se queda solo en este navegador.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir ahora' }));
    expect(await screen.findByText('Subidas 1 de 3.')).toBeInTheDocument();
    expect(screen.getByText('Las 2 restantes siguen pendientes y se reintentan solas.')).toBeInTheDocument();
  });

  it('"Más tarde" cierra sin subir nada', async () => {
    const usuario = userEvent.setup();
    const { migrar, onCerrar } = abrir({ subidas: 0, total: 2 });

    await usuario.click(screen.getByRole('button', { name: 'Más tarde' }));
    expect(onCerrar).toHaveBeenCalled();
    expect(migrar).not.toHaveBeenCalled();
  });

  it('con una sola, habla en singular', () => {
    abrir({ subidas: 1, total: 1 }, { ids: ['a'], vacias: 0 });
    expect(screen.getByText(/Hay 1 alineación guardada solo en este navegador\. Al subirla, la verán/)).toBeInTheDocument();
  });
});
