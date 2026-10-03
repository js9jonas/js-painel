// Aviso no Telegram quando o saldo do 2captcha (usado no login do CLUB — hCaptcha) acaba ou
// fica baixo. Motivação: em 03/10/2026 o saldo zerou e o CLUB parou de conectar em /conexoes
// sem nenhum aviso — Jonas só percebeu porque o card não conectava mais.
// Doc oficial: https://2captcha.com/api-docs/get-balance e /api-docs/error-codes
// (ERROR_ZERO_BALANCE = errorId 10).

const LIMITE_BAIXO_USD = 1; // abaixo disso avisa que está acabando
const REPETIR_ZERADO_MS = 3 * 60 * 60 * 1000; // zerado: lembra de novo a cada 3h no máximo
const REPETIR_BAIXO_MS = 24 * 60 * 60 * 1000; // baixo: no máximo 1 aviso por dia

// Dedup em memória (processo único persistente no Easypanel, ver instrumentation.ts).
// Reinício do container pode repetir 1 aviso — aceitável.
const ultimoAviso: { zerado?: number; baixo?: number } = {};

export function ehErroSaldoZerado(resp: { errorId?: number; errorCode?: string }): boolean {
  return resp.errorCode === "ERROR_ZERO_BALANCE" || resp.errorId === 10;
}

async function enviarTelegram(texto: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID_JONAS;
  if (!botToken || !chatId) {
    console.error("[aviso-2captcha] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID_JONAS não configurados");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "Recarregar 2captcha", url: "https://2captcha.com/pay" }]] },
      }),
    });
    if (!res.ok) console.error(`[aviso-2captcha] Telegram ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    console.error("[aviso-2captcha] falha ao enviar Telegram:", err instanceof Error ? err.message : err);
  }
}

export async function avisarSaldoZerado2captcha(): Promise<void> {
  const agora = Date.now();
  if (ultimoAviso.zerado && agora - ultimoAviso.zerado < REPETIR_ZERADO_MS) return;
  ultimoAviso.zerado = agora;
  console.error("[aviso-2captcha] saldo do 2captcha zerado — avisando no Telegram");
  await enviarTelegram(
    "🚨 <b>Saldo do 2captcha acabou</b>\n\n" +
    "O CLUB não consegue mais renovar a sessão (o login exige hCaptcha). " +
    "Recarregue o saldo — a sessão volta sozinha em até 10 min, ou pelo botão Renovar Sessão em /conexoes."
  );
}

export async function consultarSaldo2captcha(): Promise<number | null> {
  const apiKey = process.env.TWOCAPTCHA_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://api.2captcha.com/getBalance", {
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

// Chamado periodicamente pelo club-keepalive (1 request barato, não toca na sessão do CLUB).
export async function verificarSaldo2captcha(): Promise<void> {
  const saldo = await consultarSaldo2captcha();
  if (saldo === null) return;

  if (saldo <= 0) {
    await avisarSaldoZerado2captcha();
    return;
  }
  if (saldo >= LIMITE_BAIXO_USD) {
    // Recarregado: zera o dedup pra avisar de novo na próxima vez que cair
    delete ultimoAviso.zerado;
    delete ultimoAviso.baixo;
    return;
  }

  const agora = Date.now();
  if (ultimoAviso.baixo && agora - ultimoAviso.baixo < REPETIR_BAIXO_MS) return;
  ultimoAviso.baixo = agora;
  await enviarTelegram(
    `⚠️ <b>Saldo do 2captcha baixo: US$ ${saldo.toFixed(2)}</b>\n\n` +
    "Quando zerar, o CLUB para de renovar a sessão em /conexoes. Vale recarregar."
  );
}
