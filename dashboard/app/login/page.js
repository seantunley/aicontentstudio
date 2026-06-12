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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (r.ok) { window.location.href = '/'; return; }
      setErr('Invalid credentials');
    } catch {
      setErr('Network error');
    }
    setBusy(false);
  }

  return (
    <main className="wrap">
      <div className="panel auth">
        <h1 style={{ fontSize: 18, marginTop: 0 }}>Studio Cockpit</h1>
        <p className="empty" style={{ marginTop: 0 }}>Sign in to continue.</p>
        <form onSubmit={submit}>
          <input className="inp" placeholder="username" autoComplete="username"
                 value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="inp" type="password" placeholder="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn primary" type="submit" disabled={busy}>{busy ? '…' : 'Sign in'}</button>
        </form>
        {err && <div className="err">{err}</div>}
      </div>
    </main>
  );
}
