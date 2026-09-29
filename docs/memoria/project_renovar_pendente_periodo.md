---
name: project_renovar_pendente_periodo
description: 29/09/2026 — Renovar assinatura pendente aceita trimestral/semestral/anual, somando N-1 meses (mês em aberto já contado)
metadata:
  type: project
---

Pedido do Jonas em 29/09/2026, testado por ele e em produção (commit 68c4ae6): o modal "Renovar" de assinatura **pendente** passou a ter seletor de período (só os que o plano tipo+telas tem), vencimentos editáveis e valor do período.

**Regra de negócio:** quando a assinatura vira pendente, o `venc_contrato` já foi avançado 1 mês (o mês em aberto). Por isso um pagamento de N meses soma **N-1** ao vencimento atual (trimestral +2, semestral +5, anual +11); mensal só ativa, sem mexer em datas.

**Why:** cliente pendente que paga vários meses de uma vez ficava sem como lançar o período estendido — só dava pra registrar o pagamento mensal.

**How to apply:** rota `PUT /api/assinaturas/[id]/renovar` no modo `soPagamento` aceita `dataManual`/`vencContasManual` e abate crédito se o `venc_contas` mudar. O `tipo_pagamento` é calculado sempre voltando **1 mês fixo** do vencimento — não usar o período pago nesse cálculo. A pendente também renova no painel as contas vencidas, igual à renovação normal (antes não fazia isso).
