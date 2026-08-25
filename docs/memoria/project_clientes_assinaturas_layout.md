---
name: project-clientes-assinaturas-layout
description: "Redesign do layout de assinaturas em clientes/[id] — cards expandidos para todas as relevantes, inativas recolhidas"
metadata: 
  node_type: memory
  type: project
  originSessionId: b5549abd-551f-4651-86aa-2251b392b81a
---

✅ 07/07/2026 — Concluído e em produção (js-painel).

Antes: só a assinatura "mais próxima do vencimento" (entre ativo/atrasado/vencido/pendente) ganhava o card rico; qualquer outra (incluindo múltiplas ativas do mesmo cliente!) caía numa tabela genérica pobre em informação — Jonas ignorava dados relevantes nesse caso.

Mudança:
- `src/components/clientes/AssinaturaCard.tsx` — card rico extraído como componente reutilizável. Toda assinatura com status `ativo`/`atrasado`/`vencido`/`pendente` usa este layout (não só uma).
- `src/components/clientes/AssinaturasInativasGroup.tsx` — `inativo`+`cancelado` ficam recolhidos num resumo único ("X assinaturas inativas"), expansível sob demanda; ao expandir usa o mesmo `AssinaturaCard`.
- Tabela genérica antiga removida de `src/app/(dashboard)/clientes/[id]/page.tsx`.
- Card de assinatura inativa/cancelada mostra "ativa por X" (`venc_contrato − criado_em`) no lugar do tempo até hoje — `tempoDesde()` em `src/lib/tempo.ts` ganhou segundo parâmetro opcional `ate` (default hoje) pra isso.

**Rastreamento de pagamento por assinatura:** `public.pagamentos.id_assinatura` (nova coluna, ver [[schema_public_tables]]) é populada nos 3 pontos reais de lançamento de pagamento de assinatura de TV (`PUT /api/assinaturas/[id]/renovar` — 2 branches — e `PUT /api/assinaturas/[id]/cortesia`) e em `renovarAplicativo.ts` (licenças de app). `createPagamento` em `actions/pagamentos.ts` não tem callers, ficou de fora.

**Why:** "dias desde último pagamento" por card precisa ser específico da assinatura quando o cliente tem 2+; sem isso o dado global do cliente aparecia igual (e errado) em todos os cards.

**Bug corrigido em 07/07/2026:** o fallback (quando a assinatura não tem pagamento com `id_assinatura` próprio) inicialmente caía em "todos os pagamentos do cliente" — isso vazava pagamento de OUTRA assinatura do mesmo cliente (ex: uma assinatura recém-paga marcava "pago hoje" em todas as outras assinaturas do cliente). Corrigido: o fallback só pode usar pagamentos com `id_assinatura IS NULL` (legado, sem vínculo nenhum) — nunca um pagamento já vinculado a uma assinatura específica que não seja a do card atual. Ver [[feedback_fallback_dado_parcial_migrado]].

**How to apply:** Se pedir pra reativar `createPagamento` ou criar novo ponto de lançamento manual de pagamento, garantir que `id_assinatura` seja passado também.
