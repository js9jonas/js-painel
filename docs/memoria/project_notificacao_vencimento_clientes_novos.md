---
name: project-notificacao-vencimento-clientes-novos
description: "Pendência futura: diferenciar clientes novos (sem assinatura ativada) na notificação de vencimento e criar follow-up baseado no horário de cadastro/vencimento"
metadata: 
  node_type: memory
  type: project
  originSessionId: 10b491a3-2600-40b7-8a77-0f2625198fdc
  modified: 2026-07-24T13:23:41.809Z
---

Intenção registrada em 24/07/2026, ainda **não iniciada** — só anotar por enquanto, discutir detalhes quando entrar em elaboração. Contexto: mexer nas mensagens de envio de vencimento do js-painel (ver [[project_painel_notificacao_vencimento]]).

**Ideia central:**
- Ao gerar a lista de notificação de vencimento, identificar se há **clientes novos** na lista (cliente que nunca chegou a ativar a assinatura).
- Para esses, enviar uma **mensagem diferente** — não faz sentido falar de "vencimento" pra quem não ativou nada.
- Possivelmente criar um **status novo** especificamente pra marcar esse caso (distinto dos status já existentes: ativo/pendente/atrasado/vencido/inativo/cancelado — ver [[feedback_status_assinatura_terminal]]).
- Criar um **follow-up** baseado no horário/data em que a conta foi cadastrada no painel (não necessariamente vinculado a `venc_contrato`).

**Segunda pendência relacionada (mesmo dia, 24/07/2026):** identificar quando um mesmo cliente tem **múltiplas assinaturas ativas** e, nesse caso, incluir na mensagem a **descrição de cada assinatura** (pra ficar claro qual vencimento é de qual). Objetivo principal: **evitar enviar o mesmo template 2x** pro mesmo cliente só porque ele tem mais de uma assinatura vencendo — hoje o disparo aparentemente trata cada assinatura isoladamente, o que geraria duplicidade nesse cenário.

**Como aplicar:** quando o Jonas voltar a esse tópico, retomar esta memória como ponto de partida e aprofundar juntos: (1) como distinguir "novo sem ativação" no schema atual, qual template/mensagem usar, e como desenhar a lógica de follow-up (prazo, canal, repetição); (2) como agrupar por cliente antes do disparo, qual descrição usar por assinatura na mensagem consolidada, e como isso interage com a lógica de "já enviado hoje" (`source`/`whatsapp_mensagens`) do [[project_painel_notificacao_vencimento]]. Não implementar nada disso de forma proativa antes dessa discussão.
