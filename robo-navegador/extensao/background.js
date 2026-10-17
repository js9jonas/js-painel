// Robô do navegador — parte de fundo. Fala com o js-painel (as páginas dos sites não podem, por causa do CORS)
// e mantém UMA aba aberta por site: é ela que executa as tarefas daquele site (popplayer.js, duplecast.js, central.js, fast.js).
import { JS_PAINEL_URL, TOKEN } from "./config.js";

const SITES = {
  popplayer: { url: "https://popplayer.pro/meuplayer/users.php", prefixo: "https://popplayer.pro/" },
  duplecast: { url: "https://duplecast.com/client/", prefixo: "https://duplecast.com/" },
  central: { url: "https://painel.fun/users", prefixo: "https://painel.fun/" },
  fast: { url: "https://painelcliente.com/clients", prefixo: "https://painelcliente.com/" },
};
const abaTrabalho = {};
const ultimoPedido = {};

async function chamar(caminho, corpo) {
  const r = await fetch(`${JS_PAINEL_URL}${caminho}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": TOKEN },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`js-painel respondeu ${r.status}`);
  return r.json();
}

chrome.runtime.onMessage.addListener((m, sender, responder) => {
  const aba = sender.tab?.id;
  if (m.tipo === "proxima") {
    const site = m.alvos?.[0];
    if (!SITES[site]) { responder({ parar: true }); return false; }
    // Só a aba de trabalho do site busca tarefas (outra aba aberta à mão não concorre com ela)
    if (abaTrabalho[site] == null) abaTrabalho[site] = aba;
    if (aba !== abaTrabalho[site]) { responder({ parar: true }); return false; }
    ultimoPedido[site] = Date.now();
    chamar("/api/interno/robo/proxima", { alvos: [site], versao: chrome.runtime.getManifest().version, sem_tarefa: !!m.sem_tarefa })
      .then((j) => responder({ ok: true, ...j }))
      .catch((e) => responder({ ok: false, erro: String(e) }));
    return true;
  }
  if (m.tipo === "resultado") {
    chamar("/api/interno/robo/resultado", m.resultado)
      .then(() => responder({ ok: true }))
      .catch((e) => responder({ ok: false, erro: String(e) }));
    return true;
  }
  return false;
});

// Vigia: garante a aba de trabalho de cada site (Chrome reiniciado, aba fechada, travou em outra página).
async function vigiarSite(site) {
  const { url, prefixo } = SITES[site];
  const id = abaTrabalho[site];
  if (id != null) {
    try {
      const t = await chrome.tabs.get(id);
      // No site e pedindo tarefas: tudo certo. Parada há 2 min (travou, desafio do Cloudflare): recarrega.
      if (t.url?.startsWith(prefixo)) {
        if (Date.now() - (ultimoPedido[site] ?? 0) > 120_000) { ultimoPedido[site] = Date.now(); chrome.tabs.reload(id); }
        return;
      }
    } catch {
      // aba não existe mais
    }
    abaTrabalho[site] = null;
  }
  const abas = await chrome.tabs.query({ url: `${prefixo}*` });
  if (abas.length) {
    // Adota a aba que já está no site (sem recarregar: pode estar no meio de uma tarefa)
    abaTrabalho[site] = abas[0].id;
    ultimoPedido[site] = Date.now();
  } else {
    // Janela própria (não aba de fundo): aba escondida tem os timers freados pelo Chrome
    const janela = await chrome.windows.create({ url, focused: false });
    abaTrabalho[site] = janela.tabs[0].id;
    ultimoPedido[site] = Date.now();
  }
}

async function vigiar() {
  for (const site of Object.keys(SITES)) await vigiarSite(site).catch(() => {});
}

// Recriar o alarme a cada reinício da parte de fundo zeraria a contagem (e ela reinicia toda hora): só cria se faltar.
chrome.alarms.get("vigia").then((a) => { if (!a) chrome.alarms.create("vigia", { periodInMinutes: 1 }); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "vigia") vigiar(); });
chrome.runtime.onStartup.addListener(vigiar);
chrome.runtime.onInstalled.addListener(vigiar);
// Ao reiniciar, a parte de fundo esquece as abas de trabalho: confere já (a vigia acha as abas abertas pela URL)
setTimeout(vigiar, 3000);
