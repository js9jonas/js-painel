# Dockerfile customizado (substitui o build automático via Nixpacks) — necessário
# porque a renovação do painel CENTRAL só funciona vinda de um navegador real
# (ver docs/memoria/incident_central_sessao_nao_renderizada.md). Node 20 mantém
# paridade com o nixpacks.toml anterior; a diferença é Chrome real + Xvfb instalados
# no sistema, usados pelo módulo src/lib/central-browser-queue.ts.

FROM node:20-bookworm-slim AS base

# Chrome real (não o Chromium embutido do Playwright) — é o binário já comprovado
# funcionando contra a proteção anti-bot do CENTRAL (ver central_refresh_token.js).
# Instala via repositório oficial do Google, mais Xvfb e libs necessárias pra
# rodar Chrome "headful" sem display físico.
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    xvfb \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxss1 \
    libxtst6 \
    libx11-xcb1 \
    libdrm2 \
  && wget -q -O /usr/share/keyrings/google-chrome-keyring.gpg https://dl.google.com/linux/linux_signing_key.pub \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

ENV GOOGLE_CHROME_PATH=/usr/bin/google-chrome-stable
ENV DISPLAY=:99
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

# Sobe o Xvfb em background e mantém o processo Next.js em foreground.
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 & npm run start"]
