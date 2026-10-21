import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn';
}

/**
 * Minimal transient notices: pushed messages auto-dismiss after `timeoutMs`
 * (click dismisses early) and stack bottom-right. Used for tool-import
 * results and per-skipped-tool warnings.
 */
export function useToasts(timeoutMs = 6000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback(
    (text: string, kind: Toast['kind'] = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, text, kind }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, timeoutMs);
    },
    [timeoutMs],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button key={t.id} type="button" className={`toast ${t.kind}`} onClick={() => onDismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}