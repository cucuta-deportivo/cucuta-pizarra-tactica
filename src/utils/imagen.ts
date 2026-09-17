const CALIDAD_WEBP = 0.82;
const LADO_FOTO_PX = 256;

/** Tipos de imagen que acepta la subida de fotos. */
export const TIPOS_IMAGEN_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp'];

export interface FotoProcesada {
  /** Lo que se sube al bucket. */
  blob: Blob;
  /** Data URL del mismo recorte, para la vista previa antes de confirmar. */
  vistaPrevia: string;
}

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    lector.onload = () => {
      const imagen = new Image();
      imagen.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      imagen.onload = () => resolve(imagen);
      imagen.src = String(lector.result);
    };
    lector.readAsDataURL(archivo);
  });
}

/**
 * Recorta al cuadrado central (sin deformar), reduce a 256 px y convierte a
 * WebP con calidad 0.82.
 *
 * Todo ocurre en el navegador a propósito: las fotos que hace un entrenador con
 * el móvil pesan varios megas, y subirlas tal cual llenaría el bucket y haría
 * lentísima la pantalla de plantilla. Lo que viaja a Supabase son unos 15 KB.
 */
export async function procesarFotoJugador(archivo: File, lado = LADO_FOTO_PX): Promise<FotoProcesada> {
  if (!TIPOS_IMAGEN_ACEPTADOS.includes(archivo.type)) {
    throw new Error('Formato no admitido. Usa una imagen JPG, PNG o WebP.');
  }

  const imagen = await cargarImagen(archivo);
  const ladoOrigen = Math.min(imagen.naturalWidth, imagen.naturalHeight);
  const origenX = (imagen.naturalWidth - ladoOrigen) / 2;
  const origenY = (imagen.naturalHeight - ladoOrigen) / 2;

  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(imagen, origenX, origenY, ladoOrigen, ladoOrigen, 0, 0, lado, lado);

  const blob = await new Promise<Blob | null>((resolve) => lienzo.toBlob(resolve, 'image/webp', CALIDAD_WEBP));
  if (!blob) throw new Error('No se pudo convertir la imagen a WebP.');

  return { blob, vistaPrevia: lienzo.toDataURL('image/webp', CALIDAD_WEBP) };
}
