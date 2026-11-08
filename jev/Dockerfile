# jev-job-search on a server: headless Chromium, one daily run, state in volumes.
# See docs/CLOUD.md. Build: docker compose build
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation tzdata ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

ENV JEV_CHROME_PATH=/usr/bin/chromium \
    JEV_HEADLESS=1 \
    JEV_NO_SANDBOX=1 \
    TZ=Asia/Jakarta

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN mkdir -p data documents applications && chown -R node:node /app

USER node
# Everything about the person lives in these three folders. Named volumes start with the image's files (the voice guide, the examples).
VOLUME ["/app/data", "/app/documents", "/app/applications"]
ENTRYPOINT ["/usr/bin/tini", "--", "/app/cloud/entrypoint.sh"]
CMD ["loop"]
