// Robô do navegador — Duplecast (duplecast.com, revenda Blesta). Mesmo esquema do popplayer.js: as chamadas
// saem de dentro da página (mesma origem, cookies e liberação do Cloudflare do navegador).
// Fluxo capturado em 15/10/2026: docs/memoria/reference_duplecast_revenda.md.

(() => {
  if (window.top !== window) return;
  if (/um momento|just a moment/i.test(document.title)) return; // o navegador resolve e recarrega

  const BASE = "https://duplecast.com";
  let credenciais = null;
  const tituloOriginal = document.title;
  const estado = (s) => { document.title = `[robô: ${s}] ${tituloOriginal}`; };

  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const texto = (el) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const html = (s) => new DOMParser().parseFromString(s, "text/html");

  // Os redirecionamentos do Duplecast apontam para http:// — seguir pelo fetch vira "outra origem" e falha.
  // Por isso nada segue redirecionamento: a resposta só diz que houve um ("redirecionou") e quem chamou confere.
  async function obter(caminho) {
    const r = await fetch(BASE + caminho, { credentials: "include", redirect: "manual" });
    if (r.type === "opaqueredirect") return { url: BASE + caminho, redirecionou: true, doc: html("") };
    if (r.status === 403) throw new Error("O Cloudflare do Duplecast pediu verificação de novo. O robô vai recarregar a página; tente em 1 minuto.");
    return { url: r.url, redirecionou: false, doc: html(await r.text()) };
  }

  // Sem sessão o Blesta redireciona para o login; com o formulário de senha na tela também é login
  const ehLogin = (p) => p.redirecionou || /\/client\/login/.test(p.url) || !!p.doc.querySelector('form input[name="password"]:not([type="hidden"])');

  /** Envia o formulário da página como o navegador enviaria, trocando só os campos informados. */
  async function enviarFormulario(pagina, caminhoPagina, campos, extras = {}) {
    const alvo = Object.keys(campos)[0];
    const form = [...pagina.doc.querySelectorAll("form")].find((f) => f.querySelector(`[name="${alvo}"]`));
    if (!form) throw new Error(`Formulário com o campo "${alvo}" não encontrado em ${caminhoPagina}.`);
    const dados = new URLSearchParams();
    for (const el of form.querySelectorAll("input[name], select[name], textarea[name]")) {
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      if (el.type === "submit") continue;
      dados.set(el.name, el.value ?? "");
    }
    for (const [k, v] of Object.entries({ ...campos, ...extras })) if (v != null) dados.set(k, v);
    const acao = new URL(form.getAttribute("action") || caminhoPagina, BASE + caminhoPagina).href;
    const r = await fetch(acao, {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: dados.toString(),
    });
    // Sucesso no Blesta = redirecionamento (302); 200 = a página voltou com erro no formulário
    if (r.type === "opaqueredirect") return { url: acao, redirecionou: true, doc: html("") };
    if (r.status === 403) throw new Error("O Cloudflare do Duplecast recusou o envio. Tente de novo em 1 minuto.");
    return { url: r.url, redirecionou: false, doc: html(await r.text()) };
  }

  function alertas(doc) {
    return [...doc.querySelectorAll(".alert")].map((a) => texto(a).replace(/^×\s*/, "")).filter(Boolean);
  }

  async function garantirSessao() {
    const teste = await obter("/client/");
    if (!ehLogin(teste)) return;
    if (!credenciais?.usuario || !credenciais?.senha) {
      throw new Error("O Duplecast não tem usuário e senha cadastrados no js-painel (Conexões → Duplecast → Editar).");
    }
    const login = await obter("/client/login");
    const r = await enviarFormulario(login, "/client/login", { username: credenciais.usuario, password: credenciais.senha });
    if (!r.redirecionou || ehLogin(await obter("/client/"))) throw new Error(`Login no Duplecast recusado${alertas(r.doc)[0] ? `: ${alertas(r.doc)[0]}` : ""}. Confira usuário e senha em Conexões.`);
  }

  function resumoForm(doc) {
    return [...doc.querySelectorAll("form")].map((f) => ({
      action: f.getAttribute("action"), method: f.getAttribute("method"),
      campos: [...f.querySelectorAll("input,select,textarea,button")].filter((el) => el.name || el.type === "submit").map((el) => ({
        tag: el.tagName.toLowerCase(), type: el.type, name: el.name, value: el.type === "hidden" ? "(oculto)" : String(el.value ?? "").slice(0, 30),
        opcoes: el.tagName === "SELECT" ? [...el.options].map((o) => `${o.value}=${texto(o)}`).slice(0, 15) : undefined,
      })),
    }));
  }

  function resumoTabela(doc, n = 4) {
    const tabela = doc.querySelector("table");
    if (!tabela) return null;
    return {
      cabecalho: [...tabela.querySelectorAll("thead th")].map(texto),
      linhas: [...tabela.querySelectorAll("tbody tr")].slice(0, n).map((tr) => tr.outerHTML.replace(/\s+/g, " ").slice(0, 900)),
      total_linhas: tabela.querySelectorAll("tbody tr").length,
      paginas: [...doc.querySelectorAll(".pagination a")].map((a) => a.getAttribute("href")).filter(Boolean).slice(0, 6),
    };
  }

  const P = "/client/plugin/duplecast";
  const MESES = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

  /** "Oct 15, 2027" → "2027-10-15" (montado à mão, sem fuso). */
  function data(t) {
    const m = String(t ?? "").trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/);
    return m && MESES[m[1].toLowerCase()] ? `${m[3]}-${MESES[m[1].toLowerCase()]}-${m[2].padStart(2, "0")}` : null;
  }

  function normalizarMac(mac) {
    const hex = String(mac ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
    if (hex.length !== 12) throw new Error(`MAC inválido: ${mac}`);
    return hex.match(/../g).join(":");
  }

  /** Todas as páginas de uma listagem do Blesta (20 por página), linha a linha. */
  async function todasAsLinhas(caminho) {
    const out = [];
    for (let pagina = 1; pagina <= 100; pagina++) {
      const p = await obter(`${caminho}${pagina}/`);
      if (p.redirecionou) throw new Error("A sessão do Duplecast caiu no meio da leitura. Tente de novo.");
      const trs = [...p.doc.querySelectorAll("table tbody tr")];
      if (!trs.length) break;
      out.push(...trs);
      if (trs.length < 20) break;
    }
    return out;
  }

  /** Códigos de ativação: código, MAC, vencimento. */
  async function codigos() {
    return (await todasAsLinhas(`${P}/client_codes/index/all/`)).map((tr) => {
      const td = tr.querySelectorAll("td");
      return {
        codigo: texto(td[0]), mac: texto(td[1]).toUpperCase(), pacote: texto(td[2]),
        usado_em: data(texto(td[4])), expira: data(texto(td[5])),
        livre: !!tr.querySelector('a[href*="/client_codes/activate/"]'),
      };
    }).filter((c) => c.codigo);
  }

  function validadeDoMac(lista, mac) {
    return lista.filter((c) => c.mac === mac && c.expira).map((c) => c.expira).sort().pop() ?? null;
  }

  /** Playlists cadastradas pela revenda (as que o cliente pôs pelo site dele não aparecem aqui). */
  async function playlistsDoMac(mac) {
    const alvo = normalizarMac(mac);
    const linhas = (await todasAsLinhas(`${P}/client_playlist/index/all/`)).map((tr) => {
      const td = tr.querySelectorAll("td");
      const id = Number(tr.innerHTML.match(/client_playlist\/edit\/(\d+)\//)?.[1]);
      return { id, mac: texto(td[1]).toUpperCase(), acessada_em: data(texto(td[4])) };
    }).filter((l) => l.id && l.mac === alvo);
    const out = [];
    for (const l of linhas) {
      const { pagina, ...d } = await detalhe(l.id);
      out.push({ ...d, acessada_em: l.acessada_em });
    }
    return out.sort((a, b) => a.id - b.id);
  }

  async function detalhe(id) {
    const pagina = await obter(`${P}/client_playlist/edit/${id}/`);
    if (pagina.redirecionou) throw new Error(`Playlist ${id} não encontrada no Duplecast.`);
    const v = (n) => pagina.doc.querySelector(`[name="${n}"]`)?.value ?? "";
    if (!v("mac")) throw new Error(`Playlist ${id} não encontrada no Duplecast.`);
    const host = v("server_host").replace(/\/+$/, "");
    const porta = v("server_port");
    const comPorta = porta && porta !== "80" && !/:\d+$/.test(host) ? `${host}:${porta}` : host;
    const url = v("server_username")
      ? `${comPorta}/get.php?username=${encodeURIComponent(v("server_username"))}&password=${encodeURIComponent(v("server_password"))}&type=m3u_plus&output=ts`
      : "";
    return { id, mac: v("mac").toUpperCase(), nome: v("server_name"), url, nota: v("note"), pagina };
  }

  /** Link Xtream (http://host[:porta]/get.php?username=&password=) → campos do formulário de edição. */
  function camposServidor(url) {
    let u;
    try { u = new URL(url); } catch { throw new Error("Link da lista inválido."); }
    const usuario = u.searchParams.get("username");
    const senha = u.searchParams.get("password");
    if (!usuario || !senha) throw new Error("O link precisa ter username e password (formato Xtream: .../get.php?username=...&password=...).");
    return { server_host: `${u.protocol}//${u.hostname}`, server_port: u.port || (u.protocol === "https:" ? "443" : "80"), server_username: usuario, server_password: senha };
  }

  async function aparelho(mac) {
    const m = normalizarMac(mac);
    const lista = await codigos();
    return { mac: m, validade: validadeDoMac(lista, m), codigos_livres: lista.filter((c) => c.livre).length };
  }

  const DIAS_JA_ATIVADO = 40;

  const acoes = {
    /** Atualizar: validade (pelos códigos) + playlists da revenda. */
    async aparelho({ mac }) {
      return { ...(await aparelho(mac)), listas: await playlistsDoMac(mac) };
    },

    /**
     * Mass Change server URL (igual ao SmartOne): troca o endereço, SEM porta, em todas as playlists Xtream da
     * revenda. Sucesso = redirecionamento; a página mostra depois "Successfully Updated on N playlists".
     */
    async migrar_host({ de, para }) {
      if (!de || !para) throw new Error("Informe o endereço atual e o novo.");
      if (/:\d+$/.test(de) || /:\d+$/.test(para)) throw new Error("No Duplecast a troca é só do endereço, sem a porta.");
      const caminho = "/plugin/duplecast/client_playlist/hostname";
      const pagina = await obter(caminho);
      const r = await enviarFormulario(pagina, caminho, { from_server_host: de, to_server_host: para, server_type: "xtream" });
      const depois = r.redirecionou ? await obter(caminho) : r;
      const msg = alertas(depois.doc).filter((t) => !/irreversible/i.test(t))[0] ?? "";
      const n = msg.match(/updated on (\d+) playlist/i);
      if (n) return { de, para, listas: Number(n[1]) };
      throw new Error(`Duplecast: ${msg || "sem confirmação do site"}`);
    },

    async codigos_livres() {
      return (await codigos()).filter((c) => c.livre).map((c) => c.codigo);
    },

    /** Ativa 1 ano com um código livre. Já ativo por mais de 40 dias: não gasta, só devolve a validade. */
    async ativar({ mac }) {
      const antes = await aparelho(mac);
      const limite = new Date(Date.now() + DIAS_JA_ATIVADO * 86_400_000).toISOString().slice(0, 10);
      if (antes.validade && antes.validade > limite) return { ...antes, ja_ativado: true, codigo: null };
      const livre = (await codigos()).find((c) => c.livre);
      if (!livre) throw new Error("Sem código livre no Duplecast. Compre mais códigos na revenda antes de ativar.");
      const pagina = await obter(`${P}/client_codes/activate/${livre.codigo}/`);
      const r = await enviarFormulario(pagina, `${P}/client_codes/activate/${livre.codigo}/`, { mac: antes.mac, code: livre.codigo });
      const depois = await aparelho(antes.mac);
      if (!r.redirecionou || depois.validade === antes.validade) {
        throw new Error(`O Duplecast não ativou${alertas(r.doc)[0] ? `: ${alertas(r.doc)[0]}` : "."} Confira se o aplicativo já foi aberto na TV com esse MAC.`);
      }
      return { ...depois, ja_ativado: false, codigo: livre.codigo };
    },

    async listas_do_mac({ mac }) {
      return playlistsDoMac(mac);
    },

    /** Cria pelo formulário M3U (link inteiro); o site guarda como servidor (host/porta/usuário/senha). */
    async criar({ mac, cliente, nome, url }) {
      if (!url) throw new Error("Informe o link da lista.");
      const m = normalizarMac(mac);
      const antes = new Set((await playlistsDoMac(m)).map((l) => l.id));
      const pagina = await obter(`${P}/client_playlist/add/`);
      const r = await enviarFormulario(pagina, `${P}/client_playlist/add/`, { m3u_playlist: url, mac: m, m3u_name: nome || "Lista", epg_url: "", note: cliente || "" });
      const depois = await playlistsDoMac(m);
      if (!depois.some((l) => !antes.has(l.id))) {
        throw new Error(`O Duplecast não criou a lista${alertas(r.doc)[0] ? `: ${alertas(r.doc)[0]}` : "."}`);
      }
      return depois;
    },

    async editar({ id, mac, nome, url }) {
      const atual = await detalhe(id);
      if (atual.mac !== normalizarMac(mac)) throw new Error(`A playlist ${id} do Duplecast é de outro MAC (${atual.mac}).`);
      const campos = { server_name: nome ?? atual.nome, mac: atual.mac, ...(url ? camposServidor(url) : {}) };
      const r = await enviarFormulario(atual.pagina, `${P}/client_playlist/edit/${id}/`, campos);
      const conferida = await detalhe(id);
      if (!r.redirecionou || conferida.nome !== campos.server_name) {
        throw new Error(`O Duplecast não gravou a alteração${alertas(r.doc)[0] ? `: ${alertas(r.doc)[0]}` : "."}`);
      }
      if (url) {
        const pedido = camposServidor(url);
        const gravado = conferida.pagina.doc;
        const igual = Object.entries(pedido).every(([k, v]) => (gravado.querySelector(`[name="${k}"]`)?.value ?? "") === v);
        if (!igual) throw new Error("O Duplecast não gravou o link novo.");
      }
      return playlistsDoMac(atual.mac);
    },

    async apagar({ id, mac }) {
      const atual = await detalhe(id);
      if (atual.mac !== normalizarMac(mac)) throw new Error(`A playlist ${id} do Duplecast é de outro MAC (${atual.mac}).`);
      // A exclusão é um POST com o token da sessão (capturado: _csrf_token, 0=, submit=Yes)
      const csrf = atual.pagina.doc.querySelector('[name="_csrf_token"]')?.value;
      if (!csrf) throw new Error("Token da sessão do Duplecast não encontrado.");
      await fetch(`${BASE}/plugin/duplecast/client_playlist/delete/${id}/`, {
        method: "POST", credentials: "include", redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ _csrf_token: csrf, 0: "", submit: "Yes" }).toString(),
      });
      const depois = await playlistsDoMac(atual.mac);
      if (depois.some((l) => l.id === id)) throw new Error("O Duplecast não apagou a lista.");
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
        resp = await chrome.runtime.sendMessage({ tipo: "proxima", alvos: ["duplecast"] });
      } catch (e) {
        resp = { ok: false, erro: String(e) };
      }
      if (resp?.parar) { estado("outra aba trabalhando"); return; }
      if (!resp?.ok || !resp.tarefa) {
        // Extensão recarregada: este código ficou órfão — recarrega a página para entrar o novo
        if (/context invalidated/i.test(resp?.erro ?? "")) { location.reload(); return; }
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
      // 403 do Cloudflare = liberação (cf_clearance) vencida. Recarregar a tela de login não adianta (ela fica fora da
      // proteção): navega para uma página protegida, onde o navegador refaz o desafio sozinho.
      if (!resultado.ok && /Cloudflare/.test(resultado.erro)) { location.assign(BASE + "/client/"); return; }
    }
  }

  ciclo();
})();
