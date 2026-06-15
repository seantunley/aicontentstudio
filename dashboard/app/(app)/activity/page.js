import Link from 'next/link';
import { listSystemEvents, markEventsSeen } from '@/lib/db';
import { za } from '@/lib/time';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'error', label: 'Errors' },
  { key: 'warn', label: 'Warnings' },
  { key: 'info', label: 'Notices' },
];
const LEVEL_LABEL = { error: 'error', warn: 'warning', info: 'notice' };

export default async function Activity({ searchParams }) {
  const sp = (await searchParams) || {};
  const level = FILTERS.some((f) => f.key === sp.level) ? sp.level : 'all';

  let items = [];
  try { items = listSystemEvents(150, level); } catch {}
  // Viewing the log clears the red badge — the operator has now seen the failures.
  try { markEventsSeen(); } catch {}

  return (
    <>
      <div className="phead">
        <div>
          <h1>Activity</h1>
          <div className="lede">Failures and notices the Studio would otherwise swallow silently — render errors, exhausted balances, publish rejections. Surfaced here, never buried in Telegram.</div>
        </div>
        <div className="crumbs">{items.length} event{items.length === 1 ? '' : 's'}</div>
      </div>

      <div className="seg">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === 'all' ? '/activity' : `/activity?level=${f.key}`} className={`seg-item ${level === f.key ? 'active' : ''}`}>
            {f.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="panel"><div className="empty">{level === 'all' ? 'All quiet. Nothing has failed or needed your attention.' : `No ${LEVEL_LABEL[level] || level} events.`}</div></div>
      ) : (
        <div className="panel evlog">
          {items.map((e) => (
            <div className={`evrow ev--${e.level}`} key={e.id}>
              <span className={`evdot ev--${e.level}`} />
              <div className="evbody">
                <div className="evhead">
                  <span className={`evlevel ev--${e.level}`}>{LEVEL_LABEL[e.level] || e.level}</span>
                  {e.source ? <span className="evsrc">{e.source}</span> : null}
                  <span className="evtime">{za(e.created_at)}</span>
                </div>
                <div className="evmsg">{e.message}</div>
                {e.detail ? <div className="evdetail">{e.detail}</div> : null}
                {e.job_id ? <Link className="evjob" href={`/job/${e.job_id}`}>open job →</Link> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
