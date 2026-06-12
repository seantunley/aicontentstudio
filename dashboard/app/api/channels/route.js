import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { listIntegrations } from '../../../lib/postiz';

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const chans = await listIntegrations();
  if (chans === null) return NextResponse.json({ channels: [], error: 'postiz unreachable' });
  const channels = chans
    .filter((c) => !c.disabled)
    .map((c) => ({ platform: c.identifier, handle: c.profile || c.name }));
  return NextResponse.json({ channels });
}
