import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Boton } from '../ui/Boton';
import type { Posicion } from '../../types';

interface ModalAgregarRivalProps {
  abierto: boolean;
  posicion: Posicion | null;
  /** Lo que sale escrito al abrir (F5.2): el número clásico de la zona al añadir, o lo que ya tiene al cambiarlo. */
  dorsalInicial?: number | null;
  apellidoInicial?: string;
  /** Cambiar el dorsal o el apellido de un rival ya colocado, en vez de añadir uno. */
  editando?: boolean;
  onCerrar: () => void;
  onAgregar: (dorsal: number, apellido: string) => void;
}

export function ModalAgregarRival({
  abierto,
  posicion,
  dorsalInicial = null,
  apellidoInicial = '',
  editando = false,
  onCerrar,
  onAgregar,
}: ModalAgregarRivalProps) {
  const [dorsal, setDorsal] = useState('');
  const [apellido, setApellido] = useState('');

  useEffect(() => {
    if (abierto) {
      setDorsal(dorsalInicial === null ? '' : String(dorsalInicial));
      setApellido(apellidoInicial);
    }
  }, [abierto, dorsalInicial, apellidoInicial]);

  function confirmar(): void {
    const numero = Number(dorsal);
    if (!Number.isInteger(numero) || numero < 1 || numero > 99) return;
    onAgregar(numero, apellido.trim());
    onCerrar();
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={`Jugador rival${posicion ? ` (${posicion})` : ''}`} ancho="sm">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-club-plata/60">
          {editando
            ? 'Pon el dorsal real del rival si lo conoces. El apellido es opcional.'
            : 'No hace falta plantilla completa: con el dorsal basta. El apellido es opcional.'}
        </p>
        <label className="text-xs text-club-plata">
          Dorsal *
          <input
            type="number"
            min={1}
            max={99}
            autoFocus
            value={dorsal}
            onChange={(e) => setDorsal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmar()}
            className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
          />
        </label>
        <label className="text-xs text-club-plata">
          Apellido (opcional)
          <input
            type="text"
            maxLength={30}
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmar()}
            className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo"
          />
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={confirmar} disabled={!dorsal}>
            {editando ? 'Guardar' : 'Añadir'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
