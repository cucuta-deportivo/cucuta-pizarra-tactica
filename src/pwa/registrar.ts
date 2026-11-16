import { registerSW } from 'virtual:pwa-register';
import { guardarFuentesParaSinRed } from '../utils/fuentes';
import { avisarVersionNueva } from './avisoVersion';

/** Registra el service worker (S1.11). Se carga aparte, después del primer pintado. */
export function registrarServiceWorker(): void {
  const actualizar = registerSW({
    // `true`: activa la versión que espera y recarga, solo cuando se toca "Actualizar".
    onNeedRefresh: () => avisarVersionNueva(() => void actualizar(true)),
  });
  // IV10: los pesos de Barlow de la exportación, para que queden guardados por si luego no hay señal.
  guardarFuentesParaSinRed();
}
