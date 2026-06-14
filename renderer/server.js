import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, ensureBrowser } from '@remotion/renderer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));

let bundlePromise = null;
function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: path.join(__dirname, 'src/index.js') });
  }
  return bundlePromise;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// POST /render -> renders SocialVideo with props, streams back the mp4
app.post('/render', async (req, res) => {
  const {
    imageUrl = '',
    caption = '',
    kicker = '',
    accent = '#c8f24e',
    width = 1080,
    height = 1920,
    durationSec = 6,
  } = req.body || {};
  if (!caption) return res.status(400).json({ error: 'caption required' });

  const out = path.join(os.tmpdir(), `vid_${process.pid}_${req.body.id || Math.round(width * height)}.mp4`);
  try {
    await ensureBrowser();
    const serveUrl = await getBundle();
    const inputProps = { imageUrl, caption, kicker, accent, width, height, durationSec };
    const composition = await selectComposition({ serveUrl, id: 'SocialVideo', inputProps });
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: out,
      inputProps,
      chromiumOptions: { gl: 'swangle' },
    });
    res.setHeader('Content-Type', 'video/mp4');
    res.sendFile(out, (err) => {
      fs.unlink(out, () => {});
      if (err && !res.headersSent) res.status(500).end();
    });
  } catch (e) {
    fs.unlink(out, () => {});
    console.error('render failed:', e);
    if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// POST /preview -> renders the PostMock platform-mockup still, streams back a PNG
app.post('/preview', async (req, res) => {
  const { platform = 'instagram', handle = '', body = '', images = [], video = false } = req.body || {};
  const out = path.join(os.tmpdir(), `preview_${process.pid}_${Math.round(Math.random() * 1e9)}.png`);
  try {
    await ensureBrowser();
    const serveUrl = await getBundle();
    const inputProps = { platform, handle, body, images, video };
    const composition = await selectComposition({ serveUrl, id: 'PostMock', inputProps });
    await renderStill({
      composition,
      serveUrl,
      output: out,
      inputProps,
      imageFormat: 'png',
      chromiumOptions: { gl: 'swangle' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(out, (err) => {
      fs.unlink(out, () => {});
      if (err && !res.headersSent) res.status(500).end();
    });
  } catch (e) {
    fs.unlink(out, () => {});
    console.error('preview failed:', e);
    if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) });
  }
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, '0.0.0.0', () => console.log(`studio-renderer on ${PORT}`));
