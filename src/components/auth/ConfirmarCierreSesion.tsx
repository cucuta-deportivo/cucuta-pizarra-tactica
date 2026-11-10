import { Boton } from '../ui/Boton';
import { Modal } from '../ui/Modal';

/**
 * S1.13: antes de cerrar sesión a propósito, si hay alineaciones sin subir, se
 * avisa y se deja elegir. No se pierden: se quedan en el dispositivo y se suben
 * cuando vuelva a entrar un entrenador.
 */
export function ConfirmarCierreSesion({ sinSubir, onCerrarIgual, onCancelar }: { sinSubir: number; onCerrarIgual: () => void; onCancelar: () => void }) {
  const mensaje =
    sinSubir === 1
      ? 'Hay 1 alineación sin subir; se subirá cuando vuelvas a entrar.'
      : `Hay ${sinSubir} alineaciones sin subir; se subirán cuando vuelvas a entrar.`;
  return (
    <Modal abierto onCerrar={onCancelar} titulo="Cerrar sesión" ancho="sm">
      <div className="flex flex-col gap-4 text-sm text-club-plata">
        <p>{mensaje}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Boton variante="fantasma" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onCerrarIgual}>
            Cerrar igual
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
