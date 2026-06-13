import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { listPosts } from '@/lib/postiz';

// Read-only calendar feed: Postiz's scheduled + published posts in a date range.
export async function GET(req) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  const posts = await listPosts(start, end);
  if (posts === null) return NextResponse.json({ error: 'Postiz unreachable', posts: [] }, { status: 502 });
  return NextResponse.json({ posts });
}
