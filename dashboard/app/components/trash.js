'use client';
import { useState, useEffect } from 'react';
import { RestoreButton, MediaRestoreButton } from './actions';
import { za } from '@/lib/time';

// Trash as a top-right modal: rejected posts + deleted media, each restorable. Data via /api/trash.
export function TrashModal({ open, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) { setData(null); setErr(null); return; }
    let live = true;
    fetch('/api/trash').then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d.error) setErr(d.error); else setData(d);
    }).catch(() => { if (live) setErr('Failed to load trash'); });
    return () => { live = false; };
  }, [open]);

  if (!open) return null;
  const ttl = data?.ttlDays || 14;
  const jobs = data?.jobs || [];
  const media = data?.media || [];
  const daysLeft = (iso) => {
    if (!iso) return ttl;
    const gone = (Date.now() - new Date(iso).getTime()) / 86400000;
    return Math.max(0, Math.ceil(ttl - gone));
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-bar"><span className="led" /> trash
          <button className="modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body modal-body--scroll">
          {err ? <div className="empty" style={{ padding: 24 }}>{err}</div>
            : !data ? <div className="empty" style={{ padding: 48 }}>Loading trash…</div>
            : (jobs.length === 0 && media.length === 0)
              ? <div className="empty" style={{ padding: 32 }}>Trash is empty. Rejected posts and deleted media land here for {ttl} days, then purge automatically.</div>
              : (
                <>
                  <div className="set-grouphead">Rejected posts ({jobs.length})</div>
                  {jobs.length === 0 ? <div className="empty" style={{ marginBottom: 16 }}>None.</div> : (
                    <div className="qlist" style={{ marginBottom: 18 }}>
                      {jobs.map((j) => (
                        <div className="qcard" key={j.id}>
                          <div className="qcard-head" style={{ cursor: 'default' }}>
                            <div className="qcard-main">
                              <div className="qcard-topic">{j.topic}</div>
                              <div className="qcard-title">trashed {za(j.updated_at)} · {daysLeft(j.updated_at)} days left</div>
                            </div>
                            <div className="qcard-meta"><RestoreButton jobId={j.id} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="set-grouphead">Deleted media ({media.length})</div>
                  {media.length === 0 ? <div className="empty">None.</div> : (
                    <div className="vault-grid">
                      {media.map((a) => (
                        <div className="vault-tile" key={a.id}>
                          <div className="vault-media">
                            {a.kind === 'video'
                              ? <video src={a.url} muted playsInline preload="metadata" />
                              : <img src={a.url} alt="" loading="lazy" />}
                            <span className="vault-kind">{daysLeft(a.deleted_at)}d left</span>
                          </div>
                          <div className="vault-meta">
                            <div className="vault-topic" title={a.topic || ''}>{a.topic || '—'}</div>
                            <div className="actions" style={{ marginTop: 8 }}><MediaRestoreButton id={a.id} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
        </div>
      </div>
    </div>
  );
}
