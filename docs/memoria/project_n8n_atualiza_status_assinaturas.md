---
name: project-n8n-atualiza-status-assinaturas
description: "Workflow n8n 'Automações JS' — job diário que ajusta status das assinaturas (ativo/atrasado/vencido/inativo/cancelado); fix de 06/07/2026 protege status inativo manual"
metadata:
  node_type: memory
  type: project
  originSessionId: 43604043-f8ad-49c2-a756-826fd8d148d2
---

## Workflow: "Automações JS" (ID: `J6sUbsVsN0yRpOk7`)

Workflow grande com várias automações (extrato Inter, scores de clientes, resumo de e-mails, aniversariantes, WhatsApp). Um dos fluxos é o job diário de status de assinaturas.

- **Trigger:** node Schedule "Atualiza Status assinaturas" — roda todo dia às 00:02 (`triggerAtMinute: 2`)
- **Ação:** node Postgres "Atualizar status clientes assinatura" — `UPDATE public.assinaturas` com `CASE` baseado em `venc_contrato`/`venc_contas`

## Lógica de status (após fix 06/07/2026)

- **`inativo`** → nunca é alterado por nenhum critério de data. É estado manual e definitivo (cliente confirmou cancelamento antes do vencimento). Protegido tanto no `CASE` (`WHEN status = 'inativo' THEN 'inativo'`) quanto no `WHERE` (`status != 'inativo'`) — a linha nem é tocada pelo UPDATE.
- `cancelado` — contrato e `venc_contas` vencidos, status já era `pendente`/`cancelado`
- `inativo` (automático) — contrato vencido há mais de 30 dias, ainda não estava em `pendente`/`cancelado`/`inativo`
- `vencido` — contrato e `venc_contas` vencidos, há menos de 30 dias
- `atrasado` — contrato venceu mas `venc_contas` ainda válido
- `ativo` — contrato dentro do prazo

## Bug corrigido (06/07/2026)

**Sintoma:** clientes que confirmavam cancelamento antes do vencimento (Jonas marcava `status = 'inativo'` manualmente com `venc_contrato` ainda no futuro) recebiam mensagem de "conta vencida" — o job diário revertia `inativo` → `ativo` porque a lógica antiga só checava `status NOT IN ('pendente', 'cancelado')`, sem excluir `inativo`.

**Caso real encontrado na auditoria:** assinatura `id_assinatura=2429` (cliente 1284), `status='inativo'`, `venc_contrato` no dia seguinte — lógica antiga reverteria para `'ativo'` na próxima execução.

**Validação antes do deploy:** rodei a lógica antiga vs nova como `SELECT` (sem `UPDATE`) nas 3.041 assinaturas — só essa 1 linha mudava de comportamento, confirmando que o fix é cirúrgico.

**Fix aplicado:** via API do n8n (PUT no workflow, ver [[reference_n8n_api]]). `WHERE` passou a excluir `status = 'inativo'` inteiramente (a linha não é tocada, nem `atualizado_em` muda), e o `CASE` ganhou uma primeira cláusula `WHEN status = 'inativo' THEN 'inativo'` como redundância defensiva.

**Quirk do PUT:** `settings` só aceita `executionOrder` — incluir `callerPolicy: null` (quando o campo não existe no workflow original) quebra com `request/body/settings/callerPolicy must be string`. Omitir o campo inteiramente se não existir no original, em vez de copiar com `.settings.callerPolicy` que pode vir `null`.

Ver também: [[reference_n8n_api]], [[schema_privado_financeiro]] (não relacionado, mas mesmo padrão de acesso ao banco `js`).
