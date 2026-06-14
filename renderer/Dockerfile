FROM node:20-slim

# Chromium (Remotion headless render) + ffmpeg + fonts. Remotion downloads its own
# Chromium binary; these are the shared libs it needs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libxshmfence1 libasound2 libpango-1.0-0 libcairo2 libatspi2.0-0 \
      fonts-dejavu-core fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

# Pre-download the Remotion Chromium so the first render is fast.
RUN node -e "import('@remotion/renderer').then(m => m.ensureBrowser()).catch(e => { console.error(e); process.exit(0); })"

ENV PORT=3100
EXPOSE 3100
CMD ["node", "server.js"]
