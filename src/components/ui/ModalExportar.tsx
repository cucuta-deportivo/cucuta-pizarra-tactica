import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Modal } from './Modal';
import { Boton } from './Boton';
import { alineacionDesdeDocumento, useAlineacionStore } from '../../store/alineacionStore';
import { usePlantillaStore } from '../../store/plantillaStore';
import { useUiStore } from '../../store/uiStore';
import { obtenerFormacion } from '../../data/formaciones';
import { generarId } from '../../utils/id';
import type { ElementosExportacion } from '../campo/Campo';
import {
  analizarAlineacionDesdeJson,
  capasEnCampo,
  descargarBlob,
  exportarAlineacionAJson,
  exportarCampoAPdf,
  exportarCampoAPng,
  type CapaOpcional,
} from '../../utils/exportar';

const TODAS_LAS_CAPAS: Record<CapaOpcional, boolean> = { rival: true, balon: true, objetos: true, dibujos: true };

const CASILLAS_CAPAS: { capa: CapaOpcional; etiqueta: string }[] = [
  { capa: 'rival', etiqueta: 'Incluir rival' },
  { capa: 'balon', etiqueta: 'Incluir balón' },
  { capa: 'objetos', etiqueta: 'Incluir objetos' },
  { capa: 'dibujos', etiqueta: 'Incluir dibujos (flechas, líneas, zonas)' },
];

interface ModalExportarProps {
  abierto: boolean;
  onCerrar: () => void;
  obtenerElementos: () => ElementosExportacion | null;
}

type TrabajoExportacion = 'png' | 'pdf' | null;

