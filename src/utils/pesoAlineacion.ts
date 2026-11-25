/**
 * Cuánto ocupa una alineación en el servidor (F5.4b). El tope de 1 MB es una
 * regla nuestra: la restricción `alineaciones_documento_valido` de schema.sql,
 * `octet_length(documento::text) <= 1048576`. Un documento más grande no se
 * puede subir.
 *
 * `documento` es jsonb y su texto no es el de JSON.stringify: Postgres pone un
 * espacio detrás de cada «:» y de cada «,» que separan miembros y elementos. Por
 * eso el peso es el de JSON.stringify en bytes UTF-8 más uno por cada separador
 * fuera de los textos. El orden de las claves que reescribe jsonb no cambia el
 * total.
 */

/** Lo que acepta el servidor. */
export const TOPE_SERVIDOR = 1024 * 1024;
/** Desde aquí se avisa de que la alineación pesa mucho. */
export const PESO_AVISO = 700 * 1024;
/** Desde aquí no se añaden fases ni jugadas; editar, mover y borrar sí. Deja margen hasta el tope del servidor. */
export const PESO_TOPE = 900 * 1024;

export function pesoEnServidor(documento: unknown): number {
  const texto = JSON.stringify(documento);
  if (texto === undefined) return 0;
  return bytesUtf8(texto) + separadoresFueraDeTexto(texto);
}

/**
 * Cuánto espacio de la alineación está usado, en porcentaje: el 100 % es el tope
 * de 900 KB, donde ya no se añaden fases ni jugadas. Es lo que ven los
 * entrenadores: no saben qué es un KB. No pasa de 100.
 */
export function porcentajeOcupado(bytes: number): number {
  return Math.min(100, Math.round((bytes / PESO_TOPE) * 100));
}

/** En KB redondeados: solo para el detalle que ve el administrador (texto emergente en el PC). */
export function enKB(bytes: number): number {
  return Math.round(bytes / 1024);
}

function bytesUtf8(texto: string): number {
  let bytes = 0;
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    if (codigo < 0x80) bytes += 1;
    else if (codigo < 0x800) bytes += 2;
    else if (codigo >= 0xd800 && codigo <= 0xdbff) {
      bytes += 4; // par sustituto: un carácter fuera del plano básico (un emoji)
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function separadoresFueraDeTexto(json: string): number {
  let separadores = 0;
  let enTexto = false;
  let escapado = false;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (enTexto) {
      if (escapado) escapado = false;
      else if (c === 0x5c) escapado = true; // \
      else if (c === 0x22) enTexto = false; // "
      continue;
    }
    if (c === 0x22) enTexto = true;
    else if (c === 0x3a || c === 0x2c) separadores += 1; // : ,
  }
  return separadores;
}
