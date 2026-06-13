import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getBrief } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The research brief (cited facts + angles) for a job — lazy-loaded by the approval queue card so
// the operator sees the background behind a draft before approving, without leaving the gate.
export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  return NextResponse.json({ brief: getBrief(jobId) });
}
