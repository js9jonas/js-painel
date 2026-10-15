// Robô do navegador — Central (painel.fun), parte que roda no MUNDO DA PÁGINA (world: MAIN). Registra as
// chamadas que a própria página faz à API (api.controle.fit): método, endereço, nomes dos cabeçalhos e status.
// Serve para descobrir o que a renovação exige além do que o servidor manda (403 "sessao_nao_renderizada").
// Valores de cabeçalho não são guardados (Authorization etc.), só os nomes.
(() => {
  if (window.__roboCentral) return;
  const registro = [];
  const anotar = (r) => { registro.push({ em: new Date().toISOString(), ...r }); if (registro.length > 80) registro.shift(); };
  const nomes = (h) => {
    try {
      if (!h) return [];
      if (h instanceof Headers) return [...h.keys()];
      if (Array.isArray(h)) return h.map((p) => String(p[0]).toLowerCase());
      return Object.keys(h).map((k) => k.toLowerCase());
    } catch { return []; }
  };

  const fetchOriginal = window.fetch;
  window.fetch = async function (entrada, opcoes = {}) {
    const url = typeof entrada === "string" ? entrada : entrada?.url;
    const metodo = (opcoes.method || entrada?.method || "GET").toUpperCase();
    const cab = nomes(opcoes.headers || entrada?.headers);
    const corpo = typeof opcoes.body === "string" ? opcoes.body.slice(0, 200) : opcoes.body ? `(${typeof opcoes.body})` : null;
    const r = await fetchOriginal.apply(this, arguments);
    if (/controle\.fit|\/api\//.test(String(url))) {
      // Renovação: guarda também a resposta (traz o vencimento novo)
      const resposta = /\/renew/.test(String(url)) ? (await r.clone().text().catch(() => "")).slice(0, 600) : undefined;
      anotar({ via: "fetch", metodo, url: String(url), cabecalhos: cab, corpo, status: r.status, credentials: opcoes.credentials ?? null, resposta });
    }
    return r;
  };

  const abrir = XMLHttpRequest.prototype.open;
  const definir = XMLHttpRequest.prototype.setRequestHeader;
  const enviar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metodo, url) { this.__robo = { metodo: String(metodo).toUpperCase(), url: String(url), cabecalhos: [] }; return abrir.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k) { this.__robo?.cabecalhos.push(String(k).toLowerCase()); return definir.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (corpo) {
    const info = this.__robo;
    if (info) {
      info.corpo = typeof corpo === "string" ? corpo.slice(0, 200) : corpo ? `(${typeof corpo})` : null;
      info.withCredentials = this.withCredentials;
      this.addEventListener("loadend", () => {
        if (!/controle\.fit|\/api\//.test(info.url)) return;
        // Renovação: guarda também a resposta (traz o vencimento novo)
        const resposta = /\/renew/.test(info.url) ? String(this.responseText ?? "").slice(0, 600) : undefined;
        anotar({ via: "xhr", ...info, status: this.status, resposta });
      });
    }
    return enviar.apply(this, arguments);
  };

  window.__roboCentral = { registro };
  // A parte isolada da extensão (central.js) pede o registro por mensagem
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || ev.data?.tipo !== "robo-central-pedir-registro") return;
    window.postMessage({ tipo: "robo-central-registro", registro: registro.slice() }, "*");
  });
})();
