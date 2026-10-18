// src/lib/limite-requisicoes.ts — limite de requisições por IP das páginas públicas do cliente.
// Em memória: o painel roda numa instância só no Easypanel; num redeploy os contadores zeram,
// o que é aceitável pra conter enxurrada. Chave sempre com prefixo da rota (`gerar:{ip}`), pra
// rotas diferentes não dividirem o mesmo contador.

type Janela = { inicio: number; contagem: number };

const janelas = new Map<string, Janela>();
let chamadasDesdeLimpeza = 0;

/** true = pode seguir; false = passou do limite nesta janela. */
export function dentroDoLimite(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  if (++chamadasDesdeLimpeza >= 1_000) limparExpiradas(agora);

  const j = janelas.get(chave);
  if (!j || agora - j.inicio >= janelaMs) {
    janelas.set(chave, { inicio: agora, contagem: 1 });
    return true;
  }
  j.contagem++;
  return j.contagem <= maximo;
}

// Janelas são de no máximo 10 min; o que passou de 15 min sem uso sai do mapa
function limparExpiradas(agora: number) {
  chamadasDesdeLimpeza = 0;
  for (const [k, j] of janelas) if (agora - j.inicio > 15 * 60_000) janelas.delete(k);
}

/**
 * IP do visitante atrás do Traefik do Easypanel: ÚLTIMA entrada do X-Forwarded-For (o Traefik
 * mantém o que o visitante mandou e acrescenta o IP real no fim — a primeira é falsificável).
 */
export function ipDoVisitante(xff: string | null): string {
  const partes = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return partes.pop() ?? "desconhecido";
}
