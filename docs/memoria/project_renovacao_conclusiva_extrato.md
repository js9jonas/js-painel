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
- Detalhes mostra o pagador; "N dias desde o último pagamento" deixou de ser gravado.

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
   Analisar em /alertas fica pra etapa 4 (em modo sombra seria repetir o fluxo normal do Jonas).
3. 📋 Modo sombra com botão no /chat.
4. 📋 Ativar renovação conclusiva.
5. 📋 Futuro (Jonas, 18/10): extratos das **outras contas** (Nu PJ, Nubank, Sicredi, Caixa… ~6% dos
   pagamentos) pra cobrir essa minoria também.
