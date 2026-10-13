---
name: project-smartone-lista-acessada-em
description: Último acesso da TV à lista (SmartOne "Date Fetched") gravado em aplicativos.lista_acessada_em e mostrado em /clientes/[id]
metadata:
  type: project
  modified: 2026-10-13
---

Pedido do Jonas em 13/10/2026 (commit `95c4f72`, ⚠️ deploy manual pendente): na coluna Playlists de /clientes/[id], linha "Acessou dd/mm/aaaa · há Nd" acima do resumo de listas, nos apps SmartOne.

- Fonte: coluna **"Date Fetched"** da lista de aparelhos do site SmartOne (`client_main/index/active|pending`), formato "Oct 13, 2026" → `parseDataCurta` em `src/lib/painel-adapters/smartone.ts`. A página `edit_playlist` NÃO tem essa data.
- Banco: `aplicativos.lista_acessada_em date` (`sql/017`, aplicada 13/10 em produção). Preenchida 1x na hora (483 de 484 aparelhos); depois pelo sync do SmartOne (`COALESCE`, outros apps não mexem) e pelo botão "↻ Atualizar" (grava sem contar como mudança/auditoria).
- Aparelho em "pending" pode vir sem data (ex.: Tela EXTRA do Joel).
