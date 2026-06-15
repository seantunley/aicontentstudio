import { AbsoluteFill, Img, OffthreadVideo, Audio, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// §7b Phase 3 — a real short: AI image (Ken-Burns) + voiceover audio + time-synced kinetic captions,
// 9:16. Captions come in pre-timed (seconds) from the /video endpoint; audio is a data URI so it
// travels in inputProps with no asset server.
const FONT = "'Liberation Sans', 'DejaVu Sans', 'Noto Color Emoji', sans-serif";

export const VoicedVideo = ({ imageUrl, videoUrl, audioData, captions = [], accent = '#c8f24e', kicker = '' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const t = frame / fps;
  const pad = Math.round(width * 0.06);

  const scale = interpolate(frame, [0, durationInFrames], [1.05, 1.18]);
  const drift = interpolate(frame, [0, durationInFrames], [0, -height * 0.03]);
  const progress = interpolate(frame, [0, durationInFrames], [0, 1]);

  const cap = captions.find((c) => t >= c.start && t < c.end) || null;
  const capIn = cap ? spring({ frame: frame - Math.round(cap.start * fps), fps, config: { damping: 200 } }) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0e10', fontFamily: FONT }}>
      {videoUrl ? (
        // Grok Imagine motion clip as the moving background — its own motion, so no Ken-Burns
        // transform; loop + mute (our voiceover carries the audio; the clip has none).
        <AbsoluteFill>
          <OffthreadVideo src={videoUrl} loop muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ transform: `scale(${scale}) translateY(${drift}px)` }}>
          {imageUrl
            ? <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 30%, #1b2024, #0c0e10)' }} />}
        </AbsoluteFill>
      )}

      {/* legibility scrim, heavier at the bottom where captions sit */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.34) 45%, rgba(0,0,0,0.05) 72%)' }} />

      {audioData ? <Audio src={audioData} /> : null}

      {kicker ? (
        <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', padding: pad }}>
          <div style={{ marginTop: Math.round(height * 0.06), color: accent, fontWeight: 700, letterSpacing: 2,
            textTransform: 'uppercase', fontSize: Math.round(width * 0.03), textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}>{kicker}</div>
        </AbsoluteFill>
      ) : null}

      {/* time-synced caption */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: pad, paddingBottom: Math.round(height * 0.15) }}>
        {cap ? (
          <div style={{ opacity: capIn, transform: `translateY(${(1 - capIn) * 22}px)`, maxWidth: '92%', textAlign: 'center' }}>
            <span style={{
              color: '#fff', fontWeight: 800, fontSize: Math.round(width * 0.062), lineHeight: 1.5,
              background: 'rgba(0,0,0,0.5)', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone',
              padding: '0.12em 0.36em', borderRadius: 12, textShadow: '0 2px 14px rgba(0,0,0,0.85)',
            }}>{cap.text}</span>
          </div>
        ) : null}
      </AbsoluteFill>

      {/* accent progress bar */}
      <AbsoluteFill style={{ justifyContent: 'flex-start' }}>
        <div style={{ height: Math.round(width * 0.008), width: `${progress * 100}%`, background: accent, opacity: 0.9 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
