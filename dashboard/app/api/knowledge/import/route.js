import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { importChatGPT } from '@/lib/knowledge';

export const maxDuration = 300;

// Upload a ChatGPT export's conversations.json -> enriched markdown notes in the knowledge base.
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let file;
  try { file = (await req.formData()).get('file'); } catch { return NextResponse.json({ error: 'bad upload' }, { status: 400 }); }
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'no file' }, { status: 400 });
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: 'not valid JSON — upload conversations.json from your ChatGPT export (unzip it first)' }, { status: 400 });
  }
  // ChatGPT export is an array of conversations; some exports wrap it.
  const conversations = Array.isArray(json) ? json : json.conversations || null;
  if (!conversations) return NextResponse.json({ error: 'this does not look like a ChatGPT conversations.json' }, { status: 400 });
  try {
    const r = importChatGPT(conversations);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
