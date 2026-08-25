---
name: reference-internal-api-keys
description: "Chaves internas (não-secretas em valor, mas documentadas) para APIs internas do js-painel acessadas por automações (n8n, scripts)"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 79feddc8-0dc5-4fd0-bdc6-d7f23f22c2df
  modified: 2026-07-23T01:27:48.222Z
---

## WHATSAPP_INTERNAL_KEY

**Variável de ambiente:** `WHATSAPP_INTERNAL_KEY`  
**Onde está configurada:** Easypanel → js-painel → Environment  
**Uso:** autenticar chamadas ao endpoint `POST /api/whatsapp/registrar`  
**Header:** `x-api-key: <valor>`  
**Quem usa:** n8n — após enviar mensagem via Meta Cloud API, chama o registrar para salvar no banco com `source='n8n'` e exibir no chat com badge 🤖 Automação  
**Gerada em:** 10/06/2026

**Nota de segurança:** o valor real NÃO é guardado aqui — está no Easypanel. Se precisar regenerar: `openssl rand -hex 32` e atualizar tanto o Easypanel quanto os nós HTTP do n8n que usam esse header.

## Como usar em automações futuras

Qualquer automação (n8n, script externo, webhook de terceiro) que queira registrar uma mensagem enviada no chat pode chamar:

```
POST https://js-painel.l1fcxz.easypanel.host/api/whatsapp/registrar
x-api-key: <WHATSAPP_INTERNAL_KEY>
Content-Type: application/json

{
  "wa_msg_id": "wamid.xxx",
  "telefone": "5551...",
  "tipo": "text",
  "conteudo": "texto enviado",
  "source": "n8n"   // ou "n8n:nome-workflow" para identificar a origem
}
```

Campo `source` suportados no chat (sourceLabel em chat/page.tsx):
- `"n8n"` → 🤖 Automação
- `"n8n:comprovante"` → 🤖 Automação (qualquer startsWith 'n8n:')
- `"phone"` → 📱 Celular
- `"chat:email@dominio"` → 💬 email@dominio

## INTERNAL_API_TOKEN — bypass genérico de rota interna (mecanismo diferente, mesmo propósito)

**Variável de ambiente:** `INTERNAL_API_TOKEN`
**Onde funciona:** `src/proxy.ts` (middleware do Next 16, renomeado de `middleware.ts`) — checa `req.headers.get('x-internal-token') === process.env.INTERNAL_API_TOKEN` e libera **qualquer** rota `/api/*`, não só uma específica. Diferente do `WHATSAPP_INTERNAL_KEY` (checado manualmente dentro de uma única rota), esse token libera no nível do middleware, então a própria rota de destino não precisa reimplementar a checagem.
**Header:** `x-internal-token: <valor>`
**Uso confirmado (22/07/2026):** script local `central_refresh_token.js` (cron, roda fora do Next.js) chama `POST /api/interno/central-token` com esse header pra salvar o token JWT renovado do painel CENTRAL — ver [[incident-central-capsolver-bot-detection]].
**Padrão pra reaproveitar:** qualquer script/cron/automação externa que precise chamar uma rota interna do js-painel sem passar pela sessão NextAuth deve usar esse token, não criar uma chave nova — a menos que a rota precise ficar 100% pública (aí usa o whitelist explícito em `proxy.ts`, tipo `/api/whatsapp/registrar`).
