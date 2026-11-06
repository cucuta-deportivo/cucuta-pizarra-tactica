import { Suspense } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { diferido } from './cargaDiferida';
import { useUiStore } from '../store/uiStore';

function Saludo({ texto }: { texto: string }) {
  return <p>{texto}</p>;
}

// Lo que hace el navegador cuando el trozo no llega: sin señal, o un despliegue
// nuevo que ya no sirve el archivo que pedía la pestaña abierta.
const sinRed = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

describe('diferido', () => {
  beforeEach(() => useUiStore.setState({ toasts: [] }));

  it('pinta el componente cuando llega su trozo', async () => {
    const SaludoDiferido = diferido(async () => Saludo);
    render(
      <Suspense fallback={null}>
        <SaludoDiferido texto="Hola" />
      </Suspense>,
    );
    expect(await screen.findByText('Hola')).toBeInTheDocument();
  });

  it('si el trozo no llega, la pizarra sigue en pie y avisa del fallo', async () => {
    const SaludoDiferido = diferido<{ texto: string }>(sinRed);
    render(
      <Suspense fallback={null}>
        <p>Pizarra</p>
        <SaludoDiferido texto="Hola" />
      </Suspense>,
    );
    expect(await screen.findByText('Pizarra')).toBeInTheDocument();
    expect(screen.queryByText('Hola')).not.toBeInTheDocument();
    expect(useUiStore.getState().toasts).toMatchObject([{ tipo: 'error', mensaje: expect.stringMatching(/conexión/) }]);
  });

  it('avisa una sola vez aunque fallen varios trozos a la vez', async () => {
    const A = diferido<{ texto: string }>(sinRed);
    const B = diferido<{ texto: string }>(sinRed);
    render(
      <Suspense fallback={null}>
        <p>Pizarra</p>
        <A texto="a" />
        <B texto="b" />
      </Suspense>,
    );
    expect(await screen.findByText('Pizarra')).toBeInTheDocument();
    expect(useUiStore.getState().toasts).toHaveLength(1);
  });
});
