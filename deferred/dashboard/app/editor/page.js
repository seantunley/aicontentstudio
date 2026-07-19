import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession } from '@/lib/session';
import EditorMount from '@/app/components/EditorMount';

export const dynamic = 'force-dynamic';

// Full-screen editor (outside the cockpit shell). Auth-gated like the rest.
export default async function EditorPage() {
  const session = await getSession();
  if (!session.user) redirect('/login');
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <EditorMount />
    </Suspense>
  );
}
