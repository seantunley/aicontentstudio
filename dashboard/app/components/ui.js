'use client';
import { createContext, useContext, useState, useCallback, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const Ctx = createContext(null);
export function useUI() { return useContext(Ctx); }

let _tid = 0;

// ── Tooltip ────────────────────────────────────────────────────────────────
// One accessible hint mechanism for the whole desk. Appears on hover AND keyboard
// focus, dismissable with Escape, exposed to screen readers via aria-describedby +
// role="tooltip". The bubble is portalled to <body> and positioned with fixed
// coordinates so it never gets clipped by an overflow:hidden / transformed ancestor
// (cards, the calendar grid, modals) — and it flips above/below + clamps to the
// viewport so it never runs off-screen.
//
//   <Tooltip text="what this does">{children}</Tooltip>   wrap any focusable control
//   <InfoDot tip="what this means" />                      a small ⓘ hint beside a label
export function Tooltip({ text, children, placement = 'top', as: As = 'span', className, focusable = true, tabIndex, ...rest }) {
  const id = `tt-${useId()}`;
  const ref = useRef(null);
  const [pos, setPos] = useState(null); // { x, y, place } or null when hidden

  const show = useCallback(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    let place = placement;
    // flip to bottom if there isn't room above
    if (place === 'top' && r.top < 56) place = 'bottom';
    if (place === 'bottom' && window.innerHeight - r.bottom < 56) place = 'top';
    const cx = Math.min(Math.max(r.left + r.width / 2, margin + 8), window.innerWidth - margin - 8);
    const y = place === 'top' ? r.top - 6 : r.bottom + 6;
    setPos({ x: cx, y, place });
  }, [placement]);
  const hide = useCallback(() => setPos(null), []);
  const onKey = useCallback((e) => { if (e.key === 'Escape') hide(); }, [hide]);

  if (!text) return <As ref={ref} className={className} {...rest}>{children}</As>;

  return (
    <As
      ref={ref}
      {...rest}
      className={className}
      tabIndex={tabIndex != null ? tabIndex : (focusable ? 0 : undefined)}
      aria-describedby={pos ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={onKey}
    >
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <span
          id={id}
          role="tooltip"
          className={`tip tip--${pos.place}`}
          style={{ left: pos.x, top: pos.y, transform: `translateX(-50%) ${pos.place === 'top' ? 'translateY(-100%)' : ''}` }}
        >
          {text}
        </span>,
        document.body,
      )}
    </As>
  );
}

// A small "ⓘ" affordance for inline label hints — focusable, keyboard-friendly.
export function InfoDot({ tip, placement }) {
  if (!tip) return null;
  return (
    <Tooltip text={tip} placement={placement} as="span" className="infodot" role="button" aria-label={tip}>
      i
    </Tooltip>
  );
}

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
