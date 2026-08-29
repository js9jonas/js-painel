---
name: project-chat-sse-polling-para-push
description: "Pendente — trocar o polling do /chat (10s conversas, 5s mensagens) por push via SSE; tentativa anterior não funcionou (página não atualizava) e motivo real é desconhecido"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-29T22:10:00.000Z
---

## Status: pendente, não agendado

Depois do incidente de esgotamento do pool (ver [[incident_chat_pool_esgotado_29ago2026]]), a tabela-resumo `chat_conversas_resumo` já deixou cada poll praticamente grátis (~150ms). O próximo refinamento, se/quando fizer sentido, é eliminar o polling de vez: trocar por Server-Sent Events (SSE), já que o app roda como instância única na VPS — o próprio handler do webhook do WhatsApp (`/api/whatsapp/webhook`) já sabe o exato momento que uma mensagem chega, dá pra emitir isso via um `EventEmitter` em memória sem precisar de Redis/infra nova.

**Jonas não lembra os detalhes de uma tentativa anterior** — nem confirma com certeza que essa foi de fato a abordagem tentada — só que o sintoma foi "a página nunca atualizava sozinha", e por isso ficou no polling atual. Não há registro técnico dessa tentativa na memória do projeto nem no código (não achei `EventSource`/`text/event-stream` em nenhum lugar do `src/` numa busca em 29/08/2026).

## Regra pra quando for implementar

**Testar pelo `npm run dev` local antes de considerar pronto — não só validar direto em produção.** Motivo: da última vez o problema só apareceu como "não atualiza" sem erro claro, e isso é exatamente o tipo de falha (conexão que fecha silenciosamente, proxy/Traefik do Easypanel bufferizando a resposta, EventEmitter não sendo de fato singleton entre requests do Next.js) que é mais fácil de diagnosticar no ambiente local, com logs diretos e sem camada de proxy no meio, do que direto em prod.

**Checklist mínimo antes de dar como funcionando:**
1. Confirmar no dev que o navegador realmente recebe o evento (`EventSource.onmessage` disparando, visível no Network tab como `eventsource`/`text/event-stream`) — não só que o servidor emitiu.
2. Testar especificamente o caso que pode ter quebrado da vez passada: aba em background por um tempo (`visibilitychange`), reconexão depois de queda de rede, e o comportamento do proxy em produção (Easypanel/Traefik) — que pode se comportar diferente do dev quanto a buffering/timeout de conexões long-lived. Validar em produção só depois de confirmado local.
3. Manter o polling atual como fallback até o SSE estar confirmado estável em produção por alguns dias — não trocar de uma vez.

Ver [[project_chat_page]] pro estado geral da página, e [[incident_chat_pool_esgotado_29ago2026]] pro contexto completo do que motivou essa ideia.
