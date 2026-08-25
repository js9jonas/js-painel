---
name: project-notificacao-renovacao
description: "Notificação WhatsApp ao renovar assinatura (RenovarAssinatura.tsx) — texto livre dentro da janela de 24h, com telas e vencimento"
metadata: 
  node_type: memory
  type: project
  originSessionId: 695099b2-9582-467f-b5ec-91655c5409ed
  modified: 2026-08-05T17:56:35.221Z
---

Implementado e deployado em 07/07/2026: ao clicar em "Renovar" (`src/components/clientes/RenovarAssinatura.tsx` — mesmo componente usado em `clientes/[id]` e no chat, confirmado nesta sessão), depois da renovação ter sucesso, o cliente recebe uma mensagem de confirmação por WhatsApp.

**Por que texto livre, não template**: não existe template aprovado na Meta pra "assinatura renovada" (só existem `pix_cnpj`, `identificacao`, `validade_plano`, `vencido_plano`, `lembrete_vencimento` — ver [[project_template_lembrete_vencimento]]). Criar um novo exigiria aprovação da Meta (horas/dias). Decisão do Jonas: usar texto livre, que só funciona dentro da janela de 24h do WhatsApp — fora dela, não envia nada.

**Regra de seleção de telefone**: dentre os telefones do cliente em `contatos`, usa **apenas o mais recente** que teve mensagem `origem='cliente'` nas últimas 24h (`ORDER BY recebida_em DESC LIMIT 1`) — não envia pra múltiplos telefones mesmo que mais de um qualifique. Se nenhum qualificar, não envia e a UI mostra alert com o motivo.

**Texto da mensagem** (`src/lib/notificar-renovacao.ts`):
```
🔰 *ASSINATURA RENOVADA* ♻️

📺 Telas: {telas}
📅 Novo vencimento: {data DD/MM/AAAA}

Se precisar de algo é só chamar 📲

😊 Muito obrigado! 🤝
```
`telas` vem de `planos.telas` via `assinaturas.id_plano` (existe também `pacote.telas` via `id_pacote` — confirmado que os dois valores sempre batem, usei `planos` por consistência com o resto do código desta sessão).

**Arquivos:**
- `src/lib/whatsapp-envio.ts` — helper compartilhado novo (`enviarTextoWhatsapp`, `registrarMensagemWhatsapp`), extraído de `auto-resposta-suporte.ts` pra eliminar duplicação — ambas as features usam agora.
- `src/lib/notificar-renovacao.ts` — `notificarRenovacao(idCliente, novoVencimento, telas)`.
- `src/app/api/assinaturas/[id]/renovar/route.ts` — chama `notificarRenovacao` depois do `COMMIT` nos 2 branches (`soPagamento` e normal), só quando o status final é `'ativo'`. Resposta JSON ganhou campo `whatsapp: { enviado, motivo?, telefone? }`.
- `RenovarAssinatura.tsx` — se `whatsapp.enviado === false`, mostra `alert` com o motivo; se `true` ou ausente, mantém fechamento silencioso (comportamento anterior).

**✅ Commitado, enviado e testado em 07/07/2026** — commit `97349d4`. Testado via script direto (bypassando a rota, que exige sessão next-auth) simulando os 2 cenários (com/sem janela de 24h) com dados reais, e o formato final da mensagem foi validado pelo Jonas no telefone de QA (555193162326, cliente "JS Contas" id 2573).

## ✅ Fallback via Telegram adicionado em 14/07/2026 — commit `958b1c9`

Quando não há janela de 24h aberta (ou o envio direto falha mesmo com janela), em vez de só desistir (`enviado: false`), agora notifica pelo Telegram de Jonas com botão wa.me pré-preenchido — mesmo padrão de `notificarCortesiaTelegram` (`src/app/api/assinaturas/[id]/cortesia/route.ts`). Resultado ganhou campo `viaTelegram?: boolean`; `RenovarAssinatura.tsx` mostra alert diferente nesse caso ("enviada como link no seu Telegram" em vez de "não enviada").

**Escolha do telefone no fallback**: entre os contatos do cliente, pega o que tem a mensagem `origem='cliente'` mais recente **sem limite de 24h** (diferente da escolha do envio direto, que exige estar dentro da janela).

**⚠️ Achado ao testar**: o cliente de QA (id 2573, "JS Contas") tem **mais de um telefone cadastrado** — o número 555193162326 (usado historicamente pra QA) não é necessariamente o que a função escolhe; ela opera no nível do cliente, não do telefone, e pega qualquer contato dele que tenha janela aberta. Num teste em 14/07 isso fez a função escolher outro número do mesmo cliente (555194515880) que tinha conversa mais recente, indo pelo envio direto em vez de exercitar o fallback Telegram — não testado ponta a ponta por decisão do Jonas (confiança por reuso do padrão já validado da cortesia).

## ✅ Texto de fechamento mais elegante (31/07/2026) — commit `5794210`

Jonas pediu pra acrescentar um desejo tipo "aproveite bem sua assinatura" no final da mensagem, com empatia/elegância. Propus 3 opções (mínima, calorosa com toque de conteúdo 🍿🎬, e mais formal reconhecendo a continuidade); ele escolheu a mais formal.

**Texto atual de `montarTexto` em `notificar-renovacao.ts`:**
```
🔰 *ASSINATURA RENOVADA* ♻️

📺 Telas: {telas}
📅 Novo vencimento: {data}

Se precisar de algo é só chamar 📲

🙏 Muito obrigado pela confiança e por continuar com a gente!
Aproveite bem sua assinatura! 😊
```

Lint/typecheck limpos, commitado e enviado (push feito). Deploy manual pelo Jonas como sempre — ver [[feedback_deploy_manual]].

**How to apply:** se pedir pra revisar/ajustar essa mensagem de novo no futuro, este é o texto vigente — não confundir com a versão antiga ("😊 Muito obrigado! 🤝") registrada mais acima neste arquivo.

## ✅ Bug real corrigido (05/08/2026) — fallback Telegram falhava em silêncio pra cliente sem histórico

Jonas reportou que várias renovações sem janela de 24h aberta não geravam o link no Telegram como esperado, sem nenhuma indicação de falha. Investigação confirmou com dados reais: **8 de 19** renovações dos últimos 20 dias sem notificação direta pelo WhatsApp também não tinham **nenhuma** mensagem `origem='cliente'` registrada pro telefone do cliente (comum em cliente novo que só pagou, nunca chegou a conversar por WhatsApp antes).

**Causa:** `notificarRenovacaoTelegram()` buscava o telefone via `INNER JOIN` em `whatsapp_mensagens` exigindo `origem='cliente'` — sem nenhuma linha de histórico, a query não retornava telefone nenhum, e a função desistia silenciosamente (nem WhatsApp direto nem Telegram saíam). O retorno da API só mostrava um motivo genérico ("nenhuma mensagem recebida"), sem distinguir esse caso de falha real do Telegram.

**Fix (commit `4714649`):** a busca de telefone pro link do Telegram passou a ser em `public.contatos` diretamente (`LEFT JOIN LATERAL` só pra *preferir* o telefone com conversa mais recente, sem exigir que exista) — só falha de verdade se o cliente não tiver telefone cadastrado nenhum. Faz sentido porque o wa.me link não precisa de histórico prévio pra funcionar (só a janela de 24h do envio direto via API oficial exige isso, que é uma regra real da Meta, não bug). Mensagens de erro também ficaram mais específicas.

**Validado:** simulei a nova query pros 8 clientes reais que falharam — todos os 8 agora retornam telefone.
