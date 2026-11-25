import { useState } from 'react';
import { useAlineacionStore } from '../../store/alineacionStore';
import { useReproduccionStore } from '../../store/reproduccionStore';
import { usePizarraCampoStore } from '../../store/pizarraCampoStore';
import { useUiStore } from '../../store/uiStore';
import { Modal } from '../ui/Modal';
import { Boton } from '../ui/Boton';
import { Toast } from '../ui/Toast';
import { AreaDiferida, CampoDiferido, soltarFoco } from './CampoDiferido';
import { MiniaturaFase } from './MiniaturaFase';
import { enKB, PESO_AVISO, PESO_TOPE, porcentajeOcupado } from '../../utils/pesoAlineacion';
import type { SecuenciaTactica } from '../../types';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
}

/** Las jugadas de la alineación en su orden, con la abierta en su sitio. */
export function jugadasEnOrden(jugadas: SecuenciaTactica[], abierta: SecuenciaTactica | null): { jugada: SecuenciaTactica; abierta: boolean }[] {
  const lista = jugadas.map((jugada) => ({ jugada, abierta: false }));
  if (abierta) {
    const sitio = Math.min(Math.max(0, abierta.posicion ?? lista.length), lista.length);
    lista.splice(sitio, 0, { jugada: abierta, abierta: true });
  }
  return lista;
}

/**
 * Ventana «Jugadas» (F5.4b): todas las jugadas de la alineación, para que no se
 * pierda ninguna («si hago otra, ¿dónde queda la anterior?»). Abrir, crear,
 * grabar, renombrar, describir, duplicar y borrar, y el espacio que queda, en
 * porcentaje: los entrenadores no saben qué es un KB.
 */
