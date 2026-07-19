import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getSession } from '@/lib/session';

// On-demand scout: drop a marker in the shared studio volume; the worker tick (every ~2 min)
// picks it up and runs a scout pass. Avoids the dashboard needing to exec the agent directly.
export async function POST() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const dir = path.dirname(process.env.STUDIO_DB_PATH || '/opt/studio/studio.db');
    fs.writeFileSync(path.join(dir, '.scout-request'), new Date().toISOString());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
