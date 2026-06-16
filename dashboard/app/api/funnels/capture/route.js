import { NextResponse } from 'next/server';
import { upsertContact, mauticConfigured } from '@/lib/mautic';

export const dynamic = 'force-dynamic';

// Lead capture: a Typebot funnel's webhook block POSTs the captured fields here (one simple URL +
// token, no Mautic creds in the flow), and the studio creates/updates the Mautic contact server-side
// so the lead drops straight into nurture. Token is the gitignored FUNNEL_CAPTURE_TOKEN.
const TOKEN = process.env.FUNNEL_CAPTURE_TOKEN || '';
const ALLOWED = ['email', 'firstname', 'lastname', 'phone', 'company', 'city', 'state', 'country', 'zipcode', 'tags'];

export async function POST(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('x-capture-token') || '';
  if (!TOKEN || token !== TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!mauticConfigured()) return NextResponse.json({ error: 'mautic not configured' }, { status: 503 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }

  const fields = {};
  for (const k of ALLOWED) if (body[k] != null && body[k] !== '') fields[k] = body[k];
  if (!fields.email && !fields.phone) return NextResponse.json({ error: 'email or phone required' }, { status: 400 });
  if (!fields.tags) fields.tags = 'typebot-funnel'; // attribution: where the lead came from

  try {
    const contact = await upsertContact(fields);
    return NextResponse.json({ ok: true, id: contact?.id || null });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'capture failed' }, { status: 502 });
  }
}
