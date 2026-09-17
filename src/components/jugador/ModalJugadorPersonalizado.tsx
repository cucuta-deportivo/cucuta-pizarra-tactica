import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Boton } from '../ui/Boton';
import { usePlantillaStore } from '../../store/plantillaStore';
import { generarId } from '../../utils/id';
import { ETIQUETAS_POSICION, ORDEN_POSICION } from '../../utils/constantes';
import type { Jugador, Posicion } from '../../types';

interface ModalJugadorPersonalizadoProps {
  abierto: boolean;
  /** Posición de la zona desde la que se abrió; desde el banquillo llega `null` y hay que elegirla. */
  posicionSugerida: Posicion | null;
  onCerrar: () => void;
  onCrear: (jugador: Jugador) => void;
  /** Si viene un jugador, el modal edita sus datos en vez de crear uno nuevo. */
  jugadorAEditar?: Jugador | null;
  onEditar?: (jugadorId: string, datos: DatosEditados) => void;
}

export interface DatosEditados {
  nombre: string;
  apellido: string;
  dorsal: number;
  posicionNatural: Posicion;
  posicionesSecundarias: Posicion[];
}

const MAX_TEXTO = 40;
/** Letras con tildes y ñ, espacios, apóstrofes y guiones: "D'Alessandro", "Núñez", "Ruiz-Díaz". */
const TEXTO_VALIDO = /^[\p{L}][\p{L}\s'’-]*$/u;

export function ModalJugadorPersonalizado({
  abierto,
  posicionSugerida,
  onCerrar,
  onCrear,
  jugadorAEditar,
  onEditar,
}: ModalJugadorPersonalizadoProps) {
  const jugadores = usePlantillaStore((s) => s.jugadores);
  const editando = Boolean(jugadorAEditar);

  const [apellido, setApellido] = useState('');
  const [nombre, setNombre] = useState('');
  const [dorsal, setDorsal] = useState('');
  const [posicion, setPosicion] = useState<Posicion | ''>('');
  const [secundaria, setSecundaria] = useState<Posicion | ''>('');
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setApellido(jugadorAEditar?.apellido ?? '');
    setNombre(jugadorAEditar?.nombre ?? '');
    setDorsal(jugadorAEditar ? String(jugadorAEditar.dorsal) : '');
    setPosicion(jugadorAEditar?.posicionNatural ?? posicionSugerida ?? '');
    setSecundaria(jugadorAEditar?.posicionesSecundarias[0] ?? '');
    setIntentado(false);
  }, [abierto, posicionSugerida, jugadorAEditar]);

  const apellidoLimpio = apellido.trim();
  const nombreLimpio = nombre.trim();
  const numero = Number(dorsal);

  const errorApellido = !apellidoLimpio
    ? 'El apellido es obligatorio.'
    : apellidoLimpio.length > MAX_TEXTO
      ? `Máximo ${MAX_TEXTO} caracteres.`
      : !TEXTO_VALIDO.test(apellidoLimpio)
        ? 'Solo letras, espacios, apóstrofes y guiones.'
        : null;

  const errorNombre = !nombreLimpio
    ? null
    : nombreLimpio.length > MAX_TEXTO
      ? `Máximo ${MAX_TEXTO} caracteres.`
      : !TEXTO_VALIDO.test(nombreLimpio)
        ? 'Solo letras, espacios, apóstrofes y guiones.'
        : null;

  const errorDorsal = !dorsal
    ? 'El dorsal es obligatorio.'
    : !Number.isInteger(numero) || numero < 1 || numero > 99
      ? 'Debe ser un número del 1 al 99.'
      : null;

  const dorsalRepetido =
    !errorDorsal && jugadores.some((j) => j.dorsal === numero && j.id !== jugadorAEditar?.id);
  const errorPosicion = posicion === '' ? 'Elige una posición.' : null;
  const valido = !errorApellido && !errorNombre && !errorDorsal && !errorPosicion;

  function confirmar(): void {
    setIntentado(true);
    if (!valido) return;
    const datos = {
      nombre: nombreLimpio,
      apellido: apellidoLimpio,
      dorsal: numero,
      posicionNatural: posicion as Posicion,
      // El modelo admite varias secundarias, pero aquí se edita una sola: se
      // guarda como lista de uno (o vacía) para no romper el filtrado del selector.
      posicionesSecundarias: secundaria === '' ? [] : [secundaria],
    };
    if (jugadorAEditar && onEditar) onEditar(jugadorAEditar.id, datos);
    else
      onCrear({
        id: `pers-${generarId()}`,
        ...datos,
        // Un jugador creado a mano en la pizarra no pertenece a ninguna
        // categoría de la plantilla ni tiene foto en el bucket.
        categoriaId: '',
        fotoUrl: null,
        fotoPath: null,
        piePreferido: 'derecho',
        activo: true,
      });
    onCerrar();
  }

  const claseCampo =
    'mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-club-rojo';
  const mostrar = (error: string | null) => (intentado && error ? error : null);

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={editando ? 'Editar jugador' : 'Jugador personalizado'}
      ancho="sm"
    >
      <div
        className="flex flex-col gap-3"
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar();
        }}
      >
        <p className="text-xs text-club-plata/60">
          {editando
            ? 'Los cambios se guardan para todas las alineaciones y no mueven al jugador de su sitio en el campo.'
            : 'Para alguien que no está en la plantilla del club: un juvenil, una prueba o un refuerzo. Se guarda con esta alineación y viaja con ella al exportarla.'}
        </p>

        <label className="text-xs text-club-plata">
          Apellido *
          <input
            type="text"
            autoFocus
            maxLength={MAX_TEXTO}
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            className={claseCampo}
          />
          {mostrar(errorApellido) && <span className="mt-1 block text-[11px] text-club-rojo">{errorApellido}</span>}
        </label>

        <label className="text-xs text-club-plata">
          Nombre (opcional)
          <input
            type="text"
            maxLength={MAX_TEXTO}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseCampo}
          />
          {mostrar(errorNombre) && <span className="mt-1 block text-[11px] text-club-rojo">{errorNombre}</span>}
        </label>

        <div className="flex gap-3">
          <label className="w-24 shrink-0 text-xs text-club-plata">
            Dorsal *
            <input
              type="number"
              min={1}
              max={99}
              value={dorsal}
              onChange={(e) => setDorsal(e.target.value)}
              className={claseCampo}
            />
          </label>
          <label className="flex-1 text-xs text-club-plata">
            Posición principal *
            <select
              value={posicion}
              onChange={(e) => {
                const nueva = e.target.value as Posicion;
                setPosicion(nueva);
                // Si la secundaria pasa a coincidir con la principal, se limpia sola.
                if (nueva === secundaria) setSecundaria('');
              }}
              className={claseCampo}
            >
              <option value="">Elegir…</option>
              {ORDEN_POSICION.map((p) => (
                <option key={p} value={p} className="bg-club-carbon">
                  {p} · {ETIQUETAS_POSICION[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-club-plata">
          Posición secundaria (opcional)
          <select value={secundaria} onChange={(e) => setSecundaria(e.target.value as Posicion | '')} className={claseCampo}>
            <option value="">Ninguna</option>
            {ORDEN_POSICION.map((p) => (
              <option key={p} value={p} disabled={p === posicion} className="bg-club-carbon">
                {p} · {ETIQUETAS_POSICION[p]}
                {p === posicion ? ' — ya es la principal' : ''}
              </option>
            ))}
          </select>
        </label>
        {mostrar(errorDorsal) && <span className="-mt-2 text-[11px] text-club-rojo">{errorDorsal}</span>}
        {mostrar(errorPosicion) && <span className="-mt-2 text-[11px] text-club-rojo">{errorPosicion}</span>}
        {dorsalRepetido && (
          <span className="-mt-2 text-[11px] text-amber-400">
            El dorsal {numero} ya lo lleva otro jugador. Puedes continuar, pero se verán repetidos en el campo.
          </span>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="primario" onClick={confirmar}>
            {editando ? 'Guardar' : 'Crear y añadir'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
