import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { importChatGPT, importMarkdownFile } from '@/lib/knowledge';

export const maxDuration = 300;

// Import into the knowledge base. Accepts (one or many):
//  - a ChatGPT export's conversations.json -> enriched conversation notes
//  - markdown / text files -> notes (frontmatter added if missing)
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let files;
  try { files = (await req.formData()).getAll('file'); } catch { return NextResponse.json({ error: 'bad upload' }, { status: 400 }); }
  files = files.filter((f) => f && typeof f !== 'string');
  if (!files.length) return NextResponse.json({ error: 'no file' }, { status: 400 });

  const chat = { added: 0, updated: 0, skipped: 0 };
  let notes = 0;
  const errors = [];

  for (const file of files) {
    const name = file.name || 'upload';
    let text;
    try { text = await file.text(); } catch { errors.push(`${name}: unreadable`); continue; }

    // ChatGPT export? (a .json that is, or wraps, a conversations array)
    if (/\.json$/i.test(name) || text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
      try {
        const json = JSON.parse(text);
        const conversations = Array.isArray(json) ? json : json.conversations || null;
        if (conversations) {
          const r = importChatGPT(conversations);
          chat.added += r.added; chat.updated += r.updated; chat.skipped += r.skipped;
          continue;
        }
        if (/\.json$/i.test(name)) { errors.push(`${name}: not a ChatGPT conversations.json`); continue; }
      } catch {
        if (/\.json$/i.test(name)) { errors.push(`${name}: invalid JSON`); continue; }
        // not JSON and not named .json -> fall through and treat as markdown/text
      }
    }

    // markdown / text -> a note
    try { importMarkdownFile(name, text); notes += 1; }
    catch (e) { errors.push(`${name}: ${String(e?.message || e)}`); }
  }

  const chatTotal = chat.added + chat.updated + chat.skipped;
  return NextResponse.json({
    ok: notes > 0 || chatTotal > 0,
    notes,
    chatgpt: chatTotal ? chat : null,
    errors,
  });
}
