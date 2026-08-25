// Fila serializada de renovação do CENTRAL via navegador real (Playwright + Chrome
// real + Xvfb). Existe porque a controle.fit passou a rejeitar POST /users/{id}/renew
// vindo de fora de um navegador renderizado (403 "sessao_nao_renderizada") — confirmado
// em 25/08/2026 que não é payload nem sessão expirada nem header faltando: é fingerprint
// de transporte (TLS/HTTP2) que nenhuma lib HTTP em Node reproduz. API oficial negada
// pela controle.fit. Ver docs/memoria/incident_central_sessao_nao_renderizada.md.
//
// Singleton em memória — ok pra single instance (Easypanel não é serverless, mesmo
// padrão já usado em renovar-sessao/route.ts). Mantém UM Chrome aberto, reaproveitado
// entre chamadas (o uso real é em rajada: várias renovações em poucos minutos via
// /alertas à noite), fechando por inatividade pra liberar memória.

import type { BrowserContext, Page } from "playwright";
import type { ResultadoRenovacao } from "./painel-adapters/types";

const PROFILE_DIR = process.env.CENTRAL_CHROME_PROFILE_DIR || "/app/.central-profile";
const CHROME_PATH = process.env.GOOGLE_CHROME_PATH || "/usr/bin/google-chrome-stable";
const IDLE_TIMEOUT_MS = 8 * 60 * 1000; // fecha o Chrome após 8min sem jobs
const JOB_TIMEOUT_MS = 45 * 1000; // uma renovação não deveria levar mais que isso

type Job = {
  usuario: string;
  resolve: (r: ResultadoRenovacao) => void;
};

let context: BrowserContext | null = null;
let page: Page | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const fila: Job[] = [];
let processando = false;

function agendarFechamentoPorInatividade() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (context) {
      await context.close().catch(() => {});
      context = null;
      page = null;
    }
  }, IDLE_TIMEOUT_MS);
}

async function limparLockStale() {
  // Container Docker é derrubado sem o Chrome fechar de forma limpa (Swarm mata o
  // processo direto num redeploy) — o SingletonLock fica apontando pro hostname do
  // container ANTERIOR (cada container tem hostname novo), e o Chrome se recusa a
  // abrir achando que outro processo "em outra máquina" ainda usa o profile. Como o
  // container é sempre single-instance (nunca dois Chromes de verdade ao mesmo tempo
  // nesse profile), é seguro remover esses arquivos de lock antes de cada launch.
  const fs = await import("fs/promises");
  for (const f of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    await fs.unlink(`${PROFILE_DIR}/${f}`).catch(() => {});
  }
}

async function garantirNavegadorAberto(): Promise<Page> {
  if (context && page && !page.isClosed()) return page;

  await limparLockStale();
  const { chromium } = await import("playwright");
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, // "headful" real (sob Xvfb) — é o que passa na checagem anti-bot
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    viewport: { width: 1600, height: 900 },
  });
  page = context.pages()[0] ?? (await context.newPage());
  return page;
}

function log(...args: unknown[]) {
  console.log("[CENTRAL-browser]", ...args);
}

async function salvarDiagnostico(p: Page, tag: string) {
  try {
    // Salva dentro do próprio volume persistente (sobrevive a restart do container,
    // recuperável via scp do host direto do bind mount).
    const path = `${PROFILE_DIR}/debug-${tag}-${Date.now()}.png`;
    await p.screenshot({ path }).catch(() => {});
    log("diagnóstico salvo:", path, "| url atual:", p.url());
  } catch {}
}

