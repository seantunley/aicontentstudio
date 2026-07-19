import { listLearnings } from '@/lib/db';
import { playbookNotes } from '@/lib/knowledge';
import { getActiveBrand } from '@/lib/brand';
import { LearningsView } from '@/app/components/learnings';

export const dynamic = 'force-dynamic';

export default async function Learnings() {
  const brand = await getActiveBrand();
  let feedback = [], playbook = [];
  try { feedback = listLearnings(brand); } catch {}
  try { playbook = playbookNotes(); } catch {}
  return (
    <>
      <div className="phead">
        <div>
          <h1>Learnings</h1>
          <div className="lede">What the Studio has learned — your edits and rejections{brand ? ` for ${brand}` : ''} that shape every new draft (<b>Feedback</b>), plus the studio&rsquo;s curated craft principles (<b>Playbook</b>) that you and the bots draw on.</div>
        </div>
        <div className="crumbs">{feedback.length} signal{feedback.length === 1 ? '' : 's'}</div>
      </div>
      <LearningsView feedback={feedback} playbook={playbook} />
    </>
  );
}
