---
name: project-auto-resposta-suporte-status
description: auto-resposta-suporte.ts (botões WhatsApp Pagamento mensal/Planos estendidos/Falar com suporte) responde independente do status da assinatura — decisão explícita 05/08/2026
metadata: 
  node_type: memory
  type: project
  originSessionId: bf256fcf-d7dd-412b-9a95-b3fd7452484b
  modified: 2026-08-05T17:49:08.228Z
---

`buscarAssinaturaCliente()` em `src/lib/auto-resposta-suporte.ts` respondia aos botões do WhatsApp ("Falar com suporte", "Pagamento mensal", "Planos estendidos") só quando `assinaturas.status IN ('ativo', 'atrasado', 'pendente', 'vencido')` — excluía silenciosamente `inativo` e `cancelado` (a função simplesmente não respondia nada, sem erro).

**05/08/2026 — removido o filtro de status por completo** (commit `332461b`, deploy manual). Mantido só `p.tipo != 'Cortesia'`. Decisão explícita do Jonas depois que eu sinalizei os riscos:

- **`inativo`** é status manual e terminal (cliente confirmou cancelamento antes do vencimento — ver [[feedback_status_assinatura_terminal]]). Responder cobrança/PIX pra esse cliente contradiz a decisão dele já registrada.
- **`cancelado`** é automático (30+ dias sem pagar) — na verdade já havia uma inconsistência: o disparo em massa de lembrete de vencimento ([[project_painel_notificacao_vencimento]] / `notificacoes-vencimento.ts`) só exclui `inativo`, então clientes `cancelado` já recebiam o lembrete mas ficavam sem resposta ao clicar. Isso ficou resolvido.
- **Efeito colateral avisado:** um cliente com 1 assinatura ativa + 1 antiga cancelada/inativa, que antes era tratado como match único, agora pode cair no branch "ambíguo" (`textoAmbiguo` — só manda "vou verificar" e não continua o fluxo). Jonas optou por aceitar esse trade-off mesmo assim.

**How to apply:** se voltar a discutir esse comportamento no futuro, este é o estado vigente — qualquer status responde, sem exceção pra `inativo`/`cancelado`. Se o efeito colateral de falso-ambíguo virar problema real (cliente com assinatura ativa recebendo "vou verificar" em vez de resposta direta por causa de uma assinatura morta antiga), a correção seria filtrar a *ambiguidade* por assinaturas não-terminais, mantendo a resposta liberada pra qualquer status quando há só uma.
