// Robô do navegador — POP Player (popplayer.pro). Roda dentro da página do POP: as chamadas ao site saem
// da própria página (mesma origem, cookies e liberação do Cloudflare do navegador), igual a uma pessoa usando.
// Pede tarefas ao js-painel pela parte de fundo (background.js) e devolve o resultado.
//
// Telas (capturadas em 15/10/2026):
//   index.php            login: username, password (fora da proteção do Cloudflare)
//   users.php            "Meus Usuários": uma linha por LISTA (checkbox value=id, cliente, MAC); ?search=&per_page=
//   users_create.php     form: key (oculto), mac_address, client_name, title, url, expire_date (2050-01-01)
//   users_update.php?update=ID   mesmos campos + id
//   users.php?...&delete=ID      apaga a linha

(() => {
  if (window.top !== window) return;
  const desafio = /um momento|just a moment/i.test(document.title);
  if (desafio) return; // o próprio navegador resolve e recarrega; o vigia recarrega se travar

  const BASE = "https://popplayer.pro/meuplayer/";
  let credenciais = null;
  // Estado no título da aba: dá pra ver de fora (`xdotool getwindowname`, foto da tela virtual).
  const tituloOriginal = document.title;
  const estado = (s) => { document.title = `[robô: ${s}] ${tituloOriginal}`; };

  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const texto = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const html = (s) => new DOMParser().parseFromString(s, "text/html");

  function normalizarMac(mac) {
    const hex = String(mac ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
    if (hex.length !== 12) throw new Error(`MAC inválido: ${mac}`);
    return hex.match(/../g).join(":");
  }

  async function obter(caminho) {
    const r = await fetch(BASE + caminho, { credentials: "include" });
    if (r.status === 403) throw new Error("O Cloudflare do POP pediu verificação de novo. O robô vai recarregar a página; tente em 1 minuto.");
    return { url: r.url, doc: html(await r.text()) };
  }

  const ehLogin = (p) => /index\.php/.test(p.url) || !!p.doc.querySelector('form input[name="password"]:not([type="hidden"])');

  /** Envia o formulário da página como o navegador enviaria, trocando só os campos informados. */
  async function enviarFormulario(pagina, caminhoPagina, campos) {
    const alvo = Object.keys(campos)[0];
    const form = [...pagina.doc.querySelectorAll("form")].find((f) => f.querySelector(`[name="${alvo}"]`));
    if (!form) throw new Error(`Formulário com o campo "${alvo}" não encontrado em ${caminhoPagina}.`);
    const dados = new URLSearchParams();
    for (const el of form.querySelectorAll("input[name], select[name], textarea[name]")) {
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      if (el.type === "submit") continue;
      dados.set(el.name, el.value ?? "");
    }
    const botao = form.querySelector('button[type="submit"][name], input[type="submit"][name]');
    if (botao) dados.set(botao.name, botao.value ?? "");
    for (const [k, v] of Object.entries(campos)) if (v != null) dados.set(k, v);
    const acao = new URL(form.getAttribute("action") || caminhoPagina, BASE + caminhoPagina).href;
    const r = await fetch(acao, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: dados.toString(),
    });
    if (r.status === 403) throw new Error("O Cloudflare do POP recusou o envio. Tente de novo em 1 minuto.");
    return { url: r.url, doc: html(await r.text()) };
  }

  function alertaDaPagina(doc) {
    return [...doc.querySelectorAll(".alert, .alert-danger, .invalid-feedback, .text-danger")]
      .map(texto).filter(Boolean)[0] ?? null;
  }

  async function garantirSessao() {
    const teste = await obter("users.php?per_page=1");
    if (!ehLogin(teste)) return;
    if (!credenciais?.usuario || !credenciais?.senha) {
      throw new Error("O POP Player não tem usuário e senha cadastrados no js-painel (Conexões → POP Player → Editar).");
    }
    const login = await obter("index.php");
    const r = await enviarFormulario(login, "index.php", { username: credenciais.usuario, password: credenciais.senha });
    if (ehLogin(r)) throw new Error(`Login no POP recusado${alertaDaPagina(r.doc) ? `: ${alertaDaPagina(r.doc)}` : ""}. Confira usuário e senha em Conexões.`);
  }

  /** Linhas de "Meus Usuários" (uma por lista). */
  function linhas(doc) {
    return [...doc.querySelectorAll("tbody tr")].map((tr) => {
      const id = Number(tr.querySelector('input.user-checkbox')?.value);
      const tds = tr.querySelectorAll("td");
      return { id, cliente: texto(tds[1]), mac: texto(tds[2]).toUpperCase() };
    }).filter((l) => l.id);
  }

  async function detalhe(id) {
    const p = await obter(`users_update.php?update=${id}`);
    const v = (n) => p.doc.querySelector(`[name="${n}"]`)?.value ?? "";
    if (!v("mac_address")) throw new Error(`Lista ${id} não encontrada no POP.`);
    return { id, mac: v("mac_address").toUpperCase(), cliente: v("client_name"), nome: v("title"), url: v("url"), validade: v("expire_date") || null, pagina: p };
  }

  async function listasDoMac(mac) {
    const alvo = normalizarMac(mac);
    const p = await obter(`users.php?per_page=100&search=${encodeURIComponent(alvo)}`);
    const ids = linhas(p.doc).filter((l) => l.mac === alvo).map((l) => l.id);
    const out = [];
    for (const id of ids) {
      const { pagina, ...d } = await detalhe(id);
      out.push(d);
    }
    return out.sort((a, b) => a.id - b.id);
  }

  async function ajaxMigrador(campos) {
    const r = await fetch(BASE + "migrardns.php", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" },
      body: new URLSearchParams(campos).toString(),
    });
    if (r.status === 403) throw new Error("O Cloudflare do POP pediu verificação de novo. O robô vai recarregar a página; tente em 1 minuto.");
    const t = await r.text();
    try { return JSON.parse(t); } catch { throw new Error(`Resposta inesperada do Migrador de DNS: ${t.replace(/\s+/g, " ").slice(0, 120)}`); }
  }

  const acoes = {
    // Migrador de DNS (migrardns.php): a própria página envia por AJAX — POST com ajax=true, dns_atual (um dos
    // endereços em uso, como o site lista: "http://host[:porta]") e dns_nova; responde {status: success|warning}.
    async listar_dns() {
      return ajaxMigrador({ listar_dns: "true" });
    },

    async migrar_dns({ de, para }) {
      if (!de || !para) throw new Error("Informe o endereço atual e o novo.");
      const emUso = await ajaxMigrador({ listar_dns: "true" });
      if (!Array.isArray(emUso) || !emUso.includes(de)) throw new Error(`O endereço ${de} não está em uso no POP.`);
      // Quantas listas usam o endereço (o POP não informa): conta antes, pela URL de cada lista
      const prefixo = de.toLowerCase();
      const listas = (await acoes.listar_todos()).filter((l) => {
        const u = l.url.toLowerCase();
        return u.startsWith(prefixo) && ["/", ":", "?", ""].includes(u.charAt(prefixo.length));
      }).length;
      const r = await ajaxMigrador({ ajax: "true", dns_atual: de, dns_nova: para });
      if (r?.status !== "success") throw new Error(r?.message || (r?.status === "warning" ? "Endereços iguais: nada mudou." : "O POP recusou a migração."));
      return { de, para, listas, em_uso_depois: await ajaxMigrador({ listar_dns: "true" }) };
    },

    /** Todas as listas do POP com o link (uma consulta por lista: ~70 listas levam uns 20 s). */
    async listar_todos() {
      const ids = [];
      for (let pagina = 1; pagina <= 50; pagina++) {
        const p = await obter(`users.php?page=${pagina}&per_page=100`);
        const novas = linhas(p.doc).filter((l) => !ids.includes(l.id));
        if (!novas.length) break;
        ids.push(...novas.map((l) => l.id));
      }
      const out = [];
      for (const id of ids) {
        const { pagina, ...d } = await detalhe(id);
        out.push(d);
      }
      return out;
    },

    async listas_do_mac({ mac }) {
      return listasDoMac(mac);
    },

    async criar({ mac, cliente, nome, url }) {
      if (!url) throw new Error("Informe o link da lista.");
      const m = normalizarMac(mac);
      const antes = new Set((await listasDoMac(m)).map((l) => l.id));
      const pagina = await obter("users_create.php");
      const r = await enviarFormulario(pagina, "users_create.php", {
        mac_address: m, client_name: cliente || nome || "", title: nome || "Lista", url,
      });
      const depois = await listasDoMac(m);
      if (!depois.some((l) => !antes.has(l.id))) {
        throw new Error(`O POP não criou a lista${alertaDaPagina(r.doc) ? `: ${alertaDaPagina(r.doc)}` : "."}`);
      }
      return depois;
    },

    async editar({ id, mac, nome, url }) {
      const atual = await detalhe(id);
      if (atual.mac !== normalizarMac(mac)) throw new Error(`A lista ${id} do POP é de outro MAC (${atual.mac}).`);
      const r = await enviarFormulario(atual.pagina, `users_update.php?update=${id}`, {
        mac_address: atual.mac, title: nome ?? atual.nome, url: url ?? atual.url,
      });
      const conferida = await detalhe(id);
      if ((nome != null && conferida.nome !== nome) || (url != null && conferida.url !== url)) {
        throw new Error(`O POP não gravou a alteração${alertaDaPagina(r.doc) ? `: ${alertaDaPagina(r.doc)}` : "."}`);
      }
      return listasDoMac(atual.mac);
    },

    async apagar({ id, mac }) {
      const atual = await detalhe(id);
      if (atual.mac !== normalizarMac(mac)) throw new Error(`A lista ${id} do POP é de outro MAC (${atual.mac}).`);
      await obter(`users.php?page=1&per_page=25&delete=${id}`);
      const depois = await listasDoMac(atual.mac);
      if (depois.some((l) => l.id === id)) throw new Error("O POP não apagou a lista.");
      return depois;
    },
  };

  async function executar(tarefa) {
    const fn = acoes[tarefa.acao];
    if (!fn) throw new Error(`Ação desconhecida: ${tarefa.acao}`);
    await garantirSessao();
    return fn(tarefa.params ?? {});
  }

  async function ciclo() {
    while (true) {
      let resp;
      try {
        resp = await chrome.runtime.sendMessage({ tipo: "proxima", alvos: ["popplayer"] });
      } catch (e) {
        resp = { ok: false, erro: String(e) };
      }
      if (resp?.parar) { estado("outra aba trabalhando"); return; }
      if (!resp?.ok || !resp.tarefa) {
        if (!resp?.ok) { estado(`sem contato com o js-painel — ${resp?.erro ?? "?"}`); await pausa(5000); }
        else estado(`aguardando ${new Date().toLocaleTimeString("pt-BR")}`);
        continue;
      }
      estado(`executando ${resp.tarefa.acao}`);
      credenciais = resp.credenciais;
      const t = resp.tarefa;
      let resultado;
      try {
        resultado = { id: t.id, ok: true, resultado: await executar(t) };
      } catch (e) {
        resultado = { id: t.id, ok: false, erro: e instanceof Error ? e.message : String(e) };
      }
      await chrome.runtime.sendMessage({ tipo: "resultado", resultado }).catch(() => {});
      if (!resultado.ok && /Cloudflare/.test(resultado.erro)) { location.reload(); return; }
    }
  }

  ciclo();
})();
