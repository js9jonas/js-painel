---
name: label-sync-whatsapp
description: "Sincronização automática de etiquetas WA por painel IPTV ativo — js-painel, Meta Cloud API, ativo desde 09/06/2026"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9e0ec0cb-8e28-4b35-bbc9-323f39a77dd5
---

Sync automático de etiquetas WhatsApp Business por painel IPTV ativo do cliente.
Dispara a cada mensagem recebida no webhook da Meta, máximo 1x por dia por contato.

**Why:** Identificar visualmente no WA Business quais painéis cada cliente usa.
**How to apply:** Quando Jonas mencionar "etiquetas WA", "label sync" ou painel IPTV no contexto WhatsApp.

## Arquivos (js-painel)

- `src/lib/meta-labels.ts` — `findLabels()` e `handleLabel()` via Graph API
- `src/lib/label-sync.ts` — lógica de sync (`maybeSyncLabels`)
- `src/app/api/whatsapp/webhook/route.ts` — chama `maybeSyncLabels(from)` fire-and-forget em cada mensagem recebida do cliente

## API Meta usada

```
GET  https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/labels
POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/contacts/{wa_id}/labels
Body: { "add": ["label-id"] }  ou  { "remove": ["label-id"] }
```

`wa_id` = número do cliente com código de país sem `+` (ex: `555193162326`).
Requer permissão `whatsapp_business_management` (aprovada em App Review jun/2026).

## Painéis gerenciados

`club`, `central`, `uniplay`, `fast`, `unitv`, `now`, `liebe`, `tvexpress`

Match é **case-insensitive** (`labelName.toLowerCase()`). Etiqueta `CLUB`, `Club` ou `club` no WA Business — todas casam.
Alias: `unit` e `unitv` ambos mapeiam para painel_tipo `unitv`.

## SQL de painéis ativos

Usa `contas.id_servidor` (não `consumo_servidor`, que ficou vazia após migração 08/06/2026):

```sql
SELECT DISTINCT s.painel_tipo
FROM public.assinaturas a
JOIN public.contas c ON c.id_assinatura = a.id_assinatura
JOIN public.servidores s ON s.id_servidor = c.id_servidor
WHERE a.id_cliente = $1
  AND a.status IN ('ativo', 'atrasado', 'pendente', 'vencido')
  AND c.removido_em IS NULL
  AND s.painel_tipo = ANY($2)
```

## Throttle

`public.contatos.labels_sync_em` — atualizado a cada sync; pula se já sincronizado hoje.

## Histórico

- Implementado originalmente em js-lab com Evolution API (abr/2026)
- Migrado para js-painel com Meta Cloud API em 09/06/2026
- liebe e tvexpress adicionados na migração (não existiam no js-lab)
