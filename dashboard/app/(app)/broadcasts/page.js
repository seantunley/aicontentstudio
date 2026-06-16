// Broadcasts — Telegram (and later WhatsApp) bulk campaigns, native to the studio. v1 sends to the
// operator (test) or a pasted list of chat IDs, rate-limited, with each send logged. Production
// audience capture (a customer-facing bot people /start → Mautic) and WhatsApp (Meta WABA) are the
// next steps. Replies route to Chatwoot; engagement feeds Mautic.
import { listBroadcasts } from '@/lib/db';
import { tgGetMe } from '@/lib/telegram';
import { BroadcastComposer } from '@/app/components/broadcasts';
import { za } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function Broadcasts() {
  let past = [];
  try { past = listBroadcasts(30); } catch {}
  const bot = await tgGetMe();

  return (
    <>
      <div className="phead">
        <div>
          <h1>Broadcasts</h1>
          <div className="lede">Send a message to a Telegram audience, rate-limited and logged. To broadcast to customers you&rsquo;ll point this at a subscriber list; for now it sends to you or a pasted set of chat IDs.</div>
        </div>
        <div className="crumbs">{bot.ok ? `bot @${bot.username}` : 'bot not configured'}</div>
      </div>

      <section className="section reveal r1">
        <div className="section-head"><span className="idx">01</span><h2>Compose</h2><span className="rule" /></div>
        <BroadcastComposer />
      </section>

      <section className="section reveal r2">
        <div className="section-head"><span className="idx">02</span><h2>History</h2><span className="rule" /></div>
        <div className="panel" style={{ padding: 0 }}>
          {past.length === 0 ? <div className="empty" style={{ padding: 16 }}>No broadcasts sent yet.</div> : (
            <table className="table">
              <thead><tr><th>When</th><th>Channel</th><th>Audience</th><th>Message</th><th style={{ textAlign: 'right' }}>Sent</th><th style={{ textAlign: 'right' }}>Failed</th></tr></thead>
              <tbody>
                {past.map((b) => (
                  <tr key={b.id}>
                    <td className="id">{za(b.created_at)}</td>
                    <td>{b.channel}</td>
                    <td className="id">{b.audience}</td>
                    <td title={b.detail || ''}>{(b.message || '').slice(0, 50)}{(b.message || '').length > 50 ? '…' : ''}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{b.sent}/{b.total}</td>
                    <td className="num" style={{ textAlign: 'right', color: b.failed ? 'var(--red)' : 'inherit' }}>{b.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
