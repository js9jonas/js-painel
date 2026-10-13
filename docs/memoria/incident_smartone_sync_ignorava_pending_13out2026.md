---
name: incident-smartone-sync-ignorava-pending-13out2026
description: Sync do SmartOne só lia a aba "active" — aparelho em "Pending" (ex.: recém-ativado por giftcode) nunca atualizava a validade; corrigido em 09c56c6
metadata:
  type: project
  modified: 2026-10-13
---

**Sintoma (13/10/2026):** Joel Conceição (#355, SmartOne `7c:0a:3f:1c:41:ed`, "Tela EXTRA") — feito por fora no site do SmartOne no passado, Jonas ativou por giftcode no painel; /alertas seguia com a data antiga, sem botão, mesmo após sync.

**Causa:** `getDispositivos` (`src/lib/painel-adapters/smartone.ts`) só percorria `/client_main/index/active/`. O SmartOne deixa o aparelho em **Pending** até o cliente recarregar a lista na TV — inclusive depois de ativar por giftcode. O registro no js-painel ficava sem `id_painel_servidor` e com a validade velha. Risco escondido: aparelho ligado ao painel que caísse em Pending era marcado `removido_em` após a carência de 2 h do sync.

**Correção (`09c56c6`):** listagem lê `active` + `pending`, MAC repetido fica com a maior validade. Medido antes de subir: 484 aparelhos nas duas abas, todos já no js-painel; só o Joel mudava. ⚠️ Deploy manual + rodar sync do SmartOne em Conexões pendentes.

**Lição:** `buscarDispositivoPorMac` já olhava as duas abas — quando uma função "acha" e o sync "não vê", comparar as duas listagens primeiro.
