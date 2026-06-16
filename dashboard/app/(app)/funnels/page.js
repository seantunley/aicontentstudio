// Funnels — Mautic mirrored NATIVELY in the studio (no Mautic login/chrome for the operator). The
// studio drives Mautic via its REST API (lib/mautic) and renders contacts/segments/stats in our own
// editorial-noir UI. Mautic's heavy visual authoring (campaign canvas, email designer) stays in the
// Mautic UI as an "advanced" escape hatch — linked, not embedded.
import Link from 'next/link';
import { funnelSummary, listSegments, listContacts, listEmails, shapeContact, mauticConfigured } from '@/lib/mautic';
import { FunnelContacts } from '@/app/components/funnels';

export const dynamic = 'force-dynamic';

const MAUTIC_URL = (process.env.MAUTIC_PUBLIC_URL || 'http://172.18.18.101:4010').replace(/\/$/, '');

export default async function Funnels() {
  let summary = { contacts: 0, segments: 0, emails: 0, campaigns: 0 };
  let segments = [], contacts = [], emails = [], total = 0, err = null;
  if (mauticConfigured()) {
    try {
      [summary, segments, emails] = await Promise.all([funnelSummary(), listSegments(), listEmails().catch(() => [])]);
      const c = await listContacts({ limit: 30 });
      total = c.total; contacts = c.contacts.map(shapeContact);
    } catch (e) { err = e.message || 'Mautic API error'; }
  } else {
    err = 'Mautic API not configured.';
  }

  // Aggregate email engagement across all emails (Mautic exposes per-email counts).
  const sent = emails.reduce((n, e) => n + Number(e.sentCount || 0), 0);
  const reads = emails.reduce((n, e) => n + Number(e.readCount || 0), 0);
  const openRate = sent ? Math.round((reads / sent) * 100) : 0;

  return (
    <>
      <div className="phead">
        <div>
          <h1>Funnels</h1>
          <div className="lede">Your nurture engine — contacts, segments and email performance, rendered right here. Mautic runs behind the scenes; you never have to leave the desk.</div>
        </div>
        <a className="crumbs" href={MAUTIC_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>advanced · open Mautic ↗</a>
      </div>

      {err ? (
        <section className="section"><div className="panel"><div className="empty" style={{ padding: 12 }}>
          {err} <a className="deeplink" href={MAUTIC_URL} target="_blank" rel="noreferrer">Open Mautic ↗</a>
        </div></div></section>
      ) : (
        <>
          <section className="section reveal r1">
            <div className="section-head"><span className="idx">01</span><h2>Overview</h2><span className="rule" /></div>
            <div className="statgrid">
              <div className="stat"><div className="big tnum">{summary.contacts}</div><div className="lab">Contacts</div></div>
              <div className="stat"><div className="big tnum">{summary.segments}</div><div className="lab">Segments</div></div>
              <div className="stat"><div className="big tnum">{sent}</div><div className="lab">Emails sent</div></div>
              <div className="stat"><div className="big tnum">{openRate}%</div><div className="lab">Open rate</div></div>
            </div>
          </section>

          <section className="section reveal r2">
            <div className="section-head"><span className="idx">02</span><h2>Segments</h2><span className="rule" />
              <a className="deeplink" href={`${MAUTIC_URL}/s/segments`} target="_blank" rel="noreferrer">manage ↗</a></div>
            <div className="panel">
              {segments.length === 0 ? <div className="empty">No segments yet.</div> : (
                <div className="field-row">
                  {segments.map((s) => (
                    <span key={s.id} className="pillar-chip" title={s.description || ''}>{s.name} · {s.contactCount ?? s.leadCount ?? 0}</span>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="section reveal r3">
            <div className="section-head"><span className="idx">03</span><h2>Contacts</h2><span className="rule" /></div>
            <FunnelContacts initial={contacts} total={total} />
          </section>
        </>
      )}
    </>
  );
}
