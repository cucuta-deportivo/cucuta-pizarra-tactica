export type Posicion =
  | 'POR'
  | 'LD'
  | 'DFC'
  | 'LI'
  | 'MCD'
  | 'MC'
  | 'MCO'
  | 'MD'
  | 'MI'
  | 'ED'
  | 'EI'
  | 'SD'
  | 'DC';

export type PiePreferido = 'izquierdo' | 'derecho' | 'ambos';

/** Categoría del club (Sub-13 … Sub-20). Se leen de la tabla `categorias`. */
export interface Categoria {
  id: string;
  nombre: string;
  orden: number;
}

export interface Jugador {
  /** UUID generado por Supabase. */
  id: string;
  categoriaId: string;
  nombre: string;
  apellido: string;
  /** Opcional en la base de datos: un jugador puede no tener dorsal asignado. */
  dorsal: number | null;
  posicionNatural: Posicion;
  posicionesSecundarias: Posicion[];
  /**
   * Enlace firmado para mostrar la foto. Es efímero (caduca) y NO se guarda:
   * se pide al cargar la categoría y se renueva. La ruta persistente es `fotoPath`.
   */
  fotoUrl: string | null;
  /** Ruta dentro del bucket privado: `{categoria_id}/{jugador_id}.webp`. */
  fotoPath: string | null;
  piePreferido: PiePreferido;
  activo: boolean;
}

/** Catálogo cerrado de posiciones que admite el formulario de plantilla. */
export const POSICIONES_PLANTILLA: Posicion[] = [
  'POR', 'LI', 'DFC', 'LD', 'MCD', 'MC', 'MCO', 'EI', 'ED', 'SD', 'DC',
];

export interface ZonaFormacion {
  id: string;
  posicion: Posicion;
  x: number;
  y: number;
}

export interface Formacion {
  id: string;
  nombre: string;
  variante?: string;
  zonas: ZonaFormacion[];
}

export interface JugadorEnCampo {
  jugadorId: string;
  x: number;
  y: number;
  zonaOrigenId?: string;
  esCapitan: boolean;
  nota?: string;
  /** Hacia dónde mira, en grados. Opcional: sin ella no se dibuja indicador. */
  rotacion?: number;
}

export type TipoTrazo = 'libre' | 'flecha' | 'discontinua' | 'zona' | 'texto';

export interface PuntoNormalizado {
  x: number;
  y: number;
}

export interface Trazo {
  id: string;
  tipo: TipoTrazo;
  puntos: PuntoNormalizado[];
  color: string;
  grosor: 1 | 2 | 3;
  texto?: string;
}

// --- Anexo A: objetos de entrenamiento (FA1) ---

export type TipoObjeto = 'cono' | 'cono_plano' | 'pica' | 'escalera' | 'mini_porteria' | 'aro' | 'maniqui';
export type ColorObjeto = 'naranja' | 'amarillo' | 'blanco' | 'rojo' | 'negro';

export interface ObjetoCampo {
  id: string;
  tipo: TipoObjeto;
  x: number;
  y: number;
  color: ColorObjeto;
  rotacion: number;
}

// --- Anexo A: balón (FA2) ---

export interface Balon {
  id: string;
  x: number;
  y: number;
  jugadorPoseedorId: string | null;
}

// --- Anexo A: cuadrícula y zonas (FA3) ---

export type PresetCuadricula =
  | 'off'
  | 'tercios'
  | 'carriles-5'
  | 'juego-posicion'
  | 'zonas-12'
  | 'zonas-18'
  | 'mitades'
  | 'personalizada';

export type ColorCelda = 'rojo' | 'ambar' | 'azul';
export type EstiloLineaCuadricula = 'solida' | 'discontinua' | 'puntos';

export interface CuadriculaCampo {
  preset: PresetCuadricula;
  columnas: number;
  filas: number;
  opacidad: number;
  estiloLinea: EstiloLineaCuadricula;
  mostrarEtiquetas: boolean;
  imantar: boolean;
  celdasPintadas: Record<string, ColorCelda>;
}

// --- Anexo A: equipo rival (FA4) ---

export interface JugadorRival {
  id: string;
  dorsal: number;
  apellido?: string;
  posicion: Posicion;
  x: number;
  y: number;
  zonaOrigenId?: string;
}

export type PaletaRival = 'blanco' | 'gris' | 'azul';
export type ModoVistaEquipos = 'solo_nosotros' | 'ambos' | 'solo_rival';

export interface EquipoRival {
  nombre: string;
  formacionId: string;
  paleta: PaletaRival;
  jugadores: JugadorRival[];
  visible: boolean;
  modoVista: ModoVistaEquipos;
}

export interface Marcaje {
  id: string;
  jugadorPropioId: string;
  jugadorRivalId: string;
}

// --- Anexo A: identidad de cancha (FA5) ---

export type TemaCancha = 'estadio' | 'neutro' | 'entrenamiento' | 'tactico';
export type VistaCampo = 'completo' | 'medio' | 'tercio';

export interface IdentidadCancha {
  tema: TemaCancha;
  vista: VistaCampo;
  mostrarEscudo: boolean;
  mostrarValla: boolean;
  rotado180: boolean;
}

