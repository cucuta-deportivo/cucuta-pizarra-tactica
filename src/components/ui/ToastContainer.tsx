import { useUiStore } from '../../store/uiStore';
import { Toast } from './Toast';

/** `abajo`: px desde el borde inferior, para quedar por encima de la barra inferior y de la jugada abierta. */
export function ToastContainer({ abajo = 16 }: { abajo?: number }) {
  const toasts = useUiStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[200] flex flex-col items-center gap-2 px-4"
      style={{ bottom: abajo }}
      aria-live="polite"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} />
      ))}
    </div>
  );
}
