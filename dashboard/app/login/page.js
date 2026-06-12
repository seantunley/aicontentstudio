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
      <div className="auth reveal">
        <div className="wordmark">The Studio<em>.</em></div>
        <div className="rulebox" />
        <div className="strap">operator&rsquo;s desk — sign in</div>
        <form onSubmit={submit}>
          <input className="input" placeholder="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="input" type="password" placeholder="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn--primary btn--block" type="submit" disabled={busy} style={{ marginTop: 6 }}>{busy ? '…' : 'Take the desk'}</button>
        </form>
        {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
