'use client';
import { createContext, useContext, useState, useCallback } from 'react';

const Ctx = createContext(null);
export function useUI() { return useContext(Ctx); }

let _tid = 0;

export function UIProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null); // { opts, resolve }
  const [toasts, setToasts] = useState([]);

  const confirm = useCallback(
    (opts) => new Promise((resolve) => setConfirmState({ opts: opts || {}, resolve })),
    [],
  );

  const toast = useCallback((message, type = 'ok') => {
    const id = ++_tid;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  function close(val) {
    if (confirmState) confirmState.resolve(val);
    setConfirmState(null);
  }

  const o = confirmState?.opts || {};

  return (
    <Ctx.Provider value={{ confirm, toast }}>
      {children}

      {confirmState && (
        <div className="modal-back" onClick={() => close(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className={`modal-bar ${o.danger ? 'danger' : ''}`}>
              <span className="led" /> {o.tag || 'confirm'}
            </div>
            <div className="modal-body">
              <h3>{o.title || 'Are you sure?'}</h3>
              {o.message && <p>{o.message}</p>}
              <div className="modal-acts">
                <button className="btn btn--ghost" onClick={() => close(false)}>{o.cancelLabel || 'Cancel'}</button>
                <button className={`btn ${o.danger ? 'btn--reject' : 'btn--primary'}`} onClick={() => close(true)}>
                  {o.confirmLabel || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="ti">{t.type === 'err' ? 'error' : 'ok'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
