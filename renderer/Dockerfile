FROM node:20-slim

# Chromium (Remotion headless render) + ffmpeg + fonts. Remotion downloads its own
# Chromium binary; these are the shared libs it needs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl ca-certificates \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libxshmfence1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
      fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

# Piper — local neural TTS for video voiceover (§7b Phase 3). Standalone binary, no Python.
RUN mkdir -p /opt/piper && cd /opt/piper && \
    curl -fsSL -o piper.tar.gz "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz" && \
    tar xzf piper.tar.gz && rm piper.tar.gz && \
    curl -fsSL -o voice.onnx "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx" && \
    curl -fsSL -o voice.onnx.json "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
ENV PIPER_BIN=/opt/piper/piper/piper PIPER_VOICE=/opt/piper/voice.onnx

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Pre-download the Remotion Chromium so the first render is fast.
RUN node -e "import('@remotion/renderer').then(m => m.ensureBrowser()).catch(e => { console.error(e); process.exit(0); })"

ENV PORT=3100
EXPOSE 3100
CMD ["node", "server.js"]
