---
name: incident_webhook_timeout_resumo_29set2026
description: 28–29/09/2026 — mensagens do WhatsApp chegando no /chat com horas de atraso; gatilho do resumo estourava o statement_timeout e o webhook devolvia 500 (Meta reenviava depois)
metadata:
  type: project
---

**Sintoma (relatado 29/09):** mensagens da conversa com (51) 9584-9273 "não entraram" no /chat. Na verdade entravam com atraso de minutos até ~28 h (`criado_em - recebida_em`), a partir de 28/09 ~14h.

**Causa:** o gatilho `trg_whatsapp_mensagens_resumo` chama `chat_resumo_recompute(telefone)` a cada INSERT. A versão de 29/08 fazia join com `contatos` por três condições com OR (sem índice) e uma subconsulta por linha no COUNT de não lidas. Na maior conversa (555195849273, ~6,9 mil mensagens) passou a levar ~14–16 s, acima do `statement_timeout` de 15 s do app (`src/lib/db.ts`). O INSERT falhava, o webhook devolvia 500 e a Meta reenviava depois, com espera crescente. Mensagens de outras conversas no mesmo envio também atrasavam.

**Correção (29/09 ~18h20 BRT):** índice `idx_wamsg_telefone_recebida (telefone, recebida_em DESC)` criado CONCURRENTLY, e função reescrita com a mesma lógica em consultas separadas (`scripts/2026-09-29-chat-resumo-recompute-rapido.sql`). Antes de aplicar, a comparação numa transação desfeita deu 13,8 s → 78 ms e zero diferença no resultado em 42 conversas. Em produção ficou 35 ms. A versão antiga está em `scripts/2026-08-29-chat-conversas-resumo.sql`, caso precise voltar.

**Why:** falha silenciosa. O webhook não avisava ninguém, e só parecia "mensagem sumida".

**How to apply:** tudo que roda de forma síncrona no caminho do webhook (gatilhos inclusive) precisa ter custo por índice, sem varrer a conversa inteira, porque conversa grande só cresce. Pra detectar de novo: `SELECT ... WHERE criado_em - recebida_em > interval '10 minutes'` e `docker service logs js_painel | grep "Erro no webhook"`.
