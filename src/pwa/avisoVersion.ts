import { useUiStore } from '../store/uiStore';

/**
 * Hay una versión nueva de la pizarra (S1.11). Se avisa y se espera a que el
 * entrenador toque "Actualizar": nunca se recarga sola, porque puede haber un
 * partido en curso. Si no lo toca, sigue con la versión que tiene y se le vuelve
 * a avisar la próxima vez que abra la app.
 */
export function avisarVersionNueva(actualizar: () => void): void {
  useUiStore.getState().mostrarToast({
    tipo: 'info',
    fijo: true,
    mensaje: 'Hay una versión nueva.',
    accion: { etiqueta: 'Actualizar', ejecutar: actualizar },
  });
}
