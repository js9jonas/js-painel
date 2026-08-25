---
name: reference-central-add-days
description: Endpoint CENTRAL para adicionar dias a uma conta — usar em alertas quando vencimento do contrato < 30 dias do novo vencimento
metadata: 
  node_type: memory
  type: reference
  originSessionId: e60fb6e2-3ae9-4bad-8761-69389e49d32e
---

## CENTRAL — adicionar dias a uma conta

**Endpoint:** `POST /users/{id}/add-days`  
**Body:** `{ days: number }` (a confirmar exato formato do body)  
**Base URL:** `https://api.controle.fit/api`  
**Auth:** JWT Bearer (session_cookie do painel_servidores)

## Caso de uso planejado

Na página **Alertas**, ao renovar uma conta CENTRAL:
- Se `nova_data_vencimento - data_vencimento_contrato < 30 dias` → oferecer botão "Ajustar vencimento" que chama `add-days` com a diferença necessária para alinhar ao contrato

**Why:** Pedido em 17/06/2026. Evitar que vencimentos do painel fiquem muito próximos do contrato sem margem de segurança.  
**How to apply:** Ao implementar alertas de renovação CENTRAL, verificar essa condição antes de confirmar renovação. Não implementado ainda — endpoint reservado para uso futuro.
