// Robô do navegador — Central (painel.fun / API api.controle.fit). A renovação só é aceita quando parte de uma
// página aberta num navegador de verdade (403 "sessao_nao_renderizada" pela API direta, ver
// docs/memoria/incident_central_sessao_nao_renderizada.md). O registro das chamadas da página fica em
// central-pagina.js (mundo da página); aqui ficam login, estado e as ações.
//
// Token da página vale ~55 min; vencido, a Central manda para a tela de bloqueio (/lock: senha + Turnstile). O robô
// digita a senha e só clica em Desbloquear quando o Turnstile libera o botão sozinho (igual ao login e ao cron
// central_refresh_token.js). Se aparecer a caixa "Confirme que é humano", o robô NÃO tenta marcar — avisa e espera alguém.

(() => {
  if (window.top !== window) return;
  if (/um momento|just a moment/i.test(document.title)) return;

  const tituloOriginal = document.title;
  let credenciais = null;
  const estado = (s) => { document.title = `[robô: ${s}] ${tituloOriginal}`; };
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const caminho = () => location.pathname;
  const naTelaDeLogin = () => /^\/login/.test(caminho());
  const naTelaDeBloqueio = () => /^\/(lock|block)/.test(caminho());

  function tokenDaSessao() {
    for (const k of Object.keys(localStorage)) {
      try {
        const v = JSON.parse(localStorage.getItem(k));
        const t = v?.token || v?.access_token || v?.state?.token || v?.state?.access_token;
        if (typeof t === "string" && t.startsWith("eyJ")) return t;
      } catch { /* valor que não é JSON */ }
    }
    return null;
  }

  function registroDaPagina() {
    return new Promise((resolve) => {
      const ouvir = (ev) => {
        if (ev.source !== window || ev.data?.tipo !== "robo-central-registro") return;
        window.removeEventListener("message", ouvir);
        resolve(ev.data.registro);
      };
      window.addEventListener("message", ouvir);
      window.postMessage({ tipo: "robo-central-pedir-registro" }, "*");
      setTimeout(() => { window.removeEventListener("message", ouvir); resolve(null); }, 2000);
    });
  }

  // Campo controlado pelo React: precisa do setter nativo + evento "input" para o estado do formulário mudar
  function preencher(el, valor) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Tela de bloqueio: senha + Desbloquear quando o Turnstile liberar. Botão que não libera (caixa interativa) → espera
   * 10 min antes de tentar de novo, para não repetir idas ao desafio (eleva o rigor do Cloudflare).
   */
  let proximoDesbloqueio = 0;
  async function desbloquear(cred) {
    if (Date.now() < proximoDesbloqueio) { estado("TELA DE BLOQUEIO — a verificação pediu interação, precisa de alguém"); return; }
    if (!cred?.senha) { estado("TELA DE BLOQUEIO — sem senha da Central no js-painel"); return; }
    const senha = document.querySelector('input[type="password"], input[name="password"]');
    if (!senha) { estado("tela de bloqueio: campo de senha não encontrado"); return; }
    estado("desbloqueando");
    preencher(senha, cred.senha);
    const botao = () => [...document.querySelectorAll("button")].find((b) => b.type === "submit" || /desbloquear/i.test(b.textContent));
    for (let i = 0; i < 40; i++) {
      const b = botao();
      if (b && !b.disabled) { b.click(); await pausa(5000); return; }
      await pausa(1000);
    }
    proximoDesbloqueio = Date.now() + 10 * 60_000;
    estado("TELA DE BLOQUEIO — a verificação pediu interação, precisa de alguém");
  }

  /** Tela de login: preenche e envia quando o Turnstile liberar o botão (em Chrome comum ele passa sozinho). */
  async function entrar(cred) {
    if (!cred?.usuario || !cred?.senha) { estado("sem usuário/senha da Central no js-painel"); return; }
    const usuario = document.querySelector('input[name="username"], input[name="usuario"], input[type="text"]');
    const senha = document.querySelector('input[name="password"], input[type="password"]');
    if (!usuario || !senha) { estado("login: campos não encontrados"); return; }
    estado("entrando");
    preencher(usuario, cred.usuario);
    preencher(senha, cred.senha);
    for (let i = 0; i < 40; i++) {
      const botao = document.querySelector('button[type="submit"]');
      if (botao && !botao.disabled) { botao.click(); return; }
      await pausa(1000);
    }
    estado("login: o botão Entrar não liberou (Turnstile pediu interação?)");
  }

  const API = "https://api.controle.fit/api";

  // 401 = token da página vencido: recarregar leva a página à tela de bloqueio, que o robô desbloqueia.
  class SessaoVencida extends Error {}
  const PENDENTE = "robo-central-pendente";
  function recarregarPorSessao(tarefa) {
    if (tarefa) sessionStorage.setItem(PENDENTE, JSON.stringify({ tarefa, desde: Date.now() }));
    estado("sessão vencida — recarregando para desbloquear");
    location.reload();
    return new Promise(() => {}); // segura o ciclo: nenhuma tarefa nova até a página recarregar
  }
  /** Tarefa que pegou 401 e esperou o desbloqueio. Velha demais (o js-painel desiste em 3 min) → descarta. */
  function tarefaPendente() {
    try {
      const p = JSON.parse(sessionStorage.getItem(PENDENTE) || "null");
      sessionStorage.removeItem(PENDENTE);
      return p && Date.now() - p.desde < 2 * 60_000 ? p.tarefa : null;
    } catch { return null; }
  }
  const jaRetentada = new Set();

  /** Chamada à API de dentro da página, com o token da sessão — igual à própria tela faz (accept + authorization). */
  async function api(caminho, opcoes = {}) {
    const token = tokenDaSessao();
    if (!token) throw new Error("A Central não está logada no robô (sem token na página).");
    const r = await fetch(`${API}/${caminho}`, {
      ...opcoes,
      headers: { accept: "application/json", authorization: `Bearer ${token}`, ...(opcoes.body ? { "content-type": "application/json" } : {}) },
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* resposta sem JSON */ }
    if (r.status === 401) throw new SessaoVencida();
    if (!r.ok) throw new Error(`Central ${caminho.split("?")[0]} → ${r.status}${json?.message ? `: ${json.message}` : ""}`);
    return json;
  }

  // As respostas de conta trazem a senha do cliente: as ações devolvem só os campos necessários.

  const acoes = {
    /** Planos de cliente (a renovação manda plan_id + amount do plano de 1 mês). */
    async planos() {
      return api("payments/plans?audience=client");
    },

    /**
     * Renova 1 mês exatamente como a tela (capturado 15/10/2026, conta u5t64o): GET payments/plans?audience=client e
     * POST users/{id}/renew {"mounth":1,"plan_id":<Mensal>,"amount":<valor>}. Gasta 1 crédito.
     * Já vale por mais de 25 dias (toque duplo, aba velha, pago antes): não renova, só devolve o vencimento.
     */
    async renovar({ usuario }) {
      if (!usuario) throw new Error("Informe o usuário da conta.");
      const revenda = credenciais?.usuario;
      if (!revenda) throw new Error("Sem o usuário da revenda Central no js-painel.");
      let conta = null;
      for (let pagina = 1; pagina <= 60 && !conta; pagina++) {
        const lista = (await api(`users?page=${pagina}&per=100&reseller=${encodeURIComponent(revenda)}`))?.data ?? [];
        conta = lista.find((u) => u.username === usuario) ?? null;
        if (lista.length < 100) break;
      }
      if (!conta) throw new Error(`Conta "${usuario}" não encontrada na Central.`);
      const data = (ts) => (ts ? new Date(Number(ts) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : null);
      const antes = data(conta.exp_date);
      if (Number(conta.exp_date) * 1000 > Date.now() + 25 * 86_400_000) {
        return { usuario, id: conta.id, ja_renovado: true, vencimento: antes, antes };
      }
      const planos = (await api("payments/plans?audience=client"))?.data ?? [];
      const mensal = planos.find((p) => p.is_active && Number(p.duration_days) === 30);
      if (!mensal) throw new Error("Plano mensal (30 dias) não encontrado na Central.");
      const r = await api(`users/${conta.id}/renew`, {
        method: "POST",
        body: JSON.stringify({ mounth: 1, plan_id: mensal.id, amount: Number(mensal.amount) }),
      });
      const depois = data(r?.exp_date);
      if (!depois || depois === antes) throw new Error("A Central respondeu, mas o vencimento não mudou. Confira no painel antes de tentar de novo.");
      return { usuario, id: conta.id, ja_renovado: false, vencimento: depois, antes };
    },

    /** Só leitura: vencimento atual da conta (para conferir sem renovar). */
    async conta({ usuario }) {
      const revenda = credenciais?.usuario;
      for (let pagina = 1; pagina <= 60; pagina++) {
        const lista = (await api(`users?page=${pagina}&per=100&reseller=${encodeURIComponent(revenda)}`))?.data ?? [];
        const c = lista.find((u) => u.username === usuario);
        if (c) return { id: c.id, usuario: c.username, nome: c.full_name, vencimento: new Date(Number(c.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }), ativa: !!c.enabled };
        if (lista.length < 100) break;
      }
      throw new Error(`Conta "${usuario}" não encontrada na Central.`);
    },

    // Etapa 1 (15/10/2026), só leitura: estado da sessão e as chamadas que a própria página faz à API.
    async inspecionar() {
      return {
        caminho: caminho(),
        titulo: tituloOriginal,
        logado: !!tokenDaSessao(),
        bloqueio: naTelaDeBloqueio(),
        chaves_localstorage: Object.keys(localStorage),
        cookies_nomes: document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter(Boolean),
        registro: await registroDaPagina(),
        botoes: [...document.querySelectorAll("button")].map((b) => b.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30),
      };
    },
  };

  // Sessão parada tranca na tela de bloqueio (às vezes com a caixa "Confirme que é humano"): enquanto espera
  // pedidos, o robô faz a mesma leitura leve que a tela faz ao abrir (profile) a cada 4 min.
  let ultimoToque = Date.now();
  async function manterSessaoViva() {
    if (Date.now() - ultimoToque < 4 * 60_000 || naTelaDeLogin() || naTelaDeBloqueio() || !tokenDaSessao()) return;
    ultimoToque = Date.now();
    try { await api("profile"); } catch (e) {
      if (e instanceof SessaoVencida) return recarregarPorSessao(null);
      estado(`toque na sessão falhou — ${e instanceof Error ? e.message : e}`);
    }
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
      // 401 antes de qualquer mudança (a Central recusou a chamada): desbloqueia e repete 1 vez
      if (e instanceof SessaoVencida && !jaRetentada.has(t.id)) { jaRetentada.add(t.id); return recarregarPorSessao(t); }
      resultado = { id: t.id, ok: false, erro: e instanceof SessaoVencida ? "Sessão da Central vencida no robô (tela de bloqueio)." : e instanceof Error ? e.message : String(e) };
    }
    await chrome.runtime.sendMessage({ tipo: "resultado", resultado }).catch(() => {});
  }

  async function ciclo() {
    while (true) {
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({ tipo: "proxima", alvos: ["central"], sem_tarefa: naTelaDeLogin() || naTelaDeBloqueio() });
      } catch (e) {
        resp = { ok: false, erro: String(e) };
      }
      if (resp?.parar) { estado("outra aba trabalhando"); return; }
      if (/context invalidated/i.test(resp?.erro ?? "")) { location.reload(); return; }
      if (!resp?.ok) { estado(`sem contato com o js-painel — ${resp?.erro ?? "?"}`); await pausa(5000); continue; }
      if (resp.credenciais) credenciais = resp.credenciais;
      if (naTelaDeLogin()) { await entrar(resp.credenciais); await pausa(5000); continue; }
      if (naTelaDeBloqueio()) { await desbloquear(resp.credenciais ?? credenciais); await pausa(5000); continue; }
      if (pendente && tokenDaSessao()) { const t = pendente; pendente = null; jaRetentada.add(t.id); await executar(t); }
      if (!resp.tarefa) {
        await manterSessaoViva();
        if (!naTelaDeBloqueio() && !naTelaDeLogin()) estado(`aguardando ${new Date().toLocaleTimeString("pt-BR")}`);
        continue;
      }
      await executar(resp.tarefa);
    }
  }

  let pendente = tarefaPendente();

  ciclo();
})();
