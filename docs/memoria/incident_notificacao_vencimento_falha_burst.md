---
name: incident-notificacao-vencimento-falha-burst
description: 09/07/2026 — 26% dos templates de vencimento falharam silenciosamente por disparo em burst; painel não mostrava a falha
metadata: 
  node_type: memory
  type: project
  originSessionId: 91a46777-63fc-43d4-9cba-9b9662a0d279
---

**Incidente (09/07/2026):** Jonas notou pelo histórico do celular que vários clientes não receberam o template `lembrete_vencimento`, mas apareciam como enviados no js-painel. Investigação em `whatsapp_mensagens` confirmou: no disparo das 10:15 (~70 contatos), **18 (26%) ficaram com `status='failed'`** (coluna atualizada via webhook `statuses` da Meta, ver `webhook/route.ts` linha ~171). Todos os 70 envios foram disparados em **paralelo** (`Promise.all` sem delay) dentro de uma janela de ~0,4s — consistente com a hipótese de Jonas de que o burst sem espaçamento causa falha de entrega.

**Causa raiz exata não identificada**: a Graph API aceita a mensagem (retorna `msgId`, HTTP 200) e só minutos depois o webhook reporta `status=failed` — a Meta não expõe o motivo retroativamente, e o webhook só gravava `status`/`status_at`, descartando `status.errors` (código/motivo). Ou seja, não dá pra saber hoje *por que* falhou, só *que* falhou em burst.

**Bug adicional descoberto**: o indicador "Enviado" no painel (`NotificacoesVencimentoPanel.tsx`) era calculado só por `EXISTS` em `whatsapp_mensagens` (existe registro hoje), nunca olhava a coluna `status` real. Por isso as 18 falhas apareciam como "Enviado" (verde) no painel — Jonas só percebeu checando o celular manualmente.

**Correções aplicadas (não commitadas ainda, aguardando revisão do Jonas):**
1. `src/app/api/whatsapp/notificacoes-vencimento/route.ts` — trocado `Promise.all` por loop sequencial com delay entre cada contato (`DELAY_ENTRE_CONTATOS_MS`), para os dois tipos (`vencidos` e `amanha`, que usam o mesmo endpoint). Começou em 3s, **reduzido pelo Jonas pra 200ms em 09/07/2026** — ainda não confirmado se 200ms é suficiente pra evitar o throttle da Meta (ver `status_error` na próxima falha, se houver).
2. `src/lib/notificacoes-vencimento.ts` (`listarPendentes`) — query agora traz o `status` real do último envio do dia (LATERAL join em vez de `EXISTS`), expondo `falhouEnvio` além de `jaEnviado`.
3. `src/components/chat/NotificacoesVencimentoPanel.tsx` — indicador mostra "Falha" (vermelho) quando `falhouEnvio=true`, mesmo depois de reload da página (antes só mostrava falha na sessão do disparo, via erro síncrono).

**✅ Implementado em 09/07/2026**: coluna `public.whatsapp_mensagens.status_error jsonb` criada via `sql/005_whatsapp_status_error.sql` (migração aplicada direto no banco). `webhook/route.ts` agora grava `status.errors` (array com `code`/`title`/`message`/`error_data`/`href`) nessa coluna a cada status update, não só quando falha. Suspeita mais forte pro código do erro real: **131049** ("This message was not delivered to maintain healthy ecosystem engagement") — é o exemplo oficial da doc da Meta pra status failed e bate com o padrão de burst observado, mas não confirmado ainda porque as 18 falhas de hoje já tinham acontecido antes da coluna existir. Da próxima vez que houver falha, `status_error` vai ter o código real — checar antes de assumir que é o mesmo 131049.

**✅ Commitado e enviado em 09/07/2026** — commit `d44a26f` na branch `main`. Deploy no Easypanel é manual (ver [[feedback_deploy_manual]]), não acionado/verificado por mim.

**🐛 Efeito colateral do commit `d44a26f`**: levou junto um import não commitado (`@/lib/pix-automatico`, projeto pausado do Jonas) que só existia local, quebrando o build no Easypanel. Corrigido no commit `b3dad25` (removido o import/uso, mantendo a captura de status_error). Ver [[feedback_git_diff_completo_antes_commit]] para a lição/causa raiz.

**Como aplicar:** ver [[project_painel_notificacao_vencimento]] para o resto do painel. Se falhas voltarem a acontecer mesmo com o delay de 200ms, consultar `SELECT wa_msg_id, telefone, status_error FROM whatsapp_mensagens WHERE status='failed'` pra saber o motivo exato em vez de suspeitar.
