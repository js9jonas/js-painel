---
name: project-renovacao-conclusiva-extrato
description: "Renovação conclusiva pelo extrato do Inter (18/10/2026): Pix espontâneo na chave → pagador conhecido de 1 cliente com 1 assinatura e valor de plano → renova; etapas, regras e decisões do Jonas"
metadata:
  type: project
---

Retoma (a pedido explícito do Jonas, 18/10/2026) a ideia que em 09/07 foi decidida **não** automatizar — ver
`project_conciliacao_pix_mapeamento` na memória global (casos multi-assinatura, pagador ≠ cliente).

## Regra "Conclusivo" (aprovada pelo Jonas)
Renova sozinho só se tudo bater: pagador do extrato = exatamente 1 cliente na base de pagadores; cliente com
1 assinatura pagável; valor exato de um plano do pacote dele; sem pagamento recente; o Pix ainda não usado.
Qualquer falha → **Analisar** (/alertas). Mostrar data e hora do Pix (extrato só tem data; hora = minuto em que
o n8n viu). **Prioridade: link Pix (webhook) > extrato > comprovante do cliente** — Pix do link também aparece
no extrato e deve ser ignorado ali. Comprovante sozinho não renova (extrato é a validação garantida).

## Decisões
- Gravar cada Pix recebido numa tabela enxuta (Jonas concordou): n8n manda pro painel no mesmo ponto do aviso
  da Alexa; a tabela é a trava contra renovar 2x (o "vistos" do Redis já falhou 2x em 13/07) e serve o botão.
- Modo sombra primeiro: botão ao lado do balão "RESUMO GERADO POR IA" no /chat mostra a conclusão; só depois
  de alguns dias validando liga a renovação permanente (com chave pra desligar).
- `pagamentos.conferencia` (conferido | analisar | conclusivo | automatico) e `pagamentos.pagador` — sql/027,
  **aplicada 18/10** (45.623 viraram conferido). Pagamento antigo sem pagador identificado fica nulo.
- Coluna `pagamentos.detalhes` **excluída** a pedido do Jonas (19/10): só tinha 'OK'/vazio; telas mostram o
  Pagador no lugar. sql/029 recria a view `v_assinatura_atual_from_pagamentos` sem ela — ⚠️ aplicar só DEPOIS
  do deploy do código que parou de usar a coluna.

## Etapas
1. 🔄 Colunas + telas (código pronto, falta commit/deploy) + base de pagadores ✅ **gravada 18/10**: 3.259
   pagamentos ligados 1↔1 a resumos (1.131 clientes, 1.319 nomes), amostra aprovada pelo Jonas. Ligação: telefone
   do resumo → contato → pagamento do mesmo cliente, mesmo valor, data entre resumo −1 e +3 dias. Lixo da
   IA descartado: destinatário lido como pagador (JS SISTEMAS, JONAS EDUARDO SCHEIBE), "[NÃO INFORMADO…]".
2. 🔄 sql/028 `pix_extrato` ✅ aplicada 18/10; `src/lib/pix-extrato.ts` (grava sem duplicar + análise em modo
   sombra, sem renovar) + `POST /api/interno/pix/extrato`; análise também roda no job de 5 min. n8n ✅ 18/10:
   nó "pegar ultima transação" passou a devolver `pix` (lista crua do dia) e nó novo "Envia Pix ao painel"
   (saída verdadeira do If, onError continua, 3 tentativas) com credencial `js-painel — token interno`.
   Teste com 59 Pix simulados dos comprovantes de 3 dias: 47 conclusivo, 12 analisar (inflado: a base de
   pagadores veio desses mesmos pagamentos). Regras da análise: espera 3 min (webhook do link primeiro);
   cobrança do link paga no dia com o mesmo valor → "link"; cobrança aberta → espera até 30 min; pagador pela
   base + nome do cliente; 1 assinatura pagável; valor de plano do mesmo tipo/telas (período pelo plano);
   sem pagamento do cliente nos 7 dias antes do Pix; sem outro conclusivo da mesma assinatura.
   ⚠️ **Data do Inter (achado 18/10 23:35):** o extrato do dia 18 já trazia Pix com `dataEntrada` 19 — os Pix
   da noite (depois das ~21h, provavelmente data em UTC) vêm com o dia seguinte. Era a causa da Alexa anunciar
   de novo à meia-noite (a lista "vistos" do dia novo começava vazia). Corrigido no n8n 18/10: nó novo
   "Verifica ontem" (Redis GET de `inter:pix:vistos:<ontem>`) e "decidir novo pix" junta as duas listas.
   Filtrar por data ou pular a execução das 00:00 NÃO resolveria (perderia os Pix da noite / repetiria às
   00:01). No painel a análise usa `visto_em`, nunca `data` (que só serve pra chave única).
   Analisar em /alertas fica pra etapa 4 (em modo sombra seria repetir o fluxo normal do Jonas).
3. 🔄 Modo sombra no /chat (código pronto 19/10): "◎ Ver no extrato" embaixo do balão "RESUMO GERADO POR IA"
   (`src/components/chat/ConclusaoExtrato.tsx` → `GET /api/pix/extrato/comprovante?id_msg=`) mostra o Pix achado
   (mesmo valor, de 12 h antes a 2 h depois do resumo; nome igual e cliente da conversa primeiro), a conclusão e
   o pagamento registrado depois — ✓ se bate, ✗ se diferente. Teste com 4 comprovantes de 18/10: 3 conclusivos
   que bateram, 1 "pagador desconhecido" (Nambia paga pelo Luis Sedenir).
   Base de pagadores aprende sozinha no job de 5 min (`aprenderPagadores`, mesma regra 1↔1, comprovantes de 3 dias).
   ⚠️ Bug corrigido 19/10: o filtro de lixo `^(N/?A|…)` descartava todo nome começando com "NA" (Nambia, Natália…)
   — carga completada com +35 pagamentos. Jonas preenchia o nome em Detalhes: o que vale é o campo **Pagador**
   (movidos os 2 que ele fez: Nambia → Luis Sedenir, Adolinha → Adolfinha).
4. 📋 Ativar renovação conclusiva.
5. 📋 Futuro (Jonas, 18/10): extratos das **outras contas** (Nu PJ, Nubank, Sicredi, Caixa… ~6% dos
   pagamentos) pra cobrir essa minoria também.
