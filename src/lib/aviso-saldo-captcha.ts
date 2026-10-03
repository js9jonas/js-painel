// Aviso no Telegram quando o saldo dos serviços de captcha acaba ou fica baixo.
// - 2captcha: login do CLUB (hCaptcha)
// - CapSolver: login de NOW, UniTV, SmartOne, AppAcesso e Central
// Motivação: em 03/10/2026 o saldo do 2captcha zerou e o CLUB parou de conectar em /conexoes
// sem nenhum aviso — Jonas só percebeu porque o card não conectava mais.
// Docs oficiais: 2captcha.com/api-docs/get-balance · docs.capsolver.com/en/guide/api-getbalance
// Saldo zerado nos dois = errorCode "ERROR_ZERO_BALANCE" (errorId é 10 no 2captcha e 1 —
// genérico — no CapSolver, por isso a detecção olha só o errorCode).

export type ServicoCaptcha = "2captcha" | "capsolver";

const SERVICOS: Record<ServicoCaptcha, { nome: string; envKey: string; urlSaldo: string; urlRecarga: string; paineis: string }> = {
  "2captcha": {
    nome: "2captcha",
    envKey: "TWOCAPTCHA_API_KEY",
    urlSaldo: "https://api.2captcha.com/getBalance",
    urlRecarga: "https://2captcha.com/pay",
    paineis: "CLUB",
  },
  capsolver: {
    nome: "CapSolver",
    envKey: "CAPSOLVER_API_KEY",
    urlSaldo: "https://api.capsolver.com/getBalance",
    urlRecarga: "https://dashboard.capsolver.com/",
    paineis: "NOW, UniTV, SmartOne, AppAcesso e Central",
  },
};

const LIMITE_BAIXO_USD = 1; // abaixo disso avisa que está acabando
const REPETIR_ZERADO_MS = 3 * 60 * 60 * 1000; // zerado: lembra de novo a cada 3h no máximo
const REPETIR_BAIXO_MS = 20 * 60 * 60 * 1000; // baixo: 1 aviso por dia (20h de folga pro atraso do setInterval)
const INTERVALO_MS = 24 * 60 * 60 * 1000; // monitor de saldo: 1x por dia (+ 1x no boot) — US$ 1 dá ~12 dias de folga no 2captcha

// Dedup em memória (processo único persistente no Easypanel, ver instrumentation.ts).
// Reinício do container pode repetir 1 aviso — aceitável.
const ultimoAviso: Record<ServicoCaptcha, { zerado?: number; baixo?: number }> = { "2captcha": {}, capsolver: {} };

export function ehErroSaldoZerado(resp: { errorCode?: string } | null | undefined): boolean {
  return resp?.errorCode === "ERROR_ZERO_BALANCE";
}

async function enviarTelegram(servico: ServicoCaptcha, texto: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID_JONAS;
  if (!botToken || !chatId) {
    console.error("[aviso-captcha] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID_JONAS não configurados");
    return;
  }
  const s = SERVICOS[servico];
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: `Recarregar ${s.nome}`, url: s.urlRecarga }]] },
      }),
    });
    if (!res.ok) console.error(`[aviso-captcha] Telegram ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    console.error("[aviso-captcha] falha ao enviar Telegram:", err instanceof Error ? err.message : err);
  }
}

// Chamado pelos adapters ao receber ERROR_ZERO_BALANCE no createTask, e pelo monitor.
export async function avisarSaldoZerado(servico: ServicoCaptcha): Promise<void> {
  const agora = Date.now();
  const ultimo = ultimoAviso[servico];
  if (ultimo.zerado && agora - ultimo.zerado < REPETIR_ZERADO_MS) return;
  ultimo.zerado = agora;
  const s = SERVICOS[servico];
  console.error(`[aviso-captcha] saldo do ${s.nome} zerado — avisando no Telegram`);
  await enviarTelegram(
    servico,
    `🚨 <b>Saldo do ${s.nome} acabou</b>\n\n` +
    `O login automático de ${s.paineis} não funciona sem ele (captcha). ` +
    "Recarregue o saldo — as sessões voltam na próxima tentativa, ou pelo botão Renovar Sessão em /conexoes."
  );
}

export async function consultarSaldoCaptcha(servico: ServicoCaptcha): Promise<number | null> {
  const s = SERVICOS[servico];
  const apiKey = process.env[s.envKey];
  if (!apiKey) return null;
  try {
    const resp = await fetch(s.urlSaldo, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey }),
    }).then(r => r.json()) as { errorId?: number; errorCode?: string; balance?: number };
    if (resp.errorId || typeof resp.balance !== "number") return null;
    return resp.balance;
  } catch {
    return null;
  }
}

async function verificarSaldo(servico: ServicoCaptcha): Promise<void> {
  const saldo = await consultarSaldoCaptcha(servico);
  if (saldo === null) return;

  if (saldo <= 0) {
    await avisarSaldoZerado(servico);
    return;
  }
  const ultimo = ultimoAviso[servico];
  if (saldo >= LIMITE_BAIXO_USD) {
    // Recarregado: zera o dedup pra avisar de novo na próxima vez que cair
    delete ultimo.zerado;
    delete ultimo.baixo;
    return;
  }

  const agora = Date.now();
  if (ultimo.baixo && agora - ultimo.baixo < REPETIR_BAIXO_MS) return;
  ultimo.baixo = agora;
  const s = SERVICOS[servico];
  await enviarTelegram(
    servico,
    `⚠️ <b>Saldo do ${s.nome} baixo: US$ ${saldo.toFixed(2)}</b>\n\n` +
    `Quando zerar, o login automático de ${s.paineis} para de funcionar. Vale recarregar.`
  );
}

// 1 request barato por serviço — não toca em sessão de painel nenhum.
export async function verificarSaldosCaptcha(): Promise<void> {
  await Promise.all((Object.keys(SERVICOS) as ServicoCaptcha[]).map(s => verificarSaldo(s).catch(() => {})));
}

export function iniciarMonitorSaldoCaptcha() {
  verificarSaldosCaptcha().catch(() => {});
  setInterval(() => { verificarSaldosCaptcha().catch(() => {}); }, INTERVALO_MS);
}
