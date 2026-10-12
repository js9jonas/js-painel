---
name: incident_template_duplicado_post_reenviado_12out2026
description: 12/10/2026 — disparo em massa de templates de vencimento mandado 2x para todos (também 31/08, 03/09, 09/09, 04/10); navegador reenviava o POST ao retomar a aba. Corrigido com regra "mesmo template, mesmo número, 1x por dia" no servidor
metadata:
  type: project
---

**Sintoma:** todos os clientes do disparo "Notificar vencidos / vencem amanhã" (/chat) receberam o template 2x. Hoje: 1ª rodada 10:14:34–10:15:30, 2ª às 10:16:15 com as duas listas em paralelo (34 ms de diferença, impossível por clique).

**Causa (log do Traefik):** a aba ficou parada ~45 s; ao voltar (13:16:14 UTC) o navegador reenviou os 2 POSTs de `/api/whatsapp/notificacoes-vencimento` junto com um GET /chat (recarga). Ele mesmo abortou em 83 ms (**status 499**), mas o Next **não interrompe a rota quando o cliente desiste** — o lote rodou inteiro. A rota não tinha nenhuma proteção contra repetição. Por que o navegador reenvia não foi identificado (não há service worker); irrelevante, a defesa é no servidor.

**Histórico:** duplicados em lote em 31/08 (34), 03/09 (12), 09/09 (12), 04/10 (51), 12/10 (26).

**Correção (`95eb7f8`, + `b83d930` da renovação — deploy confirmado pelo Jonas em 12/10/2026):**
- `templateJaEnviadoHoje(telefone, template)` em `src/lib/whatsapp-template.ts` — regra definida pelo Jonas: **mesmo template pro mesmo número no máximo 1x por dia** (dia BRT; envio marcado `failed` pela Meta não conta). Índice `idx_wamsg_telefone_recebida`, ~0,05 ms.
- Disparo em massa: pula quem já recebeu (`pulado: true`, aparece como "Enviado"); consequência: cliente com 2 assinaturas vencendo no mesmo dia no mesmo número recebe só 1 aviso.
- Advisory lock por tipo (`pg_try_advisory_lock`, conexão dedicada) — 2º lote do mesmo tipo em paralelo recebe 409.
- Envio individual (`/api/whatsapp/enviar-template`, modal do /chat): 409 "já foi enviado hoje", mostrado no modal (antes a resposta era ignorada).
- Lista do painel marca "Enviado" pelo mesmo critério (template por número, de qualquer origem, antes era só pelo `source` do disparo).
- Painel: trava síncrona (`useRef`) contra clique duplo e aviso de erro.

**Testado:** consulta contra o banco real (enviado hoje → true, outro template/ontem → false; lista "amanhã" 14/14 enviados) e disputa da trava com 2 conexões. Envio real não testado (não dá sem mandar pra cliente) — 📋 conferir no próximo disparo em massa que ninguém recebe 2x.

**Lacuna conhecida:** outras rotas de envio (`/api/whatsapp/enviar` texto livre, renovar etc.) têm a mesma exposição a POST reenviado. Solução geral possível: chave de idempotência por clique (header) guardada no servidor.
