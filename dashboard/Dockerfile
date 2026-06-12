FROM node:20-slim
WORKDIR /app

# Install deps first (better-sqlite3 ships a prebuilt binary for node20/glibc/x64).
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build && chown -R 1000:1000 /app

USER 1000:1000
EXPOSE 3000
CMD ["npm", "start"]
