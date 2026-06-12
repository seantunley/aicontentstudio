import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { approvalQueue, publishable, scheduledJobs, listSuggestions } from '@/lib/db';
import { AppShell } from '@/app/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session.user) redirect('/login');

  let counts = { queue: 0, ready: 0, upcoming: 0, scout: 0 };
  try {
    counts = {
      queue: approvalQueue().length,
      ready: publishable().length,
      upcoming: scheduledJobs().length,
      scout: listSuggestions('new').length,
    };
  } catch {}

  return <AppShell user={session.user.name} counts={counts}>{children}</AppShell>;
}
