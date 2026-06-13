import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { listIntegrations, integrationAnalytics } from '@/lib/postiz';

export const dynamic = 'force-dynamic';

// Platforms Postiz has an analytics provider for (verified against the backend at build, §7f).
// Anything else (e.g. bluesky) returns no metrics — the panel says so honestly.
const REPORTS = ['instagram', 'facebook', 'youtube', 'linkedin', 'linkedin-page', 'tiktok', 'threads', 'pinterest'];

export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 30));
  const ints = await listIntegrations();
  if (ints === null) return NextResponse.json({ channels: null, days, reports: REPORTS }); // Postiz unreachable
  const channels = [];
  for (const i of ints.filter((x) => !x.disabled)) {
    const metrics = await integrationAnalytics(i.id, days);
    channels.push({ id: i.id, name: i.profile || i.name, platform: i.identifier, metrics, reports: REPORTS.includes(i.identifier) });
  }
  return NextResponse.json({ channels, days, reports: REPORTS });
}
