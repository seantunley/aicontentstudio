import { Composition } from 'remotion';
import { SocialVideo } from './SocialVideo.jsx';
import { VoicedVideo } from './VoicedVideo.jsx';
import { PostMock, layout } from './PostMock.jsx';

// Per-render width/height/duration come from inputProps via calculateMetadata so one comp
// serves every platform aspect ratio.
export const Root = () => (
  <>
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
    <Composition
      id="VoicedVideo"
      component={VoicedVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ imageUrl: '', audioData: '', captions: [], accent: '#c8f24e', kicker: '', width: 1080, height: 1920, durationSec: 10 }}
      calculateMetadata={({ props }) => ({
        width: props.width || 1080,
        height: props.height || 1920,
        durationInFrames: Math.max(30, Math.round((props.durationSec || 10) * 30)),
        fps: 30,
      })}
    />
    <Composition
      id="PostMock"
      component={PostMock}
      durationInFrames={1}
      fps={1}
      width={1080}
      height={1350}
      defaultProps={{ platform: 'instagram', handle: '', body: 'Your caption here', images: [], video: false }}
      calculateMetadata={({ props }) => { const L = layout(props); return { width: L.width, height: L.frameH, durationInFrames: 1, fps: 1 }; }}
    />
  </>
);
