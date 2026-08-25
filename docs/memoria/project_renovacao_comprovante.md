---
name: Renovação automática por comprovante WhatsApp
description: Fluxo de renovação de assinatura disparado por comprovante enviado pelo cliente via WhatsApp
type: project
originSessionId: d109799d-58e6-4de6-b60c-bf1099ecba23
---
Arquitetura híbrida aprovada (mai/2026):

- **n8n** (já existe): recebe comprovante (imagem/PDF) via webhook Evolution, envia para IA, extrai {nome_pagador, data_pagamento, valor_pago, destinatário}. Em vez de responder direto, chama Typebot via API startChat passando as variáveis.
- **Typebot**: fluxo conversacional com o cliente — chama /api/typebot/renovar no js-painel, lida com respostas e perguntas.
- **js-painel** (a construir): endpoint `POST /api/typebot/renovar` que valida e executa a renovação.

**Why:** Typebot não processa imagens nativamente; n8n não tem estado conversacional. Híbrido mantém cada ferramenta no que é boa.

**Lógica do endpoint /api/typebot/renovar:**
- Input: { phone, valor_pago, nome_pagador, data_pagamento }
- Tolerância de valor: ±R$5,00
- Múltiplos clientes no mesmo telefone → status: multiplos_clientes (perguntar)
- Múltiplas assinaturas → sugere a de venc_contrato mais próximo > hoje, pergunta confirmação
- venc_contrato > hoje+5 dias → verificar se intervalo desde último pagamento condiz com plano_meses
- Se tudo ok → renova via lógica do PUT /api/assinaturas/[id]/renovar (datas + pagamento + crédito servidor)
- Retorna: { status: "renovado"|"nao_encontrado"|"multiplos_clientes"|"multiplas_assinaturas"|"valor_nao_bate"|"pagamento_antecipado" }

**Formato do resumo n8n:**
Nome do Pagador, Data de pagamento, Valor pago, Destinatário (sempre "JS SISTEMAS")

**Intenção futura:** notificações de assinaturas vencidas com dispositivos visuais via Home Assistant na bancada.

**Provedores WhatsApp (mai/2026):**
- Z-API: em uso atualmente no fluxo de comprovantes do n8n. Estável e confiável, bom suporte a botões. Contrato a ser cancelado quando migração estiver completa.
- Evolution: já usado para outros fluxos (labels, cortesia, etc.). Estabilidade melhorou — confiança restaurada. Migração do fluxo de comprovantes do Z-API para Evolution é o próximo passo.
- Meta API oficial (via Coex): aguardando aprovação do Facebook. Garantiria botões e recursos oficiais de forma estável. Quando aprovado, Evolution será substituída. Mudança ficará contida nos nodes de entrada/saída do n8n — o restante do fluxo não muda.
- Nenhum projeto novo entra em produção no Z-API ou Evolution enquanto Meta não estiver aprovada.

**Estratégia de migração:**
1. Adaptar fluxo n8n de comprovantes: trocar node Z-API por Evolution
2. Cancelar contrato Z-API após validação
3. Quando Meta aprovar: trocar node Evolution por Meta nos fluxos relevantes

**How to apply:** Ao retomar esse projeto, começar pelo endpoint /api/typebot/renovar. Typebot e n8n são configurados pelo Jonas separadamente.
