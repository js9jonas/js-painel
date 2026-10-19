// Robô do navegador — FAST (painelcliente.com). "Adicionar dias ao vencimento" só existe no site (botão .btday em
// /clients → POST ./API.php {action:'change_day', client_id, day, token:<csrf>}), não na API pública com token
// (renew_client só aceita month). Capturado 17/10/2026 no código do site; 1º uso: Jadir 03b6uhi8, +19 dias.
// Regras do site: 1 a 30 dias por vez, conta precisa estar ativa, custo = dias × telas (1 crédito = 30 dias).
// O js-painel calcula os dias e confere antes/depois pela API pública; aqui só a chamada de dentro da página.

(() => {
  if (window.top !== window) return;
  if (/um momento|just a moment/i.test(document.title)) return;

  const tituloOriginal = document.title;
  const estado = (s) => { document.title = `[robô: ${s}] ${tituloOriginal}`; };
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const naTelaDeLogin = () => !!document.querySelector("#submitBtn") && !!document.querySelector('input[name="username"]');
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";

  // Login que falhou (senha errada, Turnstile pediu interação): espera 10 min antes de tentar de novo — o site
  // bloqueia o acesso por um tempo depois de várias tentativas erradas (lg-blocked-timer).
  // A 1ª falha espera só 1 min (página reaberta sem rede ao ligar o PC, token velho "Sua sessão expirou" — 19/10/2026);
  // nova tentativa sempre numa página recarregada.
  const ESPERA_LOGIN = "robo-fast-proximo-login";
  const FALHAS_LOGIN = "robo-fast-falhas-login";
  const esperarLogin = () => {
    const falhas = Number(sessionStorage.getItem(FALHAS_LOGIN) || 0) + 1;
    sessionStorage.setItem(FALHAS_LOGIN, String(falhas));
    sessionStorage.setItem(ESPERA_LOGIN, String(Date.now() + (falhas === 1 ? 60_000 : 10 * 60_000)));
  };
  async function entrar(cred) {
    if (!cred?.usuario || !cred?.senha) { estado("sem usuário/senha da FAST no js-painel"); return; }
    if (document.getElementById("lg-blocked-timer")) { estado("LOGIN BLOQUEADO pelo site (tentativas demais) — aguardando"); return; }
    const proximo = Number(sessionStorage.getItem(ESPERA_LOGIN) || 0);
    if (Date.now() < proximo) { estado("login não entrou da última vez — esperando para tentar de novo"); return; }
    if (proximo) { sessionStorage.removeItem(ESPERA_LOGIN); location.reload(); return new Promise(() => {}); }
    const usuario = document.querySelector('input[name="username"]');
    const senha = document.querySelector('input[name="password"]');
    if (!usuario || !senha) { estado("login: campos não encontrados"); return; }
    estado("entrando");
    usuario.value = cred.usuario;
    senha.value = cred.senha;
    for (let i = 0; i < 40; i++) {
      const botao = document.getElementById("submitBtn");
      if (botao && !botao.disabled) {
        esperarLogin();
        botao.click();
        return;
      }
      await pausa(1000);
    }
    esperarLogin();
    estado("login: o botão Entrar não liberou (Turnstile pediu interação?) — precisa de alguém");
  }

  class SessaoVencida extends Error {}

  /** Chamada ao API.php do site com o token da página — igual ao apiPost do painel-api.js. */
  async function apiSite(params) {
    const token = csrf();
    if (!token) throw new SessaoVencida();
    const r = await fetch("./API.php", {
      method: "POST",
      body: new URLSearchParams({ ...params, token }),
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* sem JSON: sessão caiu e o site devolveu a tela de login */ }
    if (!json) throw new SessaoVencida();
    return json;
  }

  const acoes = {
    /** Adiciona `dias` (1–30) ao vencimento. Resposta do site: {result:"success", credits:"435,24"} (centavos = dias guardados). */
    async adicionar_dias({ client_id, dias }) {
      const d = Number(dias);
      if (!client_id) throw new Error("Informe o client_id da conta.");
      if (!Number.isInteger(d) || d < 1 || d > 30) throw new Error("Quantidade de dias inválida (1 a 30).");
      const r = await apiSite({ action: "change_day", client_id: String(client_id), day: String(d) });
      if (r.result !== "success") throw new Error(`A FAST recusou adicionar os dias${r.mens || r.message ? `: ${r.mens || r.message}` : "."}`);
      return { creditos: r.credits ?? null };
    },
  };

  // Sessão PHP parada cai: enquanto espera pedidos, recarrega a própria página a cada 10 min (vigia do background
  // recarrega se o ciclo parar).
  let ultimoToque = Date.now();
  async function manterSessaoViva() {
    if (Date.now() - ultimoToque < 10 * 60_000) return;
    ultimoToque = Date.now();
    try {
      const r = await fetch(location.href, { credentials: "same-origin" });
      const html = await r.text();
      if (!/csrf-token/.test(html)) location.reload();
    } catch { /* sem rede: tenta no próximo */ }
  }

  async function executar(t) {
    ultimoToque = Date.now();
    estado(`executando ${t.acao}`);
    let resultado;
    try {
      const fn = acoes[t.acao];
      if (!fn) throw new Error(`Ação desconhecida: ${t.acao}`);
      resultado = { id: t.id, ok: true, resultado: await fn(t.params ?? {}) };
    } catch (e) {
      resultado = { id: t.id, ok: false, erro: e instanceof SessaoVencida ? "A FAST não está logada no robô (sessão caiu). Ele entra de novo sozinho; tente em 1 minuto." : e instanceof Error ? e.message : String(e) };
      if (e instanceof SessaoVencida) { await chrome.runtime.sendMessage({ tipo: "resultado", resultado }).catch(() => {}); location.reload(); return new Promise(() => {}); }
    }
    await chrome.runtime.sendMessage({ tipo: "resultado", resultado }).catch(() => {});
  }

  async function ciclo() {
    while (true) {
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({ tipo: "proxima", alvos: ["fast"], sem_tarefa: naTelaDeLogin() });
      } catch (e) {
        resp = { ok: false, erro: String(e) };
      }
      if (resp?.parar) { estado("outra aba trabalhando"); return; }
      if (/context invalidated/i.test(resp?.erro ?? "")) { location.reload(); return; }
      if (!resp?.ok) { estado(`sem contato com o js-painel — ${resp?.erro ?? "?"}`); await pausa(5000); continue; }
      if (naTelaDeLogin()) { await entrar(resp.credenciais); await pausa(5000); continue; }
      sessionStorage.removeItem(ESPERA_LOGIN);
      sessionStorage.removeItem(FALHAS_LOGIN);
      if (!resp.tarefa) {
        await manterSessaoViva();
        estado(`aguardando ${new Date().toLocaleTimeString("pt-BR")}`);
        continue;
      }
      await executar(resp.tarefa);
    }
  }

  ciclo();
})();
