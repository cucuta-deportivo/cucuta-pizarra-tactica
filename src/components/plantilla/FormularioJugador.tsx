import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Boton } from '../ui/Boton';
import { SelectorFoto } from './SelectorFoto';
import { usePlantillaStore } from '../../store/plantillaStore';
import { POSICIONES_PLANTILLA, type Jugador, type Posicion } from '../../types';
import type { DatosJugador } from '../../data/supabase/plantillaApi';
import type { FotoProcesada } from '../../utils/imagen';
import { COLOR } from '../../tokens';

interface FormularioJugadorProps {
  abierto: boolean;
  /** `null` para crear uno nuevo. */
  jugador: Jugador | null;
  onCerrar: () => void;
}

const SIN_SECUNDARIA = '';

/** Un error bajo su campo, nunca un `alert()`. */
function Campo({ etiqueta, error, children }: { etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-display text-[11px] font-semibold uppercase tracking-wide" style={{ color: COLOR.texto.secundario }}>
        {etiqueta}
      </span>
      {children}
      {error && (
        <span role="alert" className="text-[11px]" style={{ color: COLOR.marca.rojo }}>
          {error}
        </span>
      )}
    </label>
  );
}

const CLASE_CONTROL =
  'h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none transition-colors duration-base focus:border-club-naranja';

