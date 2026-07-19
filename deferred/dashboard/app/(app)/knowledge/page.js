import { listNotes, knowledgeStats } from '@/lib/knowledge';
import { KnowledgeBrowser } from '@/app/components/knowledge';

export const dynamic = 'force-dynamic';

export default function Knowledge() {
  let notes = [], stats = { total: 0, chatgpt: 0, other: 0 };
  try { notes = listNotes(); stats = knowledgeStats(); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>Knowledge</h1><div className="lede">Your imported history and artifacts, compiled into a markdown knowledge base. Hermes reads it when researching and drafting, so the studio can draw on what you already know.</div></div>
        <div className="crumbs">{stats.total} notes</div>
      </div>
      <KnowledgeBrowser notes={notes} stats={stats} />
    </>
  );
}
