import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { setScoutSchedule } from '@/lib/db';

// Set how often the scout auto-runs (cadence in hours; 0/enabled=false = off).
export async function POST(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  try {
    return NextResponse.json(setScoutSchedule({ days: body.days, hour: body.hour, minute: body.minute, enabled: body.enabled }));
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
