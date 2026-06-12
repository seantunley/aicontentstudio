FROM node:20-slim
WORKDIR /app

# Install deps first (better-sqlite3 ships a prebuilt binary for node20/glibc/x64).
# --legacy-peer-deps: Polotno's peer ranges predate React 19; this lets them coexist.
COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build && chown -R 1000:1000 /app

USER 1000:1000
EXPOSE 3000
CMD ["npm", "start"]
