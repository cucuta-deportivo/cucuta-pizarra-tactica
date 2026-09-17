import { forwardRef, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useEscalaCampo } from '../../hooks/useCampoEscala';
import { usePizarraStore } from '../../store/pizarraStore';
import { useAlineacionStore } from '../../store/alineacionStore';
import type { PuntoNormalizado, Trazo } from '../../types';
import { generarId } from '../../utils/id';
import { simplificarRDP } from '../../utils/suavizado';
import { dibujarTrazo, type PuntoPx } from '../../utils/renderTrazos';

const TOLERANCIA_SIMPLIFICACION_PX = 2;
const TOLERANCIA_BORRADOR_PX = 10;
const UMBRAL_CURVA_PORCENTAJE = 3;

function calcularPuntoControl(
  puntos: PuntoNormalizado[],
  inicio: PuntoNormalizado,
  fin: PuntoNormalizado,
): PuntoNormalizado | null {
  const dx = fin.x - inicio.x;
  const dy = fin.y - inicio.y;
  const longitud = Math.hypot(dx, dy) || 1;
  let maxDistancia = 0;
  let mejor: PuntoNormalizado | null = null;
  for (const p of puntos) {
    const distancia = Math.abs((p.x - inicio.x) * dy - (p.y - inicio.y) * dx) / longitud;
    if (distancia > maxDistancia) {
      maxDistancia = distancia;
      mejor = p;
    }
  }
  return maxDistancia > UMBRAL_CURVA_PORCENTAJE ? mejor : null;
}

function distanciaPuntoSegmentoPx(p: PuntoPx, a: PuntoPx, b: PuntoPx): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const longitudCuadrada = dx * dx + dy * dy;
  if (longitudCuadrada === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / longitudCuadrada));
  const proyeccion = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proyeccion.x, p.y - proyeccion.y);
}

function encontrarTrazoCercano(
  trazos: Trazo[],
  puntoNormalizado: PuntoNormalizado,
  aPixeles: (p: PuntoNormalizado) => PuntoPx,
  tolerancia: number,
): Trazo | undefined {
  const objetivo = aPixeles(puntoNormalizado);
  let mejor: Trazo | undefined;
  let mejorDistancia = tolerancia;
  for (const trazo of trazos) {
    const puntosPx = trazo.puntos.map(aPixeles);
    let distancia = Infinity;
    if (trazo.tipo === 'zona' && puntosPx.length === 2) {
      const [a, b] = puntosPx as [PuntoPx, PuntoPx];
      const dentro =
        objetivo.x >= Math.min(a.x, b.x) &&
        objetivo.x <= Math.max(a.x, b.x) &&
        objetivo.y >= Math.min(a.y, b.y) &&
        objetivo.y <= Math.max(a.y, b.y);
      distancia = dentro ? 0 : Infinity;
    } else if (puntosPx.length === 1) {
      distancia = Math.hypot(objetivo.x - puntosPx[0]!.x, objetivo.y - puntosPx[0]!.y);
    } else {
      for (let i = 0; i < puntosPx.length - 1; i++) {
        distancia = Math.min(distancia, distanciaPuntoSegmentoPx(objetivo, puntosPx[i]!, puntosPx[i + 1]!));
      }
    }
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejor = trazo;
    }
  }
  return mejor;
}

interface EntradaTextoProps {
  punto: PuntoPx;
  onConfirmar: (valor: string) => void;
  onCancelar: () => void;
}

function EntradaTextoPizarra({ punto, onConfirmar, onCancelar }: EntradaTextoProps) {
  const [valor, setValor] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onConfirmar(valor);
        if (e.key === 'Escape') onCancelar();
      }}
      onBlur={() => onConfirmar(valor)}
      placeholder="Etiqueta…"
      maxLength={40}
      className="absolute z-30 h-7 -translate-x-1 -translate-y-1/2 rounded border border-club-rojo bg-club-negro px-2 text-xs text-white outline-none"
      style={{ left: punto.x, top: punto.y }}
    />
  );
}

interface CapaDibujoProps {
  /**
   * Trazos a pintar en lugar de los del documento. Lo usa la reproducción para
   * mostrar los dibujos de la fase que se está viendo, que no son los de la
   * fase que se está editando. Si no se pasa, manda el documento y todo se
   * comporta como siempre.
   */
  trazosMostrados?: Trazo[];
}

