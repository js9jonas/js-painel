---
name: project-renovacao-conclusiva-extrato
description: "Renovação conclusiva pelo extrato do Inter (18/10/2026): Pix espontâneo na chave → pagador conhecido de 1 cliente com 1 assinatura e valor de plano → renova; etapas, regras e decisões do Jonas"
metadata:
  type: project
---

Retoma (a pedido explícito do Jonas, 18/10/2026) a ideia que em 09/07 foi decidida **não** automatizar — ver
`project_conciliacao_pix_mapeamento` na memória global (casos multi-assinatura, pagador ≠ cliente).

## Onde parou (19/10/2026, tarde)
Tudo de 19/10 em produção (selo no /chat `ff2d043`, prova no comprovante + forma sugerida `2ced19d`, análise na hora
`28ff937`). Modo sombra: 5/5 conclusivos corretos no balanço da manhã. **Próximo:** acompanhar mais uns dias pelos
selos do /chat e decidir a etapa 4 com o Jonas. 📋 Jonas revogar o token da API do n8n colado no chat em 19/10.
Ideia em aberto: n8n trocar para `/banking/v2/extrato/completo` (dataHora + endToEndId) para parear exato.

## Onde parou (19/10/2026, 00h — histórico)
Etapas 1–3 em produção (`5050d1e`, `d4ef5d3`, `53221ad`, `c579c87`, `e22758a`); sql/027, 028 e 029 aplicadas.
Ainda **nenhum Pix real** passou pelo envio do n8n (tabela `pix_extrato` vazia na virada). **Próximo:** conferir o
1º Pix real (linha gravada + análise), depois acompanhar uns dias o modo sombra e fazer o balanço de acertos:
`SELECT situacao, count(*) FROM pix_extrato GROUP BY 1` + comparar conclusivos com o pagamento registrado
(mesma lógica de `conclusaoDoComprovante`). Etapa 4 (renovar de verdade) só com zero erros e decisão do Jonas.
Pendências pequenas: Jonas revogar a chave temporária do n8n de 18/10; botão OK e renovação gravando
`conferencia`/`pagador` ainda não vistos numa gravação real.

