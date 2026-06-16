// Flows — the Typebot visual funnel/chatbot builder embedded in the desk. Typebot's drag-and-drop
// builder is the product (like Figma) — we don't rebuild it, we frame the real thing. Typebot sends
// X-Frame-Options: SAMEORIGIN, so a tiny nginx proxy (typebot-proxy) strips it; this page frames that
// proxy. Captured leads webhook into Mautic for nurture (wired in the Mautic-mirror phase).
//
// Login: it's a magic-link (no external mail). Enter your email in the builder, then open the login
// inbox (Mailpit) to click the link. The session then persists.
export const dynamic = 'force-dynamic';

const TYPEBOT_URL = (process.env.TYPEBOT_PUBLIC_URL || 'http://172.18.18.101:4011').replace(/\/$/, '');
const MAILPIT_URL = (process.env.TYPEBOT_MAILPIT_URL || 'http://172.18.18.101:4013').replace(/\/$/, '');

export default function Flows() {
  return (
    <section className="section reveal" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="section-head">
        <h2>Flows</h2>
        <span className="dim" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>Typebot · visual funnel &amp; chatbot builder</span>
        <span className="rule" />
        <a className="deeplink" href={MAILPIT_URL} target="_blank" rel="noreferrer">login inbox ↗</a>
        <a className="deeplink" href={TYPEBOT_URL} target="_blank" rel="noreferrer">open builder ↗</a>
      </div>
      <div className="embed-frame">
        <iframe src={TYPEBOT_URL} title="Typebot — flows" />
      </div>
    </section>
  );
}