// --- Jugadas animadas: secuencia de frames tácticos ---

/**
 * Instantánea de lo que se mueve durante una jugada. Guarda solo eso, no el
 * tablero entero: la formación, el tema de cancha, la configuración de la
 * cuadrícula o los datos del rival no cambian entre frames y siguen viviendo
 * una sola vez en el documento.
 */
export interface FrameTactico {
  id: string;
  nombre?: string;
  titulares: JugadorEnCampo[];
  jugadoresRival: JugadorRival[];
  balones: Balon[];
  objetos: ObjetoCampo[];
  trazos: Trazo[];
  celdasPintadas: Record<string, ColorCelda>;
  /**
   * Milisegundos que tarda la transición DESDE este frame HASTA el siguiente.
   * La duración pertenece al tramo, no al frame, así que en el último frame no
   * se usa. Opcional: las jugadas guardadas antes de existir esto caen en
   * `DURACION_TRANSICION_MS`.
   */
  duracionMs?: number;
  /**
   * Recorridos por nodos que arrancan en este frame. Opcional: sin ellos, cada
   * ficha va en línea recta hasta su posición del frame siguiente, que es como
   * se comportaban las jugadas antes de existir esto.
   */
  trayectorias?: TrayectoriaMovimiento[];
}

/** Curva de movimiento de las transiciones. Ver `CURVAS_EASING` en utils/interpolacion. */
export type TipoEasing = 'lineal' | 'entrada' | 'salida' | 'entrada-salida';

export type TipoInterpolacionRuta = 'lineal' | 'catmull-rom';

/** De dónde sale hacia dónde mira un actor mientras recorre su trayectoria. */
export type ModoOrientacion = 'manual' | 'seguir-ruta';

export interface NodoRuta {
  id: string;
  x: number;
  y: number;
}

/**
 * Recorrido que sigue un jugador, un rival o un balón durante UNA transición
 * entre fases; por eso vive dentro del frame en el que arranca.
 *
 * `nodos` guarda solo los puntos INTERMEDIOS. Los extremos no se almacenan: el
 * inicial es la posición del elemento en este frame y el final la del frame
 * siguiente. Así, mover una ficha reacomoda su ruta sola y es imposible que la
 * ruta y las fases se desincronicen.
 */
export interface TrayectoriaMovimiento {
  id: string;
  jugadorId?: string;
  jugadorRivalId?: string;
  balonId?: string;
  objetoId?: string;
  nodos: NodoRuta[];
  interpolacion: TipoInterpolacionRuta;
  mostrarRuta: boolean;
  /**
   * Lo que tarda ESTE actor en recorrer su trayectoria. Opcional: si falta,
   * tarda lo que dure el tramo entre fases, que es como se comportaban las
   * jugadas antes. Nunca puede pasar de la duración del tramo — si acaba antes,
   * el actor llega a su destino y espera ahí a que termine la fase.
   */
  duracionMs?: number;
  /**
   * 'seguir-ruta' orienta al actor según la tangente de la curva; 'manual' deja
   * la rotación que tenga guardada. Opcional: si falta, 'manual'.
   */
  orientacion?: ModoOrientacion;
  /** Dibujar los nodos al seleccionar la ruta. Opcional: si falta, sí. */
  mostrarNodos?: boolean;
  /** Dejar una huella de lo ya recorrido mientras se reproduce. Opcional: si falta, no. */
  mostrarEstela?: boolean;
}

/** Quién recorre una trayectoria. */
export type TipoDestinoRuta = 'titular' | 'rival' | 'balon' | 'objeto';

export interface SecuenciaTactica {
  /** Nombre de la jugada: "Salida ante presión", "ABP - Córner"… */
  nombre?: string;
  frames: FrameTactico[];
  /** Frame que se está editando; es el que el campo muestra en modo edición. */
  indiceActivo: number;
  /** Curva de toda la jugada. Opcional: si falta, 'entrada-salida'. */
  easing?: TipoEasing;
}

export interface Alineacion {
  id: string;
  nombre: string;
  formacionId: string;
  titulares: JugadorEnCampo[];
  banquillo: string[];
  trazos: Trazo[];
  notas: string;
  creadaEn: string;
  modificadaEn: string;
  objetos: ObjetoCampo[];
  balones: Balon[];
  cuadricula: CuadriculaCampo;
  rival: EquipoRival | null;
  marcajes: Marcaje[];
  cancha: IdentidadCancha;
  /** Jugadores creados a mano que no están en la plantilla; viajan con la alineación. */
  jugadoresPersonalizados?: Jugador[];
  /** `null` mientras el tablero sea una pizarra fija: solo existe al crear una jugada. */
  secuencia?: SecuenciaTactica | null;
}

export type Orientacion = 'vertical' | 'horizontal';

export type EstadoGuardado = 'guardado' | 'guardando' | 'pendiente' | 'error';

export type Herramienta = 'seleccion' | 'libre' | 'flecha' | 'discontinua' | 'zona' | 'texto' | 'borrador';

export type EstrategiaCambioFormacion = 'reubicar' | 'vaciar' | 'cancelar';
