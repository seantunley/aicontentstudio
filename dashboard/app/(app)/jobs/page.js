import Link from 'next/link';
import { recentJobs } from '@/lib/db';

export const dynamic = 'force-dynamic';
const short = (id) => (id ? id.slice(0, 8) : '');
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

export default function Jobs() {
  let jobs = [];
  try { jobs = recentJobs(200); } catch {}
  return (
    <>
      <div className="phead">
        <div><h1>All jobs</h1><div className="lede">Every content job and where it sits in the pipeline.</div></div>
        <div className="crumbs">{jobs.length} total</div>
      </div>
      <div className="panel" style={{ padding: 0 }}>
        <table className="table">
          <thead><tr><th>ID</th><th>State</th><th>Brand</th><th>Topic</th><th className="hide-sm">Source</th><th className="hide-sm">Updated</th></tr></thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="id"><Link className="joblink" href={`/job/${j.id}`}>{short(j.id)}</Link></td>
                <td><span className={`badge badge--${j.state}`}>{j.state}</span></td>
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
