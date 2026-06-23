import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';

/* ───────────────────────── Toasts ───────────────────────── */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/* ─────────────────────── Confirm dialog ─────────────────── */

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface UiCtx {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<UiCtx>(null!);
export const useUi = () => useContext(Ctx);

let nextId = 1;

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const toast = {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  };

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmState(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function closeConfirm(result: boolean) {
    resolver.current?.(result);
    resolver.current = null;
    setConfirmState(null);
  }

  // Close the confirm dialog on Escape (cancel).
  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeConfirm(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState]);

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast stack */}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-icon" aria-hidden="true">
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'i'}
            </span>
            <span>{t.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => setToasts((arr) => arr.filter((x) => x.id !== t.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div
          className="preview-overlay"
          onClick={() => closeConfirm(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') closeConfirm(false); }}
        >
          <div
            className="preview-modal"
            style={{ maxWidth: 420 }}
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmState.title ?? 'Confirm'}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 20 }}>
              {confirmState.title && (
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{confirmState.title}</div>
              )}
              <div style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{confirmState.message}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => closeConfirm(false)} autoFocus>
                  {confirmState.cancelLabel ?? 'Cancel'}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => closeConfirm(true)}
                >
                  {confirmState.confirmLabel ?? 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
