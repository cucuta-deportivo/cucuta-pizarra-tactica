import { Boton } from '../ui/Boton';
import { Modal } from '../ui/Modal';

/**
 * S1.13: antes de cerrar sesión a propósito se avisa si hay alineaciones sin
 * subir (no se pierden: se quedan en el dispositivo y se suben cuando vuelva a
 * entrar un entrenador). Cerrar en todos los dispositivos, pensado para una
 * tablet perdida o robada, se confirma siempre.
 */
export function ConfirmarCierreSesion({
  sinSubir,
  enTodos = false,
  onCerrarIgual,
  onCancelar,
}: {
  sinSubir: number;
  enTodos?: boolean;
  onCerrarIgual: () => void;
  onCancelar: () => void;
}) {
  const pendientes =
    sinSubir === 0
      ? null
      : sinSubir === 1
        ? 'Hay 1 alineación sin subir; se subirá cuando vuelvas a entrar.'
        : `Hay ${sinSubir} alineaciones sin subir; se subirán cuando vuelvas a entrar.`;
  return (
    <Modal abierto onCerrar={onCancelar} titulo={enTodos ? 'Cerrar sesión en todos los dispositivos' : 'Cerrar sesión'} ancho="sm">
      <div className="flex flex-col gap-4 text-sm text-club-plata">
        {enTodos && (
          <p>
            Se cerrará tu sesión aquí y en todos los dispositivos donde hayas entrado; por ejemplo, una tablet perdida o robada. En
            los demás se cierra cuando tengan señal; puede tardar hasta una hora.
          </p>
        )}
        {pendientes && <p>{pendientes}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Boton variante="fantasma" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" onClick={onCerrarIgual}>
            {enTodos ? 'Cerrar en todos' : 'Cerrar igual'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
