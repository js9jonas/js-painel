---
name: incident-smartone-sync-ignorava-pending-13out2026
description: Sync do SmartOne só lia a aba "active" — aparelho em "Pending" (ex.: recém-ativado por giftcode) nunca atualizava a validade; corrigido em 09c56c6
metadata:
  type: project
  modified: 2026-10-13
---

**Sintoma (13/10/2026):** Joel Conceição (#355, SmartOne `7c:0a:3f:1c:41:ed`, "Tela EXTRA") — feito por fora no site do SmartOne no passado, Jonas ativou por giftcode no painel; /alertas seguia com a data antiga, sem botão, mesmo após sync.

**Causa:** `getDispositivos` (`src/lib/painel-adapters/smartone.ts`) só percorria `/client_main/index/active/`. O SmartOne deixa o aparelho em **Pending** até o cliente recarregar a lista na TV — inclusive depois de ativar por giftcode. O registro no js-painel ficava sem `id_painel_servidor` e com a validade velha. Risco escondido: aparelho ligado ao painel que caísse em Pending era marcado `removido_em` após a carência de 2 h do sync.

**Correção (`09c56c6`):** listagem lê `active` + `pending`, MAC repetido fica com a maior validade. Medido antes de subir: 484 aparelhos nas duas abas, todos já no js-painel; só o Joel mudava. ✅ em produção — Jonas confirmou "tudo certo" em 13/10/2026. Pra acertar um aparelho só: botão "↻ Atualizar" (`1b2915f`).

**Lição:** `buscarDispositivoPorMac` já olhava as duas abas — quando uma função "acha" e o sync "não vê", comparar as duas listagens primeiro.

**Complemento (`1b2915f`):** botão "↻ Atualizar" em /alertas e /clientes/[id] (Fun/Lazer/Core/SmartOne com MAC) — `POST /api/aplicativos/[id]/atualizar-painel` (job) busca só aquele MAC no painel e copia validade + número interno + painel, sem sync inteiro, sem gastar crédito, com audit_log. Pedido do Jonas pra não rodar o sync de todos por causa de 1 cadastro. Componente em `src/components/aplicativos/AtualizarPainelButton.tsx`.
