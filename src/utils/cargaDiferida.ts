import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { useUiStore } from '../store/uiStore';

const AVISO_SIN_CARGAR = 'No se pudieron cargar algunas ventanas. Revisa la conexión y recarga la página.';

function SinCargar(): null {
  return null;
}

/**
 * Componente que se descarga aparte, fuera de la carga inicial. Si su trozo no
 * llega (sin señal en el banquillo, o un despliegue nuevo con la pestaña abierta)
 * no pinta nada y avisa una sola vez, en lugar de tumbar la pizarra entera.
 */
export function diferido<P extends object>(cargar: () => Promise<ComponentType<P>>): LazyExoticComponent<ComponentType<P>> {
  return lazy<ComponentType<P>>(() =>
    cargar().then(
      (componente) => ({ default: componente }),
      () => {
        const { toasts, mostrarToast } = useUiStore.getState();
        if (!toasts.some((t) => t.mensaje === AVISO_SIN_CARGAR)) {
          mostrarToast({ tipo: 'error', mensaje: AVISO_SIN_CARGAR });
        }
        return { default: SinCargar };
      },
    ),
  );
}
