import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { knowledgeGraph } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

// The knowledge base as a node/link graph for the dashboard's force-directed view.
export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try { return NextResponse.json(knowledgeGraph()); }
  catch (e) { return NextResponse.json({ error: String(e?.message || e) }, { status: 500 }); }
}
