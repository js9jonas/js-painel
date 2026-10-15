// Robô do navegador — parte de fundo. Fala com o js-painel (a página do POP não pode, por causa do CORS)
// e mantém UMA aba do POP aberta: é ela que executa as tarefas (ver popplayer.js).
import { JS_PAINEL_URL, TOKEN } from "./config.js";

const URL_POP = "https://popplayer.pro/meuplayer/users.php";
let abaTrabalho = null;
let ultimoPedido = Date.now();

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
    // Só a aba de trabalho busca tarefas (outra aba do POP aberta à mão não concorre com ela)
    if (abaTrabalho == null) abaTrabalho = aba;
    if (aba !== abaTrabalho) { responder({ parar: true }); return false; }
    ultimoPedido = Date.now();
    chamar("/api/interno/robo/proxima", { alvos: m.alvos, versao: chrome.runtime.getManifest().version })
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

// Vigia: garante a aba de trabalho aberta (Chrome reiniciado, aba fechada, travou em outra página).
async function vigiar() {
  if (abaTrabalho != null) {
    try {
      const t = await chrome.tabs.get(abaTrabalho);
      // Aba no POP e pedindo tarefas: tudo certo. Parada há 2 min (travou, desafio do Cloudflare): recarrega.
      if (t.url?.startsWith("https://popplayer.pro/")) {
        if (Date.now() - ultimoPedido > 120_000) { ultimoPedido = Date.now(); chrome.tabs.reload(abaTrabalho); }
        return;
      }
    } catch {
      // aba não existe mais
    }
    abaTrabalho = null;
  }
  const abas = await chrome.tabs.query({ url: "https://popplayer.pro/*" });
  if (abas.length) {
    abaTrabalho = abas[0].id;
    chrome.tabs.reload(abaTrabalho);
  } else {
    abaTrabalho = (await chrome.tabs.create({ url: URL_POP })).id;
  }
}

chrome.alarms.create("vigia", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "vigia") vigiar(); });
chrome.runtime.onStartup.addListener(vigiar);
chrome.runtime.onInstalled.addListener(vigiar);
