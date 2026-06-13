import { EngagementInbox } from '@/app/components/engagement';

export const dynamic = 'force-dynamic';

export default function Engagement() {
  return (
    <>
      <div className="phead">
        <div>
          <h1>Engagement</h1>
          <div className="lede">Comments, replies and DMs that come back from what you posted — pulled in from Chatwoot, the self-hosted engagement engine. Triage them here; on-brand reply-drafting through the approval gate comes next.</div>
        </div>
      </div>
      <EngagementInbox />
    </>
  );
}
