import express from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn, execFileSync } from 'child_process';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia, renderStill, ensureBrowser } from '@remotion/renderer';

// Local TTS (Piper) → wav. No Python; the binary + voice are baked into the image.
function runPiper(script, outWav) {
  return new Promise((resolve, reject) => {
    const bin = process.env.PIPER_BIN, voice = process.env.PIPER_VOICE;
    if (!bin || !voice) return reject(new Error('PIPER_BIN/PIPER_VOICE not set'));
    const p = spawn(bin, ['--model', voice, '--output_file', outWav]);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('piper exit ' + code + ': ' + err.slice(0, 200)))));
    p.stdin.write(script);
    p.stdin.end();
  });
}

// Voiceover synthesis → mp3. ElevenLabs (natural) when ELEVENLABS_API_KEY is set; else local Piper.
async function synthesizeSpeech(text, outMp3) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (key) {
    const voice = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
    const model = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 160)}`);
    fs.writeFileSync(outMp3, Buffer.from(await r.arrayBuffer()));
    return 'elevenlabs';
  }
  // Piper fallback (local, free) — tuned for a slightly slower, more natural read.
  const wav = outMp3.replace(/\.mp3$/, '.wav');
  await runPiper(text, wav);
  execFileSync('ffmpeg', ['-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', outMp3]);
  fs.unlink(wav, () => {});
  return 'piper';
}

function audioDurationSec(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  return parseFloat(out) || 0;
}

// Split a script into short caption phrases and time them proportionally across the voiceover.
function chunkCaptions(script, totalSec) {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const chunks = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 5 || /[.!?,:;]$/.test(w)) { chunks.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) chunks.push(cur.join(' '));
  const totalChars = chunks.reduce((s, c) => s + c.length, 0) || 1;
  let t = 0;
  const caps = chunks.map((c) => {
    const dur = totalSec * (c.length / totalChars);
    const seg = { text: c.replace(/[\s,;:.]+$/, ''), start: t, end: t + dur };
    t += dur;
    return seg;
  });
  if (caps.length) caps[caps.length - 1].end = totalSec;
  return caps;
}

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

// POST /video -> script + image => Piper voiceover + time-synced captions => 9:16 mp4 (§7b Phase 3)
app.post('/video', async (req, res) => {
  const { script = '', imageUrl = '', accent = '#c8f24e', kicker = '', width = 1080, height = 1920 } = req.body || {};
  if (!script.trim()) return res.status(400).json({ error: 'script required' });
  const stamp = `${process.pid}_${Math.round(Math.random() * 1e9)}`;
  const mp3 = path.join(os.tmpdir(), `vo_${stamp}.mp3`);
  const out = path.join(os.tmpdir(), `voiced_${stamp}.mp4`);
  try {
    const engine = await synthesizeSpeech(script.trim(), mp3);
    const durSec = Math.min(90, Math.max(3, audioDurationSec(mp3)));
    const audioData = 'data:audio/mpeg;base64,' + fs.readFileSync(mp3).toString('base64');
    fs.unlink(mp3, () => {});
    console.log(`/video: tts=${engine} dur=${durSec.toFixed(1)}s`);
    const captions = chunkCaptions(script, durSec);

    await ensureBrowser();
    const serveUrl = await getBundle();
    const inputProps = { imageUrl, audioData, captions, accent, kicker, width, height, durationSec: durSec };
    const composition = await selectComposition({ serveUrl, id: 'VoicedVideo', inputProps });
    // NOTE: this container has 1 core, so concurrency stays at the default (1); 24fps keeps frames down.
    await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: out, inputProps,
      chromiumOptions: { gl: 'swangle' } });

    res.setHeader('Content-Type', 'video/mp4');
    res.sendFile(out, () => fs.unlink(out, () => {}));
  } catch (e) {
    [mp3, out].forEach((f) => fs.unlink(f, () => {}));
    console.error('video failed:', e);
    if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) });
  }
});

const PORT = process.env.PORT || 3100;
app.listen(PORT, '0.0.0.0', () => console.log(`studio-renderer on ${PORT}`));