export function VentanaJugadas({ abierto, onCerrar }: Props) {
  const secuencia = useAlineacionStore((s) => s.historial.presente.secuencia);
  const jugadas = useAlineacionStore((s) => s.historial.presente.jugadas);
  const soloLectura = useAlineacionStore((s) => s.alineacionSoloLectura !== null);
  const nuevaJugada = useAlineacionStore((s) => s.nuevaJugada);
  const abrirJugada = useAlineacionStore((s) => s.abrirJugada);
  const renombrarJugada = useAlineacionStore((s) => s.renombrarJugada);
  const describirJugada = useAlineacionStore((s) => s.describirJugada);
  const duplicarJugada = useAlineacionStore((s) => s.duplicarJugada);
  const borrarJugada = useAlineacionStore((s) => s.borrarJugada);
  const cerrarJugada = useAlineacionStore((s) => s.cerrarJugada);
  const pesoAlineacion = useAlineacionStore((s) => s.pesoAlineacion);
  const detener = useReproduccionStore((s) => s.detener);
  const detenerGrabacion = useReproduccionStore((s) => s.detenerGrabacion);
  const iniciarGrabacion = useReproduccionStore((s) => s.iniciarGrabacion);
  const desactivarModoTrayectoria = usePizarraCampoStore((s) => s.desactivarModoTrayectoria);
  const paletaRival = useAlineacionStore((s) => s.historial.presente.rival?.paleta ?? 'blanco');
  const toasts = useUiStore((s) => s.toasts);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<string | null>(null);
  // Descripciones desplegadas. Se quedan abiertas hasta cerrar la ventana: si se plegaran al salir
  // del campo, la fila encogería entre el toque y el clic y el botón tocado se movería.
  const [conDescripcionAbierta, setConDescripcionAbierta] = useState<ReadonlySet<string>>(new Set());
  // Cada vez que se abre, la ventana empieza limpia: descripciones plegadas y ningún borrado a medio confirmar.
  const [abiertoAntes, setAbiertoAntes] = useState(abierto);
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto);
    setConDescripcionAbierta(new Set());
    setConfirmandoBorrar(null);
  }

  if (!abierto) return null;

  const lista = jugadasEnOrden(jugadas, secuencia);
  const peso = pesoAlineacion();
  const porcentaje = porcentajeOcupado(peso);
  const llena = peso >= PESO_TOPE;
  const casiLlena = !llena && peso >= PESO_AVISO;

  /** Al cambiar de jugada se paran la reproducción, la grabación y Movimiento, como al cerrarla. */
  const pararTodo = () => {
    soltarFoco();
    detener();
    detenerGrabacion();
    desactivarModoTrayectoria();
  };

  // Los avisos (jugada borrada con Deshacer, casi llena…) van en el pie mientras la ventana está
  // abierta: abajo de la pantalla taparían las filas. App deja de pintarlos allí.
  const pie =
    toasts.length > 0 ? (
      <div className="flex flex-col items-center gap-2" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} />
        ))}
      </div>
    ) : undefined;

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="🎬 Jugadas" ancho="lg" pie={pie}>
      <div className="flex flex-col gap-4">
        {/* Espacio de la alineación: porcentaje y barra. Los KB, solo en el texto emergente (lo ve quien usa el PC). */}
        <div title={`${enKB(peso)} KB de ${enKB(PESO_TOPE)} KB (el servidor admite 1 MB)`}>
          <div className="mb-1 flex items-baseline justify-between text-xs text-club-plata">
            <span>Espacio usado de esta alineación</span>
            <span className={llena ? 'font-semibold text-red-300' : casiLlena ? 'font-semibold text-amber-300' : ''}>
              {llena ? `Llena (${porcentaje} %)` : casiLlena ? `Casi llena (${porcentaje} %)` : `${porcentaje} %`}
            </span>
          </div>
          <div
            role="meter"
            aria-label="Espacio usado de esta alineación"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentaje}
            aria-valuetext={`${porcentaje} %`}
            className="h-2 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className={`h-full rounded-full ${llena ? 'bg-red-400' : casiLlena ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.max(2, porcentaje)}%` }}
            />
          </div>
          {llena && <p className="mt-1 text-xs text-red-300">No caben más fases ni jugadas. Borra las que no uses o sigue en una alineación nueva.</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Boton
            tamano="md"
            variante="primario"
            disabled={soloLectura || llena}
            onClick={() => {
              pararTodo();
              nuevaJugada();
              onCerrar();
            }}
          >
            ＋ Nueva jugada
          </Boton>
          <Boton
            tamano="md"
            variante="secundario"
            disabled={soloLectura || llena}
            onClick={() => {
              pararTodo();
              nuevaJugada();
              iniciarGrabacion();
              onCerrar();
            }}
            title="Jugada nueva grabando: cada movimiento en el campo crea una fase"
          >
            ⏺ Grabar jugada nueva
          </Boton>
        </div>

        {lista.length === 0 ? (
          <p className="text-sm text-club-plata">Esta alineación no tiene jugadas todavía. Las nuevas parten de lo que hay en la pizarra.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Jugadas de esta alineación">
            {lista.map(({ jugada, abierta }, indice) => {
              const id = jugada.id ?? `sin-id-${indice}`;
              const nombre = jugada.nombre ?? `Jugada ${indice + 1}`;
              const fases = jugada.frames.length;
              const primera = jugada.frames[0];
              const descripcion = jugada.descripcion ?? '';
              const conDescripcion = conDescripcionAbierta.has(id);
              return (
                <li
                  key={id}
                  aria-label={nombre}
                  aria-current={abierta || undefined}
                  className={`flex gap-3 rounded-lg border p-1.5 ${abierta ? 'border-club-rojo/60 bg-club-rojo/10' : 'border-white/10 bg-white/5'}`}
                >
                  {/* Miniatura de la fase 1, apaisada como el campo en la tablet; debajo, las fases y si está abierta. */}
                  <div className="flex w-20 shrink-0 flex-col gap-1">
                    <div className="h-[52px] overflow-hidden rounded border border-white/10">
                      {primera && <MiniaturaFase fase={primera} paletaRival={paletaRival} />}
                    </div>
                    <p className="text-center text-[11px] leading-tight text-club-plata/70">
                      {fases === 1 ? '1 fase' : `${fases} fases`}
                      {abierta && <span className="block font-semibold text-white">Abierta</span>}
                    </p>
                  </div>

                  {/* Dos líneas: nombre y Abrir (o Cerrar); descripción, Duplicar y Borrar. */}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex gap-2">
                      <CampoDiferido
                        key={`nombre-${id}`}
                        valor={nombre}
                        alConfirmar={(texto) => renombrarJugada(id, texto)}
                        disabled={soloLectura}
                        maxLength={60}
                        aria-label={`Nombre de la jugada ${indice + 1}`}
                        className="min-w-0 flex-1 font-display font-semibold"
                      />
                      {/* Gris: con muchas jugadas, en rojo solo queda «＋ Nueva jugada». */}
                      {abierta ? (
                        <Boton
                          tamano="md"
                          variante="secundario"
                          className="w-24 shrink-0"
                          onClick={() => {
                            pararTodo();
                            cerrarJugada();
                            onCerrar();
                          }}
                          aria-label={`Cerrar «${nombre}»`}
                          title="Guardar la jugada y volver a la pizarra"
                        >
                          Cerrar
                        </Boton>
                      ) : (
                        <Boton
                          tamano="md"
                          variante="secundario"
                          className="w-24 shrink-0"
                          onClick={() => {
                            pararTodo();
                            abrirJugada(id);
                            onCerrar();
                          }}
                          aria-label={`Abrir «${nombre}»`}
                        >
                          Abrir
                        </Boton>
                      )}
                    </div>

                    <div className="flex items-start gap-2">
                      {conDescripcion ? (
                        <AreaDiferida
                          key={`descripcion-${id}`}
                          valor={descripcion}
                          alConfirmar={(texto) => describirJugada(id, texto)}
                          disabled={soloLectura}
                          autoFocus
                          rows={3}
                          maxLength={500}
                          placeholder="Para qué sirve, cómo se ejecuta…"
                          aria-label={`Descripción de la jugada ${indice + 1}`}
                          className="min-w-0 flex-1 resize-none"
                        />
                      ) : (
                        // Plegada en una línea: «＋ Añadir descripción» o el principio de la que tiene. Al tocarla se abre.
                        <button
                          type="button"
                          disabled={soloLectura}
                          onClick={() => setConDescripcionAbierta((abiertas) => new Set(abiertas).add(id))}
                          aria-label={descripcion ? `Editar la descripción de «${nombre}»` : `Añadir descripción a «${nombre}»`}
                          title={descripcion || undefined}
                          className="flex h-11 min-w-0 flex-1 items-center rounded-lg px-2.5 text-left text-sm transition-colors duration-rapido hover:bg-white/5 disabled:opacity-40"
                        >
                          <span className={`truncate ${descripcion ? 'text-white/80' : 'text-club-plata/70'}`}>
                            {descripcion || '＋ Añadir descripción'}
                          </span>
                        </button>
                      )}
                      <Boton
                        tamano="md"
                        variante="secundario"
                        className="shrink-0"
                        disabled={soloLectura || llena}
                        onClick={() => {
                          soltarFoco();
                          duplicarJugada(id);
                        }}
                        aria-label={`Duplicar «${nombre}»`}
                      >
                        ⧉ Duplicar
                      </Boton>
                      {/* Borrado en dos toques; después, Deshacer en el aviso del pie. */}
                      <Boton
                        tamano="md"
                        variante="peligroSuave"
                        className="w-28 shrink-0"
                        disabled={soloLectura}
                        onClick={() => {
                          if (confirmandoBorrar !== id) {
                            setConfirmandoBorrar(id);
                            return;
                          }
                          setConfirmandoBorrar(null);
                          if (abierta) pararTodo();
                          else soltarFoco();
                          borrarJugada(id);
                        }}
                        aria-label={confirmandoBorrar === id ? `Confirmar: borrar «${nombre}»` : `Borrar «${nombre}»`}
                      >
                        {confirmandoBorrar === id ? '¿Borrar?' : '🗑 Borrar'}
                      </Boton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
