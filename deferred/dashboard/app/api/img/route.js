import { getSession } from '@/lib/session';

// Same-origin image proxy. The editor's canvas would be CORS-tainted by cross-origin Postiz images
// (breaking export), so the editor loads images through here. Restricted to the Postiz media host.
const ALLOWED = new Set(['172.18.18.101', 'host.docker.internal', 'localhost', '127.0.0.1']);

export async function GET(req) {
  const session = await getSession();
  if (!session.user) return new Response('unauthorized', { status: 401 });
  const u = new URL(req.url).searchParams.get('u');
  if (!u) return new Response('missing u', { status: 400 });
  let target;
  try { target = new URL(u); } catch { return new Response('bad url', { status: 400 }); }
  if (!ALLOWED.has(target.hostname)) return new Response('forbidden host', { status: 403 });
  // the dashboard container reaches the host via host.docker.internal
  if (target.hostname !== 'host.docker.internal') target.hostname = 'host.docker.internal';
  try {
    const r = await fetch(target.toString());
    if (!r.ok) return new Response('fetch failed', { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=300' },
    });
  } catch (e) {
    return new Response(String(e?.message || e), { status: 502 });
  }
}
