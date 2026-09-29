---
name: project_mensagens_foco_beneficio
description: 29/09/2026 — mensagens a clientes reescritas com foco em benefício (renovação, boas-vindas, botão Planos, resposta Chave PIX)
metadata:
  type: project
---

Pedido do Jonas em 29/09/2026 (commit b92ef82), a partir do insight de vendas "não vender, oferecer benefício" (Levitt/FAB/SPIN). Textos alterados:
- `src/lib/notificar-renovacao.ts`: renovação e boas-vindas com primeiro nome, "Pagamento confirmado", "N telas liberadas até DD/MM" (concordância 1/N, genérico sem telas) e suporte concreto ("Travou, sumiu canal ou precisa trocar de aparelho? Me chama aqui que eu resolvo").
- `/chat`, botão Planos (`enviarInfoPlano`): plano + benefício + próximo passo (tocar em Chave PIX e mandar o comprovante). O botão "Planos estendidos" foi **mantido** por decisão do Jonas (só mostra opções se o cliente tocar).
- `auto-resposta-suporte.ts`, resposta da Chave PIX: pede o comprovante. Vale também pros lembretes de vencimento.

**Why:** a mensagem era ficha técnica (recibo); passa a dizer o que muda pro cliente.

**How to apply:** tom em primeira pessoa ("eu resolvo", não "a gente"). Não prometer estabilidade ("nunca trava"); o benefício honesto é ter suporte que resolve. Não incluir oferta de plano estendido em mensagens ativas (decisão de 29/09, planos estendidos só como retenção). Templates Meta de utilidade: evitar tom promocional pra não serem reclassificados como marketing.
