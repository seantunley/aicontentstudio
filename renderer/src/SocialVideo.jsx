import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// Branded social video: Ken-Burns image, legibility scrim, animated kicker +
// caption with a lime accent bar, and a thin progress bar. No audio/TTS (deferred).
export const SocialVideo = ({ imageUrl, caption, kicker, accent }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const pad = Math.round(width * 0.06);

  // slow zoom + drift
  const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.2]);
  const drift = interpolate(frame, [0, durationInFrames], [0, -height * 0.03]);

  // staggered reveals
  const kick = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const cap = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const bar = spring({ frame: frame - 16, fps, config: { damping: 200 } });
  const progress = interpolate(frame, [0, durationInFrames], [0, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0e10', fontFamily: 'sans-serif' }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateY(${drift}px)` }}>
        {imageUrl ? (
          <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 30%, #1b2024, #0c0e10)' }} />
        )}
      </AbsoluteFill>

      {/* legibility scrim */}
      <AbsoluteFill
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.30) 38%, rgba(0,0,0,0) 60%)' }}
      />

      {/* caption block */}
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: pad }}>
        <div
          style={{
            width: Math.round(width * 0.16),
            height: Math.round(width * 0.012),
            background: accent,
            borderRadius: 99,
            marginBottom: Math.round(width * 0.035),
            transform: `scaleX(${bar})`,
            transformOrigin: 'left',
          }}
        />
        {kicker ? (
          <div
            style={{
              opacity: kick,
              transform: `translateY(${(1 - kick) * 16}px)`,
              color: accent,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontSize: Math.round(width * 0.03),
              marginBottom: Math.round(width * 0.025),
            }}
          >
            {kicker}
          </div>
        ) : null}
        <div
          style={{
            opacity: cap,
            transform: `translateY(${(1 - cap) * 24}px)`,
            color: '#fff',
            fontWeight: 800,
            fontSize: Math.round(width * 0.054),
            lineHeight: 1.22,
            textShadow: '0 2px 28px rgba(0,0,0,0.55)',
          }}
        >
          {caption}
        </div>
      </AbsoluteFill>

      {/* progress bar */}
      <AbsoluteFill style={{ justifyContent: 'flex-start' }}>
        <div style={{ height: Math.round(width * 0.008), width: `${progress * 100}%`, background: accent, opacity: 0.9 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
