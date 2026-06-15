import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { approvalQueue, publishable, scheduledJobs, listSuggestions, mediaCounts, trashedJobs, trashedMedia, listBrands, unseenErrorCount } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';
import { AppShell } from '@/app/components/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session.user) redirect('/login');

  const brand = await getActiveBrand();
  let counts = { queue: 0, ready: 0, upcoming: 0, scout: 0, vault: 0, trash: 0, errors: 0 };
  let brands = [];
  try {
    counts = {
      queue: approvalQueue(brand).length,
      ready: publishable(brand).length,
      upcoming: scheduledJobs(brand).length,
      scout: listSuggestions('new').length,
      vault: mediaCounts().total,
      trash: trashedJobs().length + trashedMedia().length,
      errors: unseenErrorCount(),
    };
    brands = listBrands();
  } catch {}

  return <AppShell user={session.user.name} counts={counts} brands={brands} activeBrand={brand}>{children}</AppShell>;
}
