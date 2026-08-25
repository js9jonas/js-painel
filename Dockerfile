# Dockerfile customizado (substitui o build automático via Nixpacks) — necessário
# porque a renovação do painel CENTRAL só funciona vinda de um navegador real
# (ver docs/memoria/incident_central_sessao_nao_renderizada.md). Node 20 mantém
# paridade com o nixpacks.toml anterior; a diferença é Chrome real + Xvfb instalados
# no sistema, usados pelo módulo src/lib/central-browser-queue.ts.

FROM node:20-bookworm-slim AS base

# Chrome real (não o Chromium embutido do Playwright) — é o binário já comprovado
# funcionando contra a proteção anti-bot do CENTRAL (ver central_refresh_token.js).
# Instala baixando o .deb direto do Google e resolvendo dependências via
# `apt install ./pacote.deb` — mais simples e robusto que configurar o repositório
# apt deles (o .pub que a Google distribui é ASCII-armored e dá NO_PUBKEY/"not
# signed" se usado direto como keyring sem `gpg --dearmor`; baixar o .deb evita
# esse problema inteiro).
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
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
  && wget -q -O /tmp/google-chrome-stable.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  && apt-get install -y --no-install-recommends /tmp/google-chrome-stable.deb \
  && rm -f /tmp/google-chrome-stable.deb \
  && rm -rf /var/lib/apt/lists/*

ENV GOOGLE_CHROME_PATH=/usr/bin/google-chrome-stable
ENV DISPLAY=:99
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# O Easypanel passa as env vars do app como --build-arg (só no Dockerfile custom;
# o build automático via Nixpacks já injetava isso direto como env do processo).
# "Collecting page data" do next build executa código de servidor de algumas
# rotas (ex: DATABASE_URL em src/lib/db.ts), então precisam existir no build,
# não só no runtime. Sem declarar ARG aqui, o Docker descarta o --build-arg
# silenciosamente. Lista extraída do container real em produção (docker exec ... printenv).
ARG ANTHROPIC_API_KEY
ARG AUTH_SECRET
ARG AUTH_URL
ARG CAPSOLVER_API_KEY
ARG DATABASE_URL
ARG EVOLUTION_INSTANCE
ARG EVOLUTION_KEY
ARG EVOLUTION_URL
ARG GIPHY_API_KEY
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY
ARG GROQ_API_KEY
ARG INTERNAL_API_TOKEN
ARG INTER_ACCOUNT_NUMBER
ARG INTER_CLIENT_ID
ARG INTER_CLIENT_SECRET
ARG TELEGRAM_BOT_TOKEN
ARG TELEGRAM_CHAT_ID_JONAS
ARG TWOCAPTCHA_API_KEY
ARG UNIPLAY_PROXY_URL
ARG WHATSAPP_APP_SECRET
ARG WHATSAPP_INTERNAL_KEY
ARG WHATSAPP_PHONE_NUMBER_ID
ARG WHATSAPP_TOKEN
ARG WHATSAPP_VERIFY_TOKEN
ARG WHATSAPP_WABA_ID
ENV ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
    AUTH_SECRET=$AUTH_SECRET \
    AUTH_URL=$AUTH_URL \
    CAPSOLVER_API_KEY=$CAPSOLVER_API_KEY \
    DATABASE_URL=$DATABASE_URL \
    EVOLUTION_INSTANCE=$EVOLUTION_INSTANCE \
    EVOLUTION_KEY=$EVOLUTION_KEY \
    EVOLUTION_URL=$EVOLUTION_URL \
    GIPHY_API_KEY=$GIPHY_API_KEY \
    GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
    GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
    GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY=$GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY \
    GROQ_API_KEY=$GROQ_API_KEY \
    INTERNAL_API_TOKEN=$INTERNAL_API_TOKEN \
    INTER_ACCOUNT_NUMBER=$INTER_ACCOUNT_NUMBER \
    INTER_CLIENT_ID=$INTER_CLIENT_ID \
    INTER_CLIENT_SECRET=$INTER_CLIENT_SECRET \
    TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN \
    TELEGRAM_CHAT_ID_JONAS=$TELEGRAM_CHAT_ID_JONAS \
    TWOCAPTCHA_API_KEY=$TWOCAPTCHA_API_KEY \
    UNIPLAY_PROXY_URL=$UNIPLAY_PROXY_URL \
    WHATSAPP_APP_SECRET=$WHATSAPP_APP_SECRET \
    WHATSAPP_INTERNAL_KEY=$WHATSAPP_INTERNAL_KEY \
    WHATSAPP_PHONE_NUMBER_ID=$WHATSAPP_PHONE_NUMBER_ID \
    WHATSAPP_TOKEN=$WHATSAPP_TOKEN \
    WHATSAPP_VERIFY_TOKEN=$WHATSAPP_VERIFY_TOKEN \
    WHATSAPP_WABA_ID=$WHATSAPP_WABA_ID

# V8 usa um teto de heap padrão de ~2GB independente da RAM real disponível no
# container — o build (Turbopack + type-check do Next 16) estoura isso mesmo
# com RAM+swap de sobra. Aumenta só durante o build (não persiste pro runtime).
RUN NODE_OPTIONS=--max-old-space-size=6144 npm run build

EXPOSE 3000

# Sobe o Xvfb em background e mantém o processo Next.js em foreground.
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 & npm run start"]
