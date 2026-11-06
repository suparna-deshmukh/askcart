"use client";
// Single toast stack. Replaces .obtoast/.aitoast/.carttoast/.toast.
// Desktop bottom-center (max 3); mobile top below header. role=status.
import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastCtx = createContext(null);
let seq = 0;

export function ToasterProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef({});
  const dismiss = useCallback((id) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]); delete timers.current[id];
  }, []);
  const push = useCallback(({ type = "info", text, sub, icon, action, onAction, tile, ms = 4000 }) => {
    const id = ++seq;
    setItems((xs) => [...xs.slice(-2), { id, type, text, sub, icon, action, onAction, tile }]);
    timers.current[id] = setTimeout(() => dismiss(id), ms);
    return id;
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toaster" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`t-item ${t.type}`}>
            {t.tile && <span className="t-tile">{t.tile}</span>}
            <span className="t-txt">{t.text}{t.sub && <span className="t-sub">{t.sub}</span>}</span>
            {t.action && <button className="t-act" onClick={() => { t.onAction && t.onAction(); dismiss(t.id); }}>{t.action}</button>}
            <button className="t-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() { return useContext(ToastCtx); }
