import Link from 'next/link';
import { recentJobs } from '@/lib/db';
import { getActiveBrand } from '@/lib/brand';
import { za } from '@/lib/time';
import { Tooltip, InfoDot } from '@/app/components/ui';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');
const when = (s) => za(s);

export default async function Jobs() {
  const brand = await getActiveBrand();
  let jobs = [];
  try { jobs = recentJobs(200, brand); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>All jobs</h1><div className="lede">Every content job and where it sits in the pipeline.</div></div>
        <div className="crumbs">{jobs.length} total</div>
      </div>
      <div className="panel reveal" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>ID</th><th>State<InfoDot tip="Where the job is in its lifecycle: requested → researched → drafted → review → approved → scheduled/published." placement="bottom" /></th><th className="hide-sm">Worker<InfoDot tip="What the background worker is doing (or last did) for this job — “failed” means it errored." placement="bottom" /></th><th>Brand</th><th>Topic</th><th className="hide-sm">Source</th><th className="hide-sm">Updated</th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="id"><Link className="joblink" href={`/job/${j.id}`}>{short(j.id)}</Link></td>
                <td><Tooltip className={`badge badge--${j.state}`} text={`Current pipeline state: ${j.state}.`}>{j.state}</Tooltip></td>
                <td className="hide-sm id" style={j.queued_action === 'failed' ? { color: 'var(--red)' } : null}>{j.queued_action || ''}</td>
                <td>{j.brand}</td>
                <td><Link className="joblink" href={`/job/${j.id}`}>{j.topic}</Link></td>
                <td className="hide-sm id">{j.source}</td>
                <td className="hide-sm id">{when(j.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
