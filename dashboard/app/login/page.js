'use client';
import { useState } from 'react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (r.ok) { window.location.href = '/'; return; }
      setErr('Invalid credentials');
    } catch { setErr('Network error'); }
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth">
        <div className="brand"><span className="dot" /><span className="nm">STUDIO<span>·</span>CK</span></div>
        <div className="empty" style={{ margin: '0 0 14px' }}>Operator console — sign in.</div>
        <form onSubmit={submit}>
          <input className="input" placeholder="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" type="password" placeholder="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn--primary btn--block" type="submit" disabled={busy} style={{ marginTop: 4 }}>{busy ? '…' : 'Sign in'}</button>
        </form>
        {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
