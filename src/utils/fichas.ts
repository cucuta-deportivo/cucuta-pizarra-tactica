import type { Alineacion, FichaJugador, Jugador, JugadorEnCampo, SecuenciaTactica } from '../types';

/** Lo que se guarda de un jugador de la plantilla: sin el enlace firmado de la foto. */
export function fichaDeJugador(jugador: Jugador): FichaJugador {
  return {
    id: jugador.id,
    categoriaId: jugador.categoriaId,
    nombre: jugador.nombre,
    apellido: jugador.apellido,
    dorsal: jugador.dorsal,
    posicionNatural: jugador.posicionNatural,
    posicionesSecundarias: jugador.posicionesSecundarias,
    fotoPath: jugador.fotoPath,
  };
}

/**
 * Un jugador pintable a partir de su ficha. Va como inactivo para que las listas
 * de "elegir jugador" (que solo muestran activos) no lo ofrezcan: está en esta
 * alineación, no en la plantilla cargada.
 */
export function jugadorDesdeFicha(ficha: FichaJugador): Jugador {
  return { ...ficha, fotoUrl: null, piePreferido: 'derecho', activo: false };
}

function mismaFicha(a: FichaJugador, b: FichaJugador): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface DocumentoConJugadores {
  titulares: JugadorEnCampo[];
  banquillo: string[];
  jugadoresPersonalizados: Jugador[];
  secuencia: SecuenciaTactica | null;
}

/** Todos los jugadores que aparecen en la alineación: en el campo, en el banquillo o en algún paso de la jugada. */
function idsEnAlineacion(doc: DocumentoConJugadores): Set<string> {
  const ids = new Set<string>(doc.banquillo);
  for (const titular of doc.titulares) ids.add(titular.jugadorId);
  for (const frame of doc.secuencia?.frames ?? []) {
    for (const titular of frame.titulares) ids.add(titular.jugadorId);
  }
  return ids;
}

/**
 * Las fichas al día: cada jugador de la plantilla que aparece en la alineación
 * toma sus datos vivos, y las fichas de los que no están en la plantilla cargada
 * se conservan. Ninguna se borra: si se deshace un cambio, el jugador sigue
 * teniendo con qué pintarse. Devuelve el mismo array si no cambió nada.
 */
export function fichasActualizadas(doc: DocumentoConJugadores, fichas: FichaJugador[], plantilla: Jugador[]): FichaJugador[] {
  const personalizados = new Set(doc.jugadoresPersonalizados.map((j) => j.id));
  let resultado = fichas;
  for (const id of idsEnAlineacion(doc)) {
    if (personalizados.has(id)) continue;
    const vivo = plantilla.find((j) => j.id === id);
    if (!vivo) continue;
    const ficha = fichaDeJugador(vivo);
    const indice = resultado.findIndex((f) => f.id === id);
    if (indice !== -1 && mismaFicha(resultado[indice]!, ficha)) continue;
    if (resultado === fichas) resultado = [...fichas];
    if (indice === -1) resultado.push(ficha);
    else resultado[indice] = ficha;
  }
  return resultado;
}

/** Busca un jugador en la propia alineación (personalizados y fichas), para verla sin abrirla. */
export function jugadorDeAlineacion(alineacion: Alineacion, id: string): Jugador | undefined {
  const personalizado = alineacion.jugadoresPersonalizados?.find((j) => j.id === id);
  if (personalizado) return personalizado;
  const ficha = alineacion.fichas?.find((f) => f.id === id);
  return ficha ? jugadorDesdeFicha(ficha) : undefined;
}
