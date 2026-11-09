import { useState } from 'react';
import { Boton } from './Boton';
import { Modal } from './Modal';

/**
 * S1.8: la primera vez que se abre la app sincronizada en un navegador con
 * alineaciones de antes, ofrece un respaldo y las sube con su mismo id. Nada se
 * borra del navegador; si alguna no sube, se reintenta sola.
 */
interface ModalMigracionProps {
  abierto: boolean;
  porMigrar: { ids: string[]; vacias: number };
  migrar: (ids: string[], alAvanzar: (subidas: number) => void) => Promise<{ subidas: number; total: number }>;
  descargarRespaldo: () => Promise<void>;
  onCerrar: () => void;
}

type Fase = { tipo: 'inicio' } | { tipo: 'subiendo'; subidas: number } | { tipo: 'terminado'; subidas: number; total: number };

export function ModalMigracion({ abierto, porMigrar, migrar, descargarRespaldo, onCerrar }: ModalMigracionProps) {
  const [fase, setFase] = useState<Fase>({ tipo: 'inicio' });
  const [descargando, setDescargando] = useState(false);
  const total = porMigrar.ids.length;
  const una = total === 1;

  async function subir(): Promise<void> {
    setFase({ tipo: 'subiendo', subidas: 0 });
    const resultado = await migrar(porMigrar.ids, (subidas) =>
      setFase((actual) => (actual.tipo === 'subiendo' ? { tipo: 'subiendo', subidas } : actual)),
    );
    setFase({ tipo: 'terminado', ...resultado });
  }

  async function respaldo(): Promise<void> {
    setDescargando(true);
    try {
      await descargarRespaldo();
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Subir las alineaciones de este navegador" ancho="md">
      <div className="flex flex-col gap-4 text-sm text-club-plata">
        {fase.tipo === 'inicio' && (
          <>
            <p>
              Hay {total} {una ? 'alineación guardada' : 'alineaciones guardadas'} solo en este navegador. Al{' '}
              {una ? 'subirla, la verán' : 'subirlas, las verán'} los demás entrenadores y {una ? 'podrás abrirla' : 'podrás abrirlas'} en la
              tablet.
            </p>
            <p>Antes, descarga un respaldo por si acaso.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Boton onClick={() => void respaldo()} disabled={descargando}>
                ⬇️ Descargar respaldo
              </Boton>
              <span className="text-xs text-club-plata/70">El archivo tiene datos de jugadores: guárdalo en un lugar privado.</span>
            </div>
            {porMigrar.vacias > 0 && (
              <p className="text-xs text-club-plata/60">
                {porMigrar.vacias === 1
                  ? '1 vacía sin tocar se queda solo en este navegador.'
                  : `${porMigrar.vacias} vacías sin tocar se quedan solo en este navegador.`}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Boton variante="fantasma" onClick={onCerrar}>
                Más tarde
              </Boton>
              <Boton variante="primario" onClick={() => void subir()}>
                Subir ahora
              </Boton>
            </div>
          </>
        )}

        {fase.tipo === 'subiendo' && (
          <div className="flex flex-col gap-2">
            <p role="status">
              Subiendo {Math.min(fase.subidas + 1, total)} de {total}…
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-club-rojo transition-all" style={{ width: `${(fase.subidas / Math.max(total, 1)) * 100}%` }} />
            </div>
          </div>
        )}

        {fase.tipo === 'terminado' && (
          <>
            <p role="status" className="font-semibold text-white">
              Subidas {fase.subidas} de {fase.total}.
            </p>
            {fase.subidas < fase.total && (
              <p>
                {fase.total - fase.subidas === 1
                  ? 'La restante sigue pendiente y se reintenta sola.'
                  : `Las ${fase.total - fase.subidas} restantes siguen pendientes y se reintentan solas.`}
              </p>
            )}
            <div className="flex justify-end">
              <Boton variante="primario" onClick={onCerrar}>
                Cerrar
              </Boton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
