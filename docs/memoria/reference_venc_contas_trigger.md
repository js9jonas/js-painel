---
name: reference-venc-contas-trigger
description: Distinção venc_contrato vs venc_contas e trigger trg_sync_venc_contas criado em 08/06/2026
metadata: 
  node_type: memory
  type: reference
  originSessionId: 72536f4a-5593-446c-896d-bc089f992a7f
---

## Semântica dos campos de vencimento

- **`venc_contrato`** — relação com o cliente; data oficial do contrato pago. Usado em comunicação WhatsApp, alertas de renovação visíveis ao cliente.
- **`venc_contas`** — gestão interna; data das contas IPTV nos painéis. Garante que as contas estejam ativas dentro do contrato. Usado nos alertas internos, dashboard, agente IA.

Os dois são independentes: `venc_contas < venc_contrato` indica que a conta no painel precisa ser renovada antes do contrato terminar.

## Trigger trg_sync_venc_contas

Criado em 08/06/2026 na tabela `public.contas`.

**Comportamento:** após qualquer UPDATE de `vencimento_real_painel`, `id_assinatura` ou `removido_em` em `public.contas`, recalcula `MIN(vencimento_real_painel)` de todas as contas vinculadas (não removidas) à assinatura e atualiza `assinaturas.venc_contas` automaticamente.

- Se `id_assinatura` muda, recalcula também para o id_assinatura antigo (desvinculação).
- Só atualiza se o MIN não for NULL (se não há contas com data, preserva o valor atual).

**Função:** `sync_venc_contas_from_conta()` (LANGUAGE plpgsql)

**Cobertura na criação:** 1.200 assinaturas / 1.357 contas vinculadas. 48 assinaturas tiveram venc_contas corrigido na sincronização pontual.

**Por que trigger e não código:** cobre todos os caminhos (adapters, sincronizar, renovar route) sem risco de divergência.
