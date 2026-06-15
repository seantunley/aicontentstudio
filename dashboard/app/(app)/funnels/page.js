// Funnels — the Mautic marketing-automation engine embedded in the desk (§ funnels). Mautic's UI is
// too rich to rebuild (visual campaign builder, landing pages, forms), so we frame the real thing.
// Same host / different port = same-site, so the Mautic session cookie carries; no X-Frame block.
// The contact/lead handoff (studio/Chatwoot -> Mautic Contacts API) is the data glue underneath.
export const dynamic = 'force-dynamic';

const MAUTIC_URL = (process.env.MAUTIC_PUBLIC_URL || 'http://172.18.18.101:4010').replace(/\/$/, '');

export default function Funnels() {
  return (
    <section className="section reveal" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="section-head">
        <h2>Funnels</h2>
        <span className="dim" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>Mautic · contacts, campaigns, landing pages, email</span>
        <span className="rule" />
        <a className="deeplink" href={MAUTIC_URL} target="_blank" rel="noreferrer">open Mautic ↗</a>
      </div>
      <div className="embed-frame">
        <iframe src={MAUTIC_URL} title="Mautic — funnels" />
      </div>
    </section>
  );
}
