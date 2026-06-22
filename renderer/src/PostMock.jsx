import { AbsoluteFill, Img } from 'remotion';

// "As it'll appear on the platform" still — the same mockup the dashboard PostPreview shows, rendered
// to a PNG so it can be sent to Telegram. Header (avatar/name/handle), media (single image or the first
// carousel slide with a 1/N pill + dots), caption, and a platform-appropriate action row. Text-first
// platforms (X/Bluesky/Telegram) put the caption above the media; feed platforms below.

const META = {
  instagram: { label: 'Instagram', color: '#E1306C' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  x: { label: 'X', color: '#000000' },
  bluesky: { label: 'Bluesky', color: '#1185fe' },
  telegram: { label: 'Telegram', color: '#26A5E4' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
  vk: { label: 'VK', color: '#0077FF' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  tiktok: { label: 'TikTok', color: '#111111' },
};
const TEXT_FIRST = ['x', 'bluesky', 'telegram', 'threads', 'mastodon'];
const ASPECT = { instagram: 1.25, facebook: 1.25, x: 0.5625, youtube: 0.5625, tiktok: 1.778 };

const FRAME_W = 1080;
const MARGIN = 50;
const CARD_W = FRAME_W - MARGIN * 2; // 980
const FONT = "'Liberation Sans', 'DejaVu Sans', 'Noto Color Emoji', sans-serif";

// Shared layout maths — both calculateMetadata (frame height) and the component use it so they agree.
export function layout(props) {
  const platform = (props.platform || 'instagram').toLowerCase();
  const images = props.images || [];
  const hasImage = images.length > 0;
  const hasVideo = !!props.video;
  const aspect = ASPECT[platform] ?? 1.0;
  const mediaH = hasImage || hasVideo ? Math.round(CARD_W * aspect) : 0;
  const body = (props.body || '').slice(0, 800);
  // overestimate caption height so nothing clips (52 chars/line is conservative for a 980px card)
  const lines = body.split('\n').reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / 52)), 0);
  const captionH = lines * 46 + 56;
  const headerH = 128;
  const actionsH = 92;
  const cardH = headerH + mediaH + actionsH + captionH;
  const frameH = 56 + cardH + 56 + 40; // top + card + bottom + safety
  return { platform, images, hasImage, hasVideo, aspect, mediaH, body, cardH, frameH, width: FRAME_W };
}

export const PostMock = (props) => {
  const L = layout(props);
  const meta = META[L.platform] || { label: L.platform, color: '#555' };
  const palette = props.palette || {};
  const avatarColor = palette.primary || palette.accent || meta.color; // brand avatar tint; falls back to platform colour
  const name = props.handle && props.handle !== 'unassigned' ? props.handle : meta.label;
  const textFirst = TEXT_FIRST.includes(L.platform);
  const n = L.images.length;
  const initial = (name[0] || '?').toUpperCase();

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: avatarColor, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 28, flexShrink: 0 }}>{initial}</div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 27, color: '#111' }}>{name}</span>
        <span style={{ fontSize: 22, color: '#777' }}>{textFirst ? `@${(name || '').toLowerCase().replace(/\s+/g, '')}` : 'Sponsored'}</span>
      </div>
      <span style={{ marginLeft: 'auto', color: '#555', fontWeight: 700, fontSize: 30 }}>···</span>
    </div>
  );

  const media = (L.hasImage || L.hasVideo) ? (
    <div style={{ position: 'relative', width: '100%', height: L.mediaH, background: '#000' }}>
      {L.hasImage ? <Img src={L.images[0]} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      {L.hasVideo ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>▶</div>
        </div>
      ) : null}
      {n > 1 && !L.hasVideo ? (
        <span style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.7)', color: '#fff',
          borderRadius: 999, padding: '5px 16px', fontSize: 22, fontWeight: 600 }}>1/{n}</span>
      ) : null}
      {n > 1 && !L.hasVideo ? (
        <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 9 }}>
          {L.images.map((_, i) => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: i === 0 ? '#fff' : 'rgba(255,255,255,0.5)' }} />
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  const caption = (
    <div style={{ padding: '4px 24px 24px', color: '#111', fontSize: 30, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
      {textFirst ? null : <span style={{ fontWeight: 600, marginRight: 8 }}>{name}</span>}{L.body}
    </div>
  );

  const feedActions = (
    <div style={{ display: 'flex', gap: 26, padding: '14px 24px', fontSize: 36 }}>
      <span>♡</span><span>💬</span><span>↗</span><span style={{ marginLeft: 'auto' }}>🔖</span>
    </div>
  );
  const xActions = (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 60px', fontSize: 32, color: '#536471' }}>
      <span>💬</span><span>🔁</span><span>♡</span><span>📊</span>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: '#0c0e10', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: CARD_W, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.5)' }}>
        {header}
        {textFirst ? <>{caption}{media}{xActions}</> : <>{media}{feedActions}{caption}</>}
      </div>
    </AbsoluteFill>
  );
};
