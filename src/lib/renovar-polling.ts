"use client";

// Helper compartilhado por RenovarViaAPIButton e RenovarAssinatura. A rota
// /api/paineis/servidores/[id]/renovar responde de dois jeitos possíveis:
// - síncrono (maioria dos painéis): { ok, novoVencimento, mensagem } ou { erro } direto.
// - job+polling (CENTRAL, via navegador real): { jobId, status: "em_andamento" } —
//   precisa pollar GET .../renovar?jobId=... até done:true.
// Ver src/app/api/paineis/servidores/[id]/renovar/route.ts.

export type ResultadoRenovarPolling = {
  ok: boolean;
  erro?: string;
  mensagem?: string;
  novoVencimento?: string;
  migrado?: boolean;
};

export async function renovarComPolling(
  idPainelServidor: number,
  usuario: string,
  onProgresso?: (msg: string) => void
): Promise<ResultadoRenovarPolling> {
  const res = await fetch(`/api/paineis/servidores/${idPainelServidor}/renovar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, erro: `HTTP ${res.status} — ${text.slice(0, 150)}` };
  }

  if (!res.ok || json.erro) {
    return { ok: false, erro: json.erro ?? `Erro ${res.status}.` };
  }

  // Resposta síncrona normal — nada a pollar
  if (!json.jobId) {
    return { ok: true, mensagem: json.mensagem, novoVencimento: json.novoVencimento ?? undefined, migrado: json.migrado === true };
  }

  // Polling — renovação via navegador (CENTRAL), até 2min (a fila pode ter outros
  // jobs à frente numa rajada em /alertas, mas cada job individual tem timeout curto)
  const jobId: string = json.jobId;
  const inicio = Date.now();
  const MAX_ESPERA = 2 * 60 * 1000;
  let tentativa = 0;
  while (Date.now() - inicio < MAX_ESPERA) {
    await new Promise((r) => setTimeout(r, 3_000));
    tentativa++;
    onProgresso?.(`Renovando via navegador... (${tentativa * 3}s)`);
    const poll = await fetch(`/api/paineis/servidores/${idPainelServidor}/renovar?jobId=${jobId}`);
    const state = await poll.json();
    if (state.done) {
      if (state.ok) {
        return { ok: true, mensagem: state.mensagem, novoVencimento: state.novoVencimento };
      }
      return { ok: false, erro: state.erro ?? "Falha ao renovar." };
    }
  }
  return { ok: false, erro: "Tempo esgotado aguardando a renovação via navegador." };
}
