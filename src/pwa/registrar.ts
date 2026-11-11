import { registerSW } from 'virtual:pwa-register';
import { avisarVersionNueva } from './avisoVersion';

/** Registra el service worker (S1.11). Se carga aparte, después del primer pintado. */
export function registrarServiceWorker(): void {
  const actualizar = registerSW({
    // `true`: activa la versión que espera y recarga, solo cuando se toca "Actualizar".
    onNeedRefresh: () => avisarVersionNueva(() => void actualizar(true)),
  });
}
