import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { searchNotes, readNote } from '@/lib/knowledge';

export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const rel = searchParams.get('open');
  if (rel) {
    try { return NextResponse.json(readNote(rel)); }
    catch (e) { return NextResponse.json({ error: String(e?.message || e) }, { status: 404 }); }
  }
  return NextResponse.json({ hits: searchNotes(searchParams.get('q') || '') });
}
