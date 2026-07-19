import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { promoteSuggestion, dismissSuggestion } from '@/lib/db';

// Promote a scout suggestion to a real (research+draft) job, or dismiss it.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const id = (body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  try {
    if (body.action === 'promote') {
      return NextResponse.json(promoteSuggestion(id, session.user.name, {
        platforms: body.platforms, withImage: body.withImage, withVideo: body.withVideo,
      }));
    }
    if (body.action === 'dismiss') return NextResponse.json(dismissSuggestion(id));
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
