#!/usr/bin/env node
/**
 * Renova o token JWT da CENTRAL (painel.fun) via Playwright.
 * Roda localmente via cron a cada ~50min.
 * PENDENTE: migrar para VPS quando Chromium for adicionado ao nixpacks.toml.
 *
 * Uso: node src/scripts/central_refresh_token.js
 * Cron:  *\/50 * * * * cd /home/jonas/js-painel && node src/scripts/central_refresh_token.js >> /tmp/central_refresh.log 2>&1
 */

const { chromium } = require("/home/jonas/.npm/_npx/e41f203b7505f1fb/node_modules/playwright");
const { Pool } = require("pg");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:87fec72605778bc4dd1a@168.231.98.162:5432/js";

const USUARIO = "Jonas3468";
const SENHA = "683468";
const URL_PAINEL = "https://painel.fun/";
const ID_SERVIDOR = 2;
const PROFILE_DIR = "/home/jonas/.config/playwright-profile";

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
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
      await saveToken(pool, token);
      return;
    }

    // Preencher login
    await page.fill('input[name="username"], input[placeholder*="usuário"], input[placeholder*="user"]', USUARIO);
    await page.fill('input[name="password"], input[type="password"]', SENHA);

    // Aguardar Turnstile resolver automaticamente (~30s com Chrome real sem flag webdriver)
    await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 40_000 });

    await page.click('button[type="submit"]');

    // Aguardar navegação pós-login
    await page.waitForNavigation({ waitUntil: "load", timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2_000);

    token = await extractToken(page);
    if (!token) throw new Error("Token não encontrado no localStorage após login.");

    await saveToken(pool, token);
  } finally {
    if (browser) await browser.close();
    await pool.end();
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

async function saveToken(pool, token) {
  const expiry = new Date(Date.now() + 55 * 60 * 1000); // 55 min
  await pool.query(
    `UPDATE public.servidores SET session_cookie = $1, session_expiry = $2 WHERE id_servidor = $3`,
    [token, expiry, ID_SERVIDOR]
  );
  console.log(`[${new Date().toISOString()}] Token salvo. Expira em: ${expiry.toISOString()}`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] ERRO:`, err.message);
  process.exit(1);
});
