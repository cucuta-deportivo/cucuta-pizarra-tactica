import type { Alineacion } from '../../types';
import {
  marcarPorSubir,
  type AlineacionRepository,
  type CopiaLocal,
  type Escritura,
  type RegistroSincronizacion,
} from '../repositorio/AlineacionRepository';
import type { AlineacionRemota, EstadoRemoto } from '../supabase/alineacionesApi';

/**
 * Baja lo que cambió en otros dispositivos (S1.7). Regla aprobada: nada se pisa.
 * El primero que sube se queda con la alineación; si aquí había cambios sin
 * subir, pasan a una copia que se sube como alineación nueva. Borrar contra
 * editar: gana la edición. Solo se borra aquí lo que el servidor marca como
 * borrado: lo que no aparece (borrado por SQL, o una cuenta que dejó de verlo)
 * no se toca.
 */

/** Lo que necesita del servidor (en la app, `alineacionesApi`). */
export interface RemotoBajada {
  listarEstados(): Promise<EstadoRemoto[]>;
  descargar(ids: string[]): Promise<AlineacionRemota[]>;
}

/** Lo que necesita de este dispositivo (en la app, el repositorio de IndexedDB). */
export type LocalBajada = Pick<AlineacionRepository, 'listar' | 'todasLasMarcas' | 'reescribir'>;

/** Lo que cambió aquí al bajar. La pizarra lo usa para avisar y para recargar la que está abierta. */
export type CambioBajado =
  | { tipo: 'nueva' | 'actualizada' | 'borrada'; id: string; nombre: string }
  | {
      tipo: 'copia';
      id: string;
      /** Nombre de lo de aquí, antes de pasar a la copia. */
      nombre: string;
      borradaEnServidor: boolean;
      copia: { id: string; nombre: string; creadaEn: string; revision: number };
    };

/** Lo que el servidor tiene de una alineación; sin documento si está borrada. */
export interface Remota {
  id: string;
  version: number;
  ultimoCambio: string;
  eliminada: boolean;
  alineacion?: Alineacion;
}

/** Es la subida de este dispositivo cuya respuesta se perdió: la confirma la próxima subida, no es de otro. */
function esSubidaPropia(marca: RegistroSincronizacion | undefined, ultimoCambio: string): boolean {
  return Boolean(marca?.cambioEnCurso) && marca?.cambioEnCurso === ultimoCambio;
}

/**
 * Al día con el servidor y sin nada por subir. La revisión cuenta un cambio más:
 * si la pizarra la tenía abierta desde la revisión anterior, al guardar no la pisa.
 */
function marcaAlDia(id: string, version: number, previo: RegistroSincronizacion | undefined): RegistroSincronizacion {
  return {
    id,
    versionServidor: version,
    pendiente: false,
    eliminada: false,
    revision: (previo?.revision ?? 0) + 1,
    cambioEnCurso: null,
    revisionEnCurso: null,
    conflicto: false,
  };
}

/** ¿Hay que mirar esta alineación? Se decide con el estado, sin descargar el documento. */
export function hayQueMirar(estado: EstadoRemoto, marca: RegistroSincronizacion | undefined, estaAqui: boolean): boolean {
  if (esSubidaPropia(marca, estado.ultimoCambio)) return false;
  // Sin marca: nueva de otro dispositivo. Las de antes de la sincronización están aquí sin marca y las sube S1.8.
  if (!marca) return !estaAqui && !estado.eliminada;
  return marca.versionServidor !== estado.version;
}

/**
 * Qué escribir aquí para una alineación que cambió en el servidor. Se decide
 * dentro de la misma transacción que escribe, con lo leído en ese momento:
 * pudo guardarse algo aquí desde que se listó.
 */
export function decidirBajada(
  actual: CopiaLocal,
  remota: Remota,
  copiar: (local: Alineacion) => Alineacion,
): { escrituras: Escritura[]; resultado: CambioBajado | null } {
  const { alineacion: local, marca } = actual;
  const nada = { escrituras: [], resultado: null };
  if (esSubidaPropia(marca, remota.ultimoCambio)) return nada;
  if (marca && marca.versionServidor === remota.version) return nada;
  if (!marca && local) return nada;

  const escrituras: Escritura[] = [];
  let copia: Extract<CambioBajado, { tipo: 'copia' }>['copia'] | null = null;
  // Cambios de aquí sin subir que parten de otra versión: el primero se queda, lo de aquí pasa a copia.
  if (local && marca?.pendiente && !marca.eliminada) {
    const nueva = copiar(local);
    const marcaCopia = marcarPorSubir(undefined, nueva.id);
    escrituras.push({ id: nueva.id, alineacion: nueva, marca: marcaCopia });
    copia = { id: nueva.id, nombre: nueva.nombre, creadaEn: nueva.creadaEn, revision: marcaCopia.revision };
  }

  if (remota.eliminada || !remota.alineacion) {
    escrituras.push({ id: remota.id, alineacion: null, marca: null });
    const nombre = local?.nombre ?? '';
    if (copia) return { escrituras, resultado: { tipo: 'copia', id: remota.id, nombre, borradaEnServidor: true, copia } };
    return { escrituras, resultado: local ? { tipo: 'borrada', id: remota.id, nombre } : null };
  }

  // Si aquí estaba borrada sin subir, también: gana la edición del otro dispositivo.
  escrituras.push({ id: remota.id, alineacion: remota.alineacion, marca: marcaAlDia(remota.id, remota.version, marca) });
  if (copia) return { escrituras, resultado: { tipo: 'copia', id: remota.id, nombre: local?.nombre ?? '', borradaEnServidor: false, copia } };
  return { escrituras, resultado: { tipo: local ? 'actualizada' : 'nueva', id: remota.id, nombre: remota.alineacion.nombre } };
}

export function crearBajador({ local, remoto, copiar }: { local: LocalBajada; remoto: RemotoBajada; copiar: (local: Alineacion) => Alineacion }) {
  return {
    /** Lanza `ErrorSinConexion` sin red; lo que ya se aplicó queda aplicado. */
    async bajar(): Promise<CambioBajado[]> {
      const [estados, marcas, aqui] = await Promise.all([remoto.listarEstados(), local.todasLasMarcas(), local.listar()]);
      const marcaDe = new Map(marcas.map((m) => [m.id, m]));
      const estanAqui = new Set(aqui.map((a) => a.id));
      const mirar = estados.filter((e) => hayQueMirar(e, marcaDe.get(e.id), estanAqui.has(e.id)));
      if (mirar.length === 0) return [];

      const conDocumento = mirar.filter((e) => !e.eliminada).map((e) => e.id);
      const descargadas = new Map(
        (conDocumento.length > 0 ? await remoto.descargar(conDocumento) : []).map((r) => [r.alineacion.id, r]),
      );
      const cambios: CambioBajado[] = [];
      for (const estado of mirar) {
        // Entre listar y descargar pudo cambiar otra vez: manda lo descargado.
        const descargada = descargadas.get(estado.id);
        const remota: Remota = descargada
          ? { id: estado.id, version: descargada.version, ultimoCambio: descargada.ultimoCambio, eliminada: descargada.eliminada, alineacion: descargada.alineacion }
          : { id: estado.id, version: estado.version, ultimoCambio: estado.ultimoCambio, eliminada: estado.eliminada };
        // Desapareció entre listar y descargar: lo que no está en el servidor no se toca.
        if (!remota.eliminada && !remota.alineacion) continue;
        const cambio = await local.reescribir(estado.id, (actual) => decidirBajada(actual, remota, copiar));
        if (cambio) cambios.push(cambio);
      }
      return cambios;
    },
  };
}