## Balanço 19/10/2026 (manhã, 1º dia com Pix reais)
7 Pix gravados a partir de 06:11 (os de 18/10 não entraram: envio do n8n só começou de noite). **5 conclusivos, 5
batem** com o pagamento que o Jonas registrou (Charles, Deise, Arthur, Alisson, Marcos) — 0 erros; Alisson acertou
mesmo com o resumo da IA errado (pagador "JS SISTEMAS"). Pedro Matos R$20 = teste do link de 18/10 → "link" ✓.
Leonardo Silva R$35 → analisar (pagador desconhecido). Silvana Stoffel pagou na chave **pessoal** (destinatário
Jonas Eduardo Scheibe), fora do extrato PJ — certo não aparecer.
⚠️ Achado: Pix "PIX RECEBIDO INTERNO" (Inter→Inter) feito no domingo vem com `dataEntrada` do dia útil seguinte e
só aparece segunda (Pedro Matos pago 18/10 16:45 → data 19, visto 06:11). Leonardo Silva é desse tipo, dono ainda
desconhecido (NÃO é a Ilzili: o extrato do Jonas mostra o Pix dela de 18/10 11:54 como "Ilzili Terezinha Graf
Bohnert", Pix comum de 18/10, que não entrou na tabela). Na etapa 4 não renova 2x: pagamento nos 7 dias antes → analisar.
⚠️ Comprovante resumido como "Pagador: JS SISTEMAS / Destinatário: BANCO INTER" = IA leu errado (Ilzili 18/10,
Alisson 19/10 — Pix comuns, não internos); o pagamento fica sem `pagador` e a base não aprende. 📋 Ideia: preencher
`pagamentos.pagador` com o nome do extrato quando um Pix conclusivo bater com o pagamento registrado → ✅ feito
como `aprenderPagadoresPeloHorario` (job de 5 min, 19/10): horário do comprovante × `visto_em` do Pix (janela −30 s
a +2 min; único Pix do valor na janela, 1↔1 com o pagamento). Validado sem gravar: Deise/Arthur/Marcos deram o mesmo
nome já gravado, Alisson ganharia; Charles fica de fora (2 Pix de R$35 vistos no mesmo segundo). Ilzili (#45729)
gravada à mão "ILZILI TEREZINHA GRAF BOHNERT" pelo extrato do Jonas (o comprovante dela é print da lista de
movimentações, sem pagador). Extrato do n8n é o simples (`/banking/v2/extrato`: data, valor, descrição — **sem
hora nem endToEndId**); 📋 o `/banking/v2/extrato/completo` do Inter traz `dataHora` e `detalhes.endToEndId`/nome do
pagador (pela doc, não testado) — pareamento exato pelo ID do comprovante e resolveria a data do Pix interno.

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
1. ✅ Colunas + telas (em produção) + base de pagadores ✅ **gravada 18/10**: 3.259
   pagamentos ligados 1↔1 a resumos (1.131 clientes, 1.319 nomes), amostra aprovada pelo Jonas. Ligação: telefone
   do resumo → contato → pagamento do mesmo cliente, mesmo valor, data entre resumo −1 e +3 dias. Lixo da
   IA descartado: destinatário lido como pagador (JS SISTEMAS, JONAS EDUARDO SCHEIBE), "[NÃO INFORMADO…]".
2. ✅ sql/028 `pix_extrato` ✅ aplicada 18/10; `src/lib/pix-extrato.ts` (grava sem duplicar + análise em modo
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
3. ✅ Modo sombra no /chat (em produção 19/10): "◎ Ver no extrato" embaixo do balão "RESUMO GERADO POR IA"
   (`src/components/chat/ConclusaoExtrato.tsx` → `GET /api/pix/extrato/comprovante?id_msg=`) mostra o Pix achado
   (mesmo valor, de 12 h antes a 2 h depois do resumo; nome igual e cliente da conversa primeiro), a conclusão e
   o pagamento registrado depois — ✓ se bate, ✗ se diferente. Teste com 4 comprovantes de 18/10: 3 conclusivos
   que bateram, 1 "pagador desconhecido" (Nambia paga pelo Luis Sedenir).
   Base de pagadores aprende sozinha no job de 5 min (`aprenderPagadores`, mesma regra 1↔1, comprovantes de 3 dias).
   ⚠️ Bug corrigido 19/10: o filtro de lixo `^(N/?A|…)` descartava todo nome começando com "NA" (Nambia, Natália…)
   — carga completada com +35 pagamentos. Jonas preenchia o nome em Detalhes: o que vale é o campo **Pagador**
   (movidos os 2 que ele fez: Nambia → Luis Sedenir, Adolinha → Adolfinha).
   `ff2d043` (19/10, ✅ em produção): selo ao lado do "Ver no extrato" sem clicar (situação + ✓ confere / ✗
   registrado diferente nos conclusivos), consulta uma vez quando o balão entra na tela, só comprovante ≥ 18/10.
   `2ced19d` 19/10 (✅ em produção): (a) correção — o Pix do comprovante exigia só mesmo valor em 12 h, então a
   Silvana (paga no Nubank) aparecia como o Pix do Charles; agora precisa de prova: nome igual, cliente da conversa
   ou horário do comprovante (−30 s/+2 min do visto_em; `PAGO_EM_SQL` com pg_input_is_valid, data impossível não
   derruba). (b) Forma no modal Renovar (`formaSugerida`, `GET /api/assinaturas/[id]/forma-sugerida`): comprovante do
   cliente nas últimas 24 h (≥ 19/10) sem Pix no Inter → última forma de outra conta do cliente em 12 meses
   (Nu PJ/Nubank/Sicredi/Caixa/Banrisul/Lotérica) ou **Outro** (decisão do Jonas), com aviso laranja; Pix no Inter →
   INTER sem aviso; sem comprovante recente → INTER como antes. Não sobrescreve se a forma já foi trocada.
   `28ff937` 19/10 (✅ em produção): análise na hora quando não há cobrança do link ATIVA, não paga e dentro da validade (24 h,
   `EXPIRACAO_SEGUNDOS`) com o mesmo valor; com cobrança aberta, espera 3 min e a rota agenda a análise (setTimeout)
   em vez de esperar o job de 5 min. Antes: 3–8 min por Pix (Laerte "Aguardando análise" com a Alexa já anunciado).
   21/10 (bug corrigido): "Pix do link" casava só por valor + 24 h — o Pix da Dalva (chave, 19:22) pegou a cobrança
   do Lucas Gontijo (link, 19:23) e o Pix do Lucas foi pra "analisar"; Pedro Matos (19/10, Pix interno) também
   pegou a cobrança de teste do JS Contas. Agora exige o mesmo banco: `ispbDaDescricao` ("Cp :91159764-" → ISPB;
   "INTERNO" → Inter 00416968, não confirmado com Pix real) = `substr(end_to_end_id, 2, 8)` da cobrança; descrição
   em formato desconhecido nunca vira link. Simulado nos 10 "link": 8 mantidos, 2 corrigidos. Registros 67, 1401 e
   1426 refeitos à mão (`pagador_nome` das cobranças vem sempre NULL do Inter — não serve pra conferir).
4. 📋 Ativar renovação conclusiva. Pré-requisito ✅ (em produção 19/10): modal Renovar avisa em vermelho quando a
   assinatura já tem pagamento nos últimos 3 dias (`GET /api/assinaturas/[id]/pagamentos-recentes`), com
   forma, conferência e pagador — evita renovar 2x o Pix que o link/extrato já renovou. Só aviso, sem trava
   (Jonas não quer clique extra; a trava de tela parada foi removida a pedido em 12/10).
5. 📋 Futuro (Jonas, 18/10): extratos das **outras contas** (Nu PJ, Nubank, Sicredi, Caixa… ~6% dos
   pagamentos) pra cobrir essa minoria também.
