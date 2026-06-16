// Native Mautic contact detail — fields, tags, lead score and the activity timeline, in the studio UI.
import Link from 'next/link';
import { getContact, getContactActivity, mauticConfigured } from '@/lib/mautic';

export const dynamic = 'force-dynamic';
const MAUTIC_URL = (process.env.MAUTIC_PUBLIC_URL || 'http://172.18.18.101:4010').replace(/\/$/, '');

const fmt = (s) => { try { return new Date(s).toLocaleString('en-ZA'); } catch { return s || '—'; } };

export default async function ContactDetail({ params }) {
  const { id } = await params;
  let contact = null, activity = [], err = null;
  if (!mauticConfigured()) err = 'Mautic API not configured.';
  else {
    try { contact = await getContact(id); activity = await getContactActivity(id); }
    catch (e) { err = e.message || 'lookup failed'; }
  }

  const f = contact?.fields?.all || {};
  const name = [f.firstname, f.lastname].filter(Boolean).join(' ') || f.email || `Contact #${id}`;
  const tags = (contact?.tags || []).map((t) => t.tag || t).filter(Boolean);
  const fieldRows = [
    ['Email', f.email], ['Phone', f.phone], ['Company', f.company],
    ['City', f.city], ['Country', f.country],
  ].filter(([, v]) => v);

  return (
    <>
      <div className="phead">
        <div>
          <h1>{name}</h1>
          <div className="lede"><Link className="deeplink" href="/funnels">← Funnels</Link>{contact ? ` · lead score ${contact.points ?? 0}` : ''}</div>
        </div>
        {contact && <a className="crumbs" href={`${MAUTIC_URL}/s/contacts/view/${id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>open in Mautic ↗</a>}
      </div>

      {err || !contact ? (
        <section className="section"><div className="panel"><div className="empty" style={{ padding: 12 }}>{err || 'Contact not found.'}</div></div></section>
      ) : (
        <>
          <section className="section reveal r1">
            <div className="section-head"><span className="idx">01</span><h2>Details</h2><span className="rule" /></div>
            <div className="panel">
              {fieldRows.map(([k, v]) => (
                <div className="row-between" key={k} style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                  <span className="dim">{k}</span><span>{v}</span>
                </div>
              ))}
              {tags.length > 0 && (
                <div style={{ marginTop: 10 }}>{tags.map((t) => <span key={t} className="badge" style={{ marginRight: 5 }}>{t}</span>)}</div>
              )}
            </div>
          </section>

          <section className="section reveal r2">
            <div className="section-head"><span className="idx">02</span><h2>Activity</h2><span className="rule" /></div>
            <div className="panel" style={{ padding: 0 }}>
              {activity.length === 0 ? <div className="empty" style={{ padding: 16 }}>No tracked activity yet.</div> : (
                <table className="table">
                  <thead><tr><th>When</th><th>Event</th><th className="hide-sm">Detail</th></tr></thead>
                  <tbody>
                    {activity.slice(0, 40).map((ev, i) => (
                      <tr key={i}>
                        <td className="id">{fmt(ev.timestamp || ev.dateAdded)}</td>
                        <td>{ev.eventType || ev.event || '—'}</td>
                        <td className="hide-sm id">{ev.eventLabel?.label || ev.eventLabel || ev.eventName || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
