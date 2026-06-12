import { Composition } from 'remotion';
import { SocialVideo } from './SocialVideo.jsx';

// Single composition; per-render width/height/duration come from inputProps
// via calculateMetadata so one comp serves every platform aspect ratio.
export const Root = () => (
  <Composition
    id="SocialVideo"
    component={SocialVideo}
    durationInFrames={180}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      imageUrl: '',
      caption: 'Your caption here',
      kicker: '',
      accent: '#c8f24e',
      width: 1080,
      height: 1920,
      durationSec: 6,
    }}
    calculateMetadata={({ props }) => ({
      width: props.width || 1080,
      height: props.height || 1920,
      durationInFrames: Math.max(60, Math.round((props.durationSec || 6) * 30)),
      fps: 30,
    })}
  />
);
