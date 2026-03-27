"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" d="M15 9l-6 6M9 9l6 6" />
    </svg>
  ),
  warning: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.7 15.08A1 1 0 002.46 21h17.08a1 1 0 00.87-1.5l-8.7-15.08a1 1 0 00-1.74 0z" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
    </svg>
  ),
};

const TYPE_STYLES: Record<ToastType, { color: string; bg: string; border: string }> = {
  success: { color: "var(--success)", bg: "var(--success-dim)", border: "var(--border-emerald)" },
  error: { color: "var(--danger)", bg: "var(--danger-dim)", border: "var(--border-danger)" },
  warning: { color: "var(--warning)", bg: "var(--warning-dim)", border: "var(--border-gold)" },
  info: { color: "var(--sapphire)", bg: "var(--sapphire-dim)", border: "var(--border)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast, idx) => {
          const s = TYPE_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              className="fade-up"
              style={{
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderRadius: 8,
                background: "var(--bg-surface)",
                border: `1px solid ${s.border}`,
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                color: "var(--text-primary)",
                maxWidth: 360,
                animationDelay: `${idx * 0.05}s`,
              }}
            >
              <span style={{ color: s.color, flexShrink: 0, display: "flex" }}>
                {ICONS[toast.type]}
              </span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 2,
                  display: "flex",
                  flexShrink: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