async function estaLogado(p: Page): Promise<boolean> {
  log("navegando para /users...");
  await p.goto("https://painel.fun/users", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await p.waitForTimeout(1500);
  const url = p.url();
  log("URL após navegação:", url);
  return !url.includes("/login");
}

async function executarRenovacao(p: Page, usuario: string): Promise<ResultadoRenovacao> {
  log("iniciando renovação de", usuario);
  if (!(await estaLogado(p))) {
    await salvarDiagnostico(p, "nao-logado");
    // Login automatizado (preencher formulário + Turnstile) não está implementado —
    // o profile é bootstrapado já logado (cópia do profile do desktop) e a sessão do
    // Chrome tende a durar bem mais que a sessão de API (é a mesma técnica usada pelo
    // central_refresh_token.js, que já roda estável há semanas). Se cair aqui, precisa
    // de reautenticação manual (abrir esse profile e logar uma vez).
    return { ok: false, erro: "Profile do Chrome (CENTRAL) não está logado — precisa reautenticação manual do profile persistente." };
  }
  log("logado com sucesso, buscando campo de busca...");

  // Busca a conta
  try {
    const campoBusca = p.locator('input[placeholder*="Usuário" i], input[placeholder*="Mac" i]').first();
    await campoBusca.waitFor({ state: "visible", timeout: 15_000 });
    log("campo de busca encontrado");
    await campoBusca.click();
    await campoBusca.fill("");
    await campoBusca.fill(usuario);
    await p.waitForTimeout(1500);
  } catch (err) {
    await salvarDiagnostico(p, "campo-busca-nao-encontrado");
    log("HTML da página (primeiros 2000 chars):", (await p.content()).slice(0, 2000));
    throw err;
  }

  log("campo preenchido, procurando linha da tabela...");
  const linha = p.locator("table tbody tr").filter({ hasText: usuario }).first();
  const existe = await linha.count();
  if (!existe) {
    await salvarDiagnostico(p, "linha-nao-encontrada");
    return { ok: false, erro: `Usuário "${usuario}" não encontrado no CENTRAL (via navegador).` };
  }
  log("linha encontrada, clicando em renovar...");

  let resposta: Awaited<ReturnType<Page["waitForResponse"]>>;
  try {
    // Intercepta a resposta real do /renew pra extrair o exp_date, igual à técnica
    // usada na investigação (ver incident_central_sessao_nao_renderizada.md).
    const respostaPromise = p.waitForResponse(
      (res) => res.url().includes("/renew") && res.request().method() === "POST",
      { timeout: JOB_TIMEOUT_MS }
    );

    const botaoRenovar = linha.getByTitle(/renovar por 1 mês/i).or(linha.locator('button:has-text("Renovar")')).first();
    await botaoRenovar.click();
    await p.waitForTimeout(800);
    log("modal deveria estar aberto, procurando botão de confirmação...");

    const botaoConfirmar = p.getByRole("button", { name: /sim, renovar por 1 mês/i });
    await botaoConfirmar.waitFor({ timeout: 8_000 });
    log("confirmando renovação...");
    await botaoConfirmar.click();

    resposta = await respostaPromise;
  } catch (err) {
    await salvarDiagnostico(p, "clique-renovar-falhou");
    throw err;
  }
  const body = await resposta.json().catch(() => null);
  log("resposta do /renew: status", resposta.status(), "exp_date presente:", !!body?.exp_date);

  // Fecha o modal de sucesso pra deixar a página pronta pro próximo job da fila
  const botaoFechar = p.getByRole("button", { name: /fechar/i });
  await botaoFechar.click({ timeout: 5_000 }).catch(() => {});

  if (!resposta.ok() || !body?.exp_date) {
    return { ok: false, erro: `Renovação via navegador falhou (HTTP ${resposta.status()}).` };
  }

  const novoVenc = new Date(Number(body.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return { ok: true, novoVencimento: novoVenc };
}

async function processarFila() {
  if (processando) return;
  processando = true;
  try {
    while (fila.length > 0) {
      if (idleTimer) clearTimeout(idleTimer);
      const job = fila.shift()!;
      try {
        const p = await garantirNavegadorAberto();
        const resultado = await Promise.race([
          executarRenovacao(p, job.usuario),
          new Promise<ResultadoRenovacao>((resolve) =>
            setTimeout(() => resolve({ ok: false, erro: "Timeout aguardando renovação via navegador." }), JOB_TIMEOUT_MS)
          ),
        ]);
        job.resolve(resultado);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro na automação de navegador.";
        log("ERRO ao processar job de", job.usuario, "-", msg);
        job.resolve({ ok: false, erro: msg });
      }
    }
  } finally {
    processando = false;
    agendarFechamentoPorInatividade();
  }
}

export function renovarViaBrowser(usuario: string): Promise<ResultadoRenovacao> {
  return new Promise((resolve) => {
    fila.push({ usuario, resolve });
    processarFila();
  });
}