export const CapaDibujo = forwardRef<HTMLCanvasElement, CapaDibujoProps>(function CapaDibujo(
  { trazosMostrados },
  refEstatico,
) {
  const { aPixeles, aPorcentaje, ancho, alto } = useEscalaCampo();
  const modoDibujoActivo = usePizarraStore((s) => s.modoDibujoActivo);
  const herramienta = usePizarraStore((s) => s.herramienta);
  const color = usePizarraStore((s) => s.color);
  const grosor = usePizarraStore((s) => s.grosor);
  const trazosDelDocumento = useAlineacionStore((s) => s.historial.presente.trazos);
  const trazos = trazosMostrados ?? trazosDelDocumento;
  // Con trazos impuestos desde fuera la capa es un espejo de la reproducción: no
  // se puede dibujar ni borrar sobre ella, porque lo que muestra no es el frame
  // que se edita y cualquier cambio se escribiría en el sitio equivocado.
  const soloLectura = trazosMostrados !== undefined;
  const dibujoHabilitado = modoDibujoActivo && !soloLectura;
  const agregarTrazo = useAlineacionStore((s) => s.agregarTrazo);
  const eliminarTrazo = useAlineacionStore((s) => s.eliminarTrazo);

  const canvasEstaticoRef = useRef<HTMLCanvasElement | null>(null);
  const canvasTempRef = useRef<HTMLCanvasElement | null>(null);
  const dibujandoRef = useRef(false);
  const puntosActualesRef = useRef<PuntoNormalizado[]>([]);
  const rafRef = useRef<number | null>(null);
  const [entradaTexto, setEntradaTexto] = useState<PuntoNormalizado | null>(null);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [canvasEstaticoRef.current, canvasTempRef.current]) {
      if (!canvas) continue;
      canvas.width = Math.max(1, Math.round(ancho * dpr));
      canvas.height = Math.max(1, Math.round(alto * dpr));
      canvas.style.width = `${ancho}px`;
      canvas.style.height = `${alto}px`;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, [ancho, alto]);

  useEffect(() => {
    const canvas = canvasEstaticoRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const trazo of trazos) dibujarTrazo(ctx, trazo, aPixeles);
  }, [trazos, ancho, alto, aPixeles]);

  function limpiarTemp(): void {
    const canvas = canvasTempRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function dibujarPreview(): void {
    const canvas = canvasTempRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || puntosActualesRef.current.length === 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tipoPreview = herramienta === 'discontinua' || herramienta === 'flecha' || herramienta === 'zona' ? herramienta : 'libre';
    ctx.globalAlpha = 0.85;
    dibujarTrazo(ctx, { id: 'preview', tipo: tipoPreview, puntos: puntosActualesRef.current, color, grosor }, aPixeles);
    ctx.globalAlpha = 1;
  }

  function manejarPointerDown(evento: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!dibujoHabilitado) return;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    const punto = aPorcentaje(evento.clientX, evento.clientY);

    if (herramienta === 'texto') {
      setEntradaTexto(punto);
      return;
    }
    if (herramienta === 'borrador') {
      const trazoCercano = encontrarTrazoCercano(trazos, punto, aPixeles, TOLERANCIA_BORRADOR_PX);
      if (trazoCercano) eliminarTrazo(trazoCercano.id);
      return;
    }
    dibujandoRef.current = true;
    puntosActualesRef.current = [punto];
  }

  function manejarPointerMove(evento: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!dibujandoRef.current) return;
    puntosActualesRef.current.push(aPorcentaje(evento.clientX, evento.clientY));
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      dibujarPreview();
      rafRef.current = null;
    });
  }

  function manejarPointerUp(): void {
    if (!dibujandoRef.current) return;
    dibujandoRef.current = false;
    limpiarTemp();
    const puntosCrudos = puntosActualesRef.current;
    puntosActualesRef.current = [];
    if (puntosCrudos.length === 0) return;

    if (herramienta === 'zona') {
      const inicio = puntosCrudos[0]!;
      const fin = puntosCrudos[puntosCrudos.length - 1]!;
      agregarTrazo({ id: generarId(), tipo: 'zona', puntos: [inicio, fin], color, grosor });
      return;
    }

    if (herramienta === 'flecha') {
      const inicio = puntosCrudos[0]!;
      const fin = puntosCrudos[puntosCrudos.length - 1]!;
      if (Math.hypot(fin.x - inicio.x, fin.y - inicio.y) < 1) return;
      const control = calcularPuntoControl(puntosCrudos, inicio, fin);
      agregarTrazo({ id: generarId(), tipo: 'flecha', puntos: control ? [inicio, control, fin] : [inicio, fin], color, grosor });
      return;
    }

    if (puntosCrudos.length < 2) return;
    const tolerancia = ancho > 0 ? (TOLERANCIA_SIMPLIFICACION_PX / ancho) * 100 : 0.3;
    const simplificados = simplificarRDP(puntosCrudos, tolerancia);
    agregarTrazo({
      id: generarId(),
      tipo: herramienta === 'discontinua' ? 'discontinua' : 'libre',
      puntos: simplificados,
      color,
      grosor,
    });
  }

  function confirmarTexto(valor: string): void {
    if (entradaTexto && valor.trim()) {
      agregarTrazo({ id: generarId(), tipo: 'texto', puntos: [entradaTexto], color, grosor, texto: valor.trim().slice(0, 40) });
    }
    setEntradaTexto(null);
  }

  return (
    <>
      <canvas
        ref={(nodo) => {
          canvasEstaticoRef.current = nodo;
          if (typeof refEstatico === 'function') refEstatico(nodo);
          else if (refEstatico) refEstatico.current = nodo;
        }}
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      <canvas
        ref={(nodo) => {
          canvasTempRef.current = nodo;
        }}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ pointerEvents: dibujoHabilitado ? 'auto' : 'none', cursor: dibujoHabilitado ? 'crosshair' : 'default' }}
        onPointerDown={manejarPointerDown}
        onPointerMove={manejarPointerMove}
        onPointerUp={manejarPointerUp}
        onPointerCancel={manejarPointerUp}
      />
      {entradaTexto && (
        <EntradaTextoPizarra punto={aPixeles(entradaTexto)} onConfirmar={confirmarTexto} onCancelar={() => setEntradaTexto(null)} />
      )}
    </>
  );
});