export function FormularioJugador({ abierto, jugador, onCerrar }: FormularioJugadorProps) {
  const jugadores = usePlantillaStore((s) => s.jugadores);
  const crearJugador = usePlantillaStore((s) => s.crearJugador);
  const actualizarJugador = usePlantillaStore((s) => s.actualizarJugador);
  const traspasarJugador = usePlantillaStore((s) => s.traspasarJugador);
  const categorias = usePlantillaStore((s) => s.categorias);
  const establecerFoto = usePlantillaStore((s) => s.establecerFoto);
  const quitarFoto = usePlantillaStore((s) => s.quitarFoto);
  const errorStore = usePlantillaStore((s) => s.error);
  const limpiarError = usePlantillaStore((s) => s.limpiarError);

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [dorsal, setDorsal] = useState('');
  const [principal, setPrincipal] = useState<Posicion>('MC');
  const [secundaria, setSecundaria] = useState<string>(SIN_SECUNDARIA);
  const [fotoPendiente, setFotoPendiente] = useState<FotoProcesada | null>(null);
  const [quitarLaFoto, setQuitarLaFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // F5.1: la categoría del jugador; elegir otra es un traspaso definitivo.
  const [categoria, setCategoria] = useState('');

  useEffect(() => {
    if (!abierto) return;
    limpiarError();
    setNombre(jugador?.nombre ?? '');
    setApellido(jugador?.apellido ?? '');
    setDorsal(jugador?.dorsal != null ? String(jugador.dorsal) : '');
    setPrincipal(jugador?.posicionNatural ?? 'MC');
    setSecundaria(jugador?.posicionesSecundarias[0] ?? SIN_SECUNDARIA);
    setFotoPendiente(null);
    setQuitarLaFoto(false);
    setCategoria(jugador?.categoriaId ?? '');
  }, [abierto, jugador, limpiarError]);

  const categoriaActual = jugador ? categorias.find((c) => c.id === jugador.categoriaId) : undefined;
  const categoriaDestino = categorias.find((c) => c.id === categoria);
  const traspasando = Boolean(categoriaActual && categoriaDestino && categoriaDestino.id !== categoriaActual.id);

  const apellidoLimpio = apellido.trim();
  const dorsalLimpio = dorsal.trim();
  const numero = dorsalLimpio === '' ? null : Number(dorsalLimpio);

  const errorApellido = !apellidoLimpio ? 'El apellido es obligatorio.' : undefined;

  const errorDorsal =
    numero !== null && (!Number.isInteger(numero) || numero < 1 || numero > 99)
      ? 'El dorsal debe ser un número entre 1 y 99.'
      : // El índice único de la base de datos es la última palabra, pero avisar
        // aquí evita un viaje al servidor para algo que ya se sabe. En un traspaso
        // no: la lista cargada es la de esta categoría y el dorsal cuenta en la otra.
        !traspasando && numero !== null && jugadores.some((j) => j.id !== jugador?.id && j.dorsal === numero)
        ? 'Ese dorsal ya lo lleva otro jugador activo de la categoría.'
        : undefined;

  const errorSecundaria =
    secundaria !== SIN_SECUNDARIA && secundaria === principal
      ? 'La secundaria no puede ser igual a la principal.'
      : undefined;

  const hayErrores = Boolean(errorApellido || errorDorsal || errorSecundaria);

  async function guardar(): Promise<void> {
    if (hayErrores || guardando) return;
    setGuardando(true);
    // Un error de un intento anterior (un dorsal ocupado) no debe frenar este.
    limpiarError();
    const datos: DatosJugador = {
      nombre: nombre.trim(),
      apellido: apellidoLimpio,
      dorsal: numero,
      posicionPrincipal: principal,
      posicionSecundaria: secundaria === SIN_SECUNDARIA ? null : (secundaria as Posicion),
    };

    async function aplicarFoto(jugadorId: string): Promise<void> {
      if (fotoPendiente) await establecerFoto(jugadorId, fotoPendiente.blob);
      else if (quitarLaFoto) await quitarFoto(jugadorId);
    }

    let destino: Jugador | null;
    if (jugador && traspasando) {
      // La foto antes del traspaso: después el jugador ya no está en la plantilla cargada.
      await aplicarFoto(jugador.id);
      destino = !usePlantillaStore.getState().error && (await traspasarJugador(jugador.id, categoria, datos)) ? jugador : null;
    } else {
      destino = jugador ? ((await actualizarJugador(jugador.id, datos)) ? jugador : null) : await crearJugador(datos);
      // La foto va después de tener el id: la ruta del bucket se nombra con él.
      if (destino) await aplicarFoto(destino.id);
    }
    setGuardando(false);
    if (destino && !usePlantillaStore.getState().error) onCerrar();
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={jugador ? 'Editar jugador' : 'Agregar jugador'} ancho="md">
      <div className="flex flex-col gap-3 p-4">
        <SelectorFoto
          dorsal={numero}
          fotoActual={quitarLaFoto ? null : (jugador?.fotoUrl ?? null)}
          onElegir={(foto) => {
            setFotoPendiente(foto);
            setQuitarLaFoto(foto === null);
          }}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <input className={CLASE_CONTROL} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} />
          </Campo>

          <Campo etiqueta="Apellido" error={errorApellido}>
            <input
              className={CLASE_CONTROL}
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              maxLength={40}
              aria-invalid={Boolean(errorApellido)}
            />
          </Campo>

          <Campo etiqueta="Dorsal" error={errorDorsal}>
            <input
              className={CLASE_CONTROL}
              value={dorsal}
              onChange={(e) => setDorsal(e.target.value)}
              inputMode="numeric"
              placeholder="Sin dorsal"
              aria-invalid={Boolean(errorDorsal)}
            />
          </Campo>

          <Campo etiqueta="Posición principal">
            <select className={CLASE_CONTROL} value={principal} onChange={(e) => setPrincipal(e.target.value as Posicion)}>
              {POSICIONES_PLANTILLA.map((p) => (
                <option key={p} value={p} className="bg-club-carbon">
                  {p}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Posición secundaria" error={errorSecundaria}>
            <select
              className={CLASE_CONTROL}
              value={secundaria}
              onChange={(e) => setSecundaria(e.target.value)}
              aria-invalid={Boolean(errorSecundaria)}
            >
              <option value={SIN_SECUNDARIA} className="bg-club-carbon">
                Ninguna
              </option>
              {POSICIONES_PLANTILLA.map((p) => (
                <option key={p} value={p} className="bg-club-carbon">
                  {p}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        {/* F5.1: traspaso definitivo. Solo al editar a uno de la plantilla, y solo si hay otra categoría. */}
        {categoriaActual && categorias.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <Campo etiqueta="Categoría">
              <select className={CLASE_CONTROL} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id} className="bg-club-carbon">
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            {traspasando && (
              <p role="status" className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs" style={{ color: COLOR.texto.principal }}>
                Traspaso definitivo: al guardar, {apellidoLimpio || 'el jugador'} pasa a {categoriaDestino!.nombre} y deja de estar en{' '}
                {categoriaActual.nombre}. Las alineaciones guardadas lo siguen mostrando y su foto no cambia. Si su dorsal ya lo lleva
                alguien en {categoriaDestino!.nombre}, cámbialo o déjalo vacío.
              </p>
            )}
          </div>
        )}

        {errorStore && (
          <p role="alert" className="text-xs" style={{ color: COLOR.marca.rojo }}>
            {errorStore}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="fantasma" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton variante="primario" disabled={hayErrores || guardando} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : traspasando ? 'Traspasar y guardar' : jugador ? 'Guardar cambios' : 'Agregar jugador'}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