export function ModalExportar({ abierto, onCerrar, obtenerElementos }: ModalExportarProps) {
  const mostrarToast = useUiStore((s) => s.mostrarToast);
  const id = useAlineacionStore((s) => s.id);
  const nombre = useAlineacionStore((s) => s.nombre);
  const creadaEn = useAlineacionStore((s) => s.creadaEn);
  const modificadaEn = useAlineacionStore((s) => s.modificadaEn);
  const documento = useAlineacionStore((s) => s.historial.presente);
  const reemplazarDocumentoCompleto = useAlineacionStore((s) => s.reemplazarDocumentoCompleto);
  const obtenerJugador = usePlantillaStore((s) => s.obtenerPorId);

  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [trabajo, setTrabajo] = useState<TrabajoExportacion>(null);
  // Encendida por defecto: las fotos deben salir en la imagen exportada (regla
  // del producto). Se puede desmarcar para una exportación concreta, por ejemplo
  // si no se quiere la cara de un menor en un PDF que se va a compartir.
  const [incluirFotos, setIncluirFotos] = useState(true);

  // Solo tiene sentido ofrecerlo si alguno de los que están en el campo tiene foto.
  const hayFotos = documento.titulares.some((t) => obtenerJugador(t.jugadorId)?.fotoUrl);

  // Rival, balón, objetos y dibujos: casilla solo para lo que hay en el campo, y
  // todas marcadas cada vez que se abre, para que la imagen sea igual a la pantalla.
  const enCampo = capasEnCampo(documento);
  const [incluirCapas, setIncluirCapas] = useState(TODAS_LAS_CAPAS);
  useEffect(() => {
    if (abierto) setIncluirCapas(TODAS_LAS_CAPAS);
  }, [abierto]);

  function construirAlineacion() {
    return alineacionDesdeDocumento({ id, nombre, creadaEn }, documento, modificadaEn);
  }

  async function exportarImagen(tipo: 'png' | 'pdf'): Promise<void> {
    const elementos = obtenerElementos();
    if (!elementos) {
      mostrarToast({ tipo: 'error', mensaje: 'El campo aún no está listo para exportar. Inténtalo de nuevo.' });
      return;
    }
    setTrabajo(tipo);
    try {
      const alineacion = construirAlineacion();
      const datos = {
        alineacion,
        formacion: obtenerFormacion(alineacion.formacionId),
        obtenerJugador,
        svgCampo: elementos.svg,
        canvasDibujo: elementos.canvas,
        anchoContenedor: elementos.ancho,
        altoContenedor: elementos.alto,
        orientacion: elementos.orientacion,
        incluirFotos: incluirFotos && hayFotos,
        incluir: incluirCapas,
      };
      if (tipo === 'png') {
        const blob = await exportarCampoAPng(datos);
        descargarBlob(blob, `${alineacion.nombre || 'alineacion'}.png`);
      } else {
        await exportarCampoAPdf(datos);
      }
      mostrarToast({ tipo: 'exito', mensaje: `Exportado a ${tipo.toUpperCase()} correctamente.` });
    } catch {
      mostrarToast({
        tipo: 'error',
        mensaje: `No se pudo exportar a ${tipo.toUpperCase()}.`,
        accion: { etiqueta: 'Reintentar', ejecutar: () => void exportarImagen(tipo) },
      });
    } finally {
      setTrabajo(null);
    }
  }

  function exportarJson(): void {
    exportarAlineacionAJson(construirAlineacion());
    mostrarToast({ tipo: 'exito', mensaje: 'Respaldo JSON descargado.' });
  }

  function manejarArchivoSeleccionado(evento: ChangeEvent<HTMLInputElement>): void {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const importada = analizarAlineacionDesdeJson(String(lector.result));
        const ahora = new Date().toISOString();
        reemplazarDocumentoCompleto({ ...importada, id: generarId(), creadaEn: ahora, modificadaEn: ahora });
        mostrarToast({ tipo: 'exito', mensaje: 'Alineación importada como copia nueva.' });
        onCerrar();
      } catch (error) {
        mostrarToast({ tipo: 'error', mensaje: error instanceof Error ? error.message : 'No se pudo importar el archivo.' });
      }
    };
    lector.onerror = () => mostrarToast({ tipo: 'error', mensaje: 'No se pudo leer el archivo seleccionado.' });
    lector.readAsText(archivo);
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Exportar y compartir" ancho="sm">
      <div className="flex flex-col gap-2">
        <label
          className={`flex min-h-[44px] items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 ${
            hayFotos ? 'cursor-pointer' : 'opacity-50'
          }`}
          title={hayFotos ? 'Dibuja la foto de cada jugador dentro de su ficha' : 'Ningún jugador del campo tiene foto'}
        >
          <input
            type="checkbox"
            checked={incluirFotos && hayFotos}
            disabled={!hayFotos}
            onChange={(e) => setIncluirFotos(e.target.checked)}
            className="h-4 w-4 accent-club-naranja"
          />
          <span className="text-xs text-white">
            Incluir fotos de los jugadores
            {!hayFotos && <span className="text-club-plata"> · ninguno tiene foto</span>}
          </span>
        </label>

        {CASILLAS_CAPAS.filter(({ capa }) => enCampo[capa]).map(({ capa, etiqueta }) => (
          <label key={capa} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3">
            <input
              type="checkbox"
              checked={incluirCapas[capa]}
              onChange={(e) => setIncluirCapas((previas) => ({ ...previas, [capa]: e.target.checked }))}
              className="h-4 w-4 accent-club-naranja"
            />
            <span className="text-xs text-white">{etiqueta}</span>
          </label>
        ))}

        <Boton variante="primario" onClick={() => void exportarImagen('png')} disabled={trabajo !== null}>
          {trabajo === 'png' ? 'Generando PNG…' : '⬇ Exportar a PNG (2×)'}
        </Boton>
        <Boton variante="secundario" onClick={() => void exportarImagen('pdf')} disabled={trabajo !== null}>
          {trabajo === 'pdf' ? 'Generando PDF…' : '⬇ Exportar a PDF'}
        </Boton>
        <span className="my-1 h-px bg-white/10" />
        <Boton variante="secundario" onClick={exportarJson}>
          ⤓ Exportar alineación (JSON)
        </Boton>
        <Boton variante="secundario" onClick={() => inputArchivoRef.current?.click()}>
          ⤒ Importar alineación (JSON)
        </Boton>
        <input
          ref={inputArchivoRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={manejarArchivoSeleccionado}
        />
      </div>
    </Modal>
  );
}
