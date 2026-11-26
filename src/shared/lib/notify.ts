import { toast, type ToastKind } from '@/shared/ui/Toast';

export interface NotifyOptions {
  persist?: boolean;
  detail?: string;
  link?: string;
  dedup_key?: string;
  destino?: string;
  push?: boolean;
  modulo?: string;
}

/** Suscriptores que se refrescan cuando se notifica. */
const refreshListeners = new Set<() => void>();

export function onNotifRefresh(cb: () => void): () => void {
  refreshListeners.add(cb);
  return () => refreshListeners.delete(cb);
}

export function emitNotifRefresh(): void {
  refreshListeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}

/**
 * Notificación unificada en pantalla para La Cantera.
 */
export function notify(
  message: string,
  kind: ToastKind = 'info',
  _options: NotifyOptions = {},
): void {
  toast(message, kind);
  emitNotifRefresh();
}
