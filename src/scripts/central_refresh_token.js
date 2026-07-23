#!/usr/bin/env node
/**
 * Renova o token JWT da CENTRAL (painel.fun) via Playwright.
 * Roda localmente via cron a cada ~50min, usando Xvfb (display virtual) — precisa de
 * Chrome "de cabeça" (headless: false) pra passar no Turnstile do Cloudflare sem cair
 * em detecção de bot, mas sem abrir janela visível no desktop.
 * PENDENTE: migrar para VPS quando Chromium for adicionado ao nixpacks.toml.
 *
 * Uso: xvfb-run -a node src/scripts/central_refresh_token.js
 * Cron:  *\/50 * * * * cd /home/jonas/js-painel && xvfb-run -a node src/scripts/central_refresh_token.js >> /tmp/central_refresh.log 2>&1
 */

const { chromium } = require("/home/jonas/.npm/_npx/e41f203b7505f1fb/node_modules/playwright");

// Salva o token via HTTP no próprio js-painel (rota api/interno/central-token) em vez
// de conectar direto no Postgres — a porta 5432 externa está bloqueada por firewall
// desde 11/07/2026, só aceita conexão via túnel SSH, que não fica sempre aberto no
// desktop. Reaproveita o bypass genérico de rota interna do proxy.ts (x-internal-token).
const APP_URL = process.env.CENTRAL_APP_URL || "https://painel.jssistemas.online";
const INTERNAL_API_TOKEN =
  process.env.INTERNAL_API_TOKEN || "aa128938d9c47cc233b647fccf55d69f48f331dbb9b5779d";

const USUARIO = "Jonas3468";
const SENHA = "683468";
const URL_PAINEL = "https://painel.fun/";
const PROFILE_DIR = "/home/jonas/.config/playwright-profile";

async function main() {
  let browser;

  try {
    console.log(`[${new Date().toISOString()}] Iniciando refresh token CENTRAL...`);

    browser = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      executablePath: "/usr/bin/google-chrome-stable",
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
      ignoreDefaultArgs: ["--enable-automation"],
    });

    const page = await browser.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.goto(URL_PAINEL, { waitUntil: "load", timeout: 30_000 });

    // Se já estiver logado, pegar token direto
    let token = await extractToken(page);
    if (token) {
      console.log("Já autenticado, token extraído do localStorage.");
      await saveToken(token);
      return;
    }

    // Preencher login — pode cair na tela cheia (usuário+senha) ou na tela de
    // bloqueio do perfil salvo (só senha, lembra o usuário) dependendo do estado
    // do profile persistente, então o campo de usuário é opcional.
    const campoUsuario = page.locator('input[name="username"], input[placeholder*="usuário"], input[placeholder*="user"]');
    if (await campoUsuario.count() > 0) {
      await campoUsuario.first().fill(USUARIO);
    }
    await page.fill('input[name="password"], input[type="password"]', SENHA);

    // Aguardar Turnstile resolver automaticamente (~30s com Chrome real sem flag webdriver)
    await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 40_000 });

    await page.click('button[type="submit"]');

    // Aguardar navegação pós-login
    await page.waitForNavigation({ waitUntil: "load", timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_000);

    token = await extractToken(page);
    if (!token) throw new Error("Token não encontrado no localStorage após login.");

    await saveToken(token);
  } finally {
    if (browser) await browser.close();
  }
}

async function extractToken(page) {
  return page.evaluate(() => {
    // painel.fun usa Pinia/Zustand — tentar chaves comuns
    for (const key of Object.keys(localStorage)) {
      try {
        const val = JSON.parse(localStorage.getItem(key));
        const token =
          val?.token ||
          val?.access_token ||
          val?.state?.token ||
          val?.state?.access_token;
        if (token && typeof token === "string" && token.startsWith("eyJ")) {
          return token;
        }
      } catch {}
    }
    return null;
  });
}

async function saveToken(token) {
  const res = await fetch(`${APP_URL}/api/interno/central-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-token": INTERNAL_API_TOKEN },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao salvar token via API (${res.status}): ${await res.text()}`);
  }
  const { expiry } = await res.json();
  console.log(`[${new Date().toISOString()}] Token salvo. Expira em: ${expiry}`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] ERRO:`, err.message);
  process.exit(1);
});
