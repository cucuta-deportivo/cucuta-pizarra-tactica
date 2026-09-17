import { useRef, useState, type DragEvent } from 'react';
import { procesarFotoJugador, TIPOS_IMAGEN_ACEPTADOS, type FotoProcesada } from '../../utils/imagen';
import { driveConfigurado, elegirFotoDeDrive } from '../../data/drive/selectorDrive';
import { COLOR } from '../../tokens';

interface SelectorFotoProps {
  /** Enlace firmado de la foto que ya tiene el jugador, si la tiene. */
  fotoActual: string | null;
  /** Se llama al confirmar el recorte; `null` significa quitar la foto. */
  onElegir: (foto: FotoProcesada | null) => void;
  dorsal: number | null;
}

/**
 * Elegir la foto de un jugador: arrastrando el archivo encima o desde el botón.
 * La imagen se procesa aquí mismo (recorte cuadrado, 256 px, WebP 0.82) y se
 * muestra la vista previa ANTES de confirmar, para que nadie suba un recorte
 * que no ha visto.
 */
export function SelectorFoto({ fotoActual, onElegir, dorsal }: SelectorFotoProps) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<FotoProcesada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [abriendoDrive, setAbriendoDrive] = useState(false);

  async function tomar(archivo: File | undefined): Promise<void> {
    if (!archivo) return;
    setError(null);
    setProcesando(true);
    try {
      const foto = await procesarFotoJugador(archivo);
      setPrevia(foto);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo procesar la imagen.');
    } finally {
      setProcesando(false);
    }
  }

  /**
   * Misma foto, otro origen: lo que devuelve Drive entra por `tomar`, así que
   * pasa por el mismo recorte, la misma vista previa y la misma confirmación.
   */
  async function tomarDeDrive(): Promise<void> {
    setError(null);
    setAbriendoDrive(true);
    try {
      const archivo = await elegirFotoDeDrive();
      if (archivo) await tomar(archivo);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir Google Drive.');
    } finally {
      setAbriendoDrive(false);
    }
  }

  function soltar(evento: DragEvent<HTMLDivElement>): void {
    evento.preventDefault();
    setEncima(false);
    void tomar(evento.dataTransfer.files[0]);
  }

  const mostrada = previa?.vistaPrevia ?? fotoActual;

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
        className={`flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors duration-base ${
          encima ? 'border-club-naranja bg-club-naranja/10' : 'border-white/15 bg-white/5'
        }`}
      >
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full"
          style={{ backgroundColor: COLOR.superficie.panelSecundario }}
        >
          {mostrada ? (
            <img src={mostrada} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span className="font-display text-2xl font-black" style={{ color: COLOR.texto.secundario }}>
              {dorsal ?? '—'}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11px] leading-tight" style={{ color: COLOR.texto.secundario }}>
            {previa
              ? 'Así se va a guardar. Puedes confirmar o elegir otra.'
              : driveConfigurado
                ? 'Arrástrala aquí, elige un archivo o tráela de Google Drive. JPG, PNG o WebP.'
                : 'Arrastra una imagen aquí o elige un archivo. JPG, PNG o WebP.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => entradaRef.current?.click()}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white transition-colors duration-base hover:bg-white/10"
            >
              {procesando ? 'Procesando…' : previa ? 'Elegir otra' : 'Elegir archivo'}
            </button>

            {driveConfigurado && (
              <button
                type="button"
                onClick={() => void tomarDeDrive()}
                disabled={procesando || abriendoDrive}
                title="Elige la foto de tu Google Drive. Solo se descarga la que selecciones."
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white transition-colors duration-base hover:bg-white/10 disabled:opacity-50"
              >
                <svg viewBox="0 0 87.3 78" className="h-3.5 w-3.5" aria-hidden="true">
                  <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" />
                  <path fill="#00ac47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" />
                  <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.1c.8-1.4 1.2-2.95 1.2-4.5H59.79l5.85 11.5z" />
                  <path fill="#00832d" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
                  <path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
                  <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" />
                </svg>
                {abriendoDrive ? 'Abriendo Drive…' : 'Desde Drive'}
              </button>
            )}

            {previa && (
              <button
                type="button"
                onClick={() => {
                  onElegir(previa);
                  setPrevia(null);
                }}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-club-naranja bg-club-naranja/20 px-3 text-xs font-semibold text-white transition-colors duration-base"
              >
                Confirmar foto
              </button>
            )}

            {!previa && fotoActual && (
              <button
                type="button"
                onClick={() => onElegir(null)}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-3 text-xs text-club-plata transition-colors duration-base hover:text-white"
              >
                Quitar foto
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[11px]" style={{ color: COLOR.marca.rojo }}>
          {error}
        </p>
      )}

      <input
        ref={entradaRef}
        type="file"
        accept={TIPOS_IMAGEN_ACEPTADOS.join(',')}
        className="hidden"
        onChange={(e) => {
          void tomar(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
