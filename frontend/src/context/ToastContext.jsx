import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { makeId } from "../utils.js";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (text, { type = "info", ms = 6000, action = null } = {}) => {
      const id = makeId();
      setToasts((prev) => [...prev.slice(-3), { id, text, type, action }]);
      if (ms > 0) {
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
          timers.current.delete(id);
        }, ms);
        timers.current.set(id, timer);
      }
      return id;
    },
    []
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss, toasts }}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`} role="status">
            <div className="toast-main">
              <i
                className={`bi ${
                  toast.type === "ok"
                    ? "bi-check2"
                    : toast.type === "error"
                      ? "bi-exclamation-triangle"
                      : "bi-info-circle"
                }`}
                aria-hidden="true"
              />
              <span>{toast.text}</span>
            </div>
            <div className="toast-actions">
              {toast.action ? (
                <button
                  type="button"
                  className="toast-act"
                  onClick={() => {
                    toast.action.onClick?.();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className="toast-close"
                aria-label="Cerrar aviso"
                onClick={() => dismiss(toast.id)}
              >
                <i className="bi bi-x" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
