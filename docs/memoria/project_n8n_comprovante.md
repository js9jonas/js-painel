---
name: project-n8n-comprovante
description: Workflow n8n análise de comprovante WhatsApp — migrado para Meta Cloud API em jun/2026
metadata: 
  node_type: memory
  type: project
  originSessionId: 166ec610-a2e0-4c80-9632-0dd147f348d0
  modified: 2026-07-26T20:43:40.876Z
---

## Workflow: WhatsApp JS API Oficial (ID: `81byRJISvt0l7X6X`)

Analisa comprovantes de pagamento enviados via WhatsApp (imagem ou PDF), extrai dados via Claude e responde ao cliente. Branch de ativação de app também presente.

**Why:** Migrado de Evolution API para Meta Cloud API em 07-08/06/2026 após ativação do CoEx no +55 51 8468-3468.

## Arquitetura atual (pós-migração, 27 nós)

### Recebimento de mensagens
- Meta webhook → `js-painel /api/whatsapp/webhook` salva no banco + encaminha para n8n (fire-and-forget)
- **n8n webhook path:** `whatsapp-cloud` (POST = mensagens, GET = verificação Meta)
- Payload em `$json.body.entry[0]...` — n8n envelopa o POST body em `.body`

### Fluxo imagem/PDF
```
Buscar base64 — Evolution  →  HTTP GET graph.facebook.com/v18.0/{media_id}
  retorna { url, mime_type }

Baixar mídia  →  HTTP GET $json.url  +  Authorization: Bearer TOKEN
  binary.data.data = base64 real  ← requer N8N_DEFAULT_BINARY_DATA_MODE=default

Analisar com Claude  →  POST api.anthropic.com/v1/messages
  media_type: $('Baixar mídia').item.binary.data.mimeType
  data:       $('Baixar mídia').item.binary.data.data
```

PDF: mesma cadeia com nós `Buscar base64 — Evolution (PDF)` / `Baixar mídia (PDF)` / `Analisar PDF com Claude`.

## Branch: Ativação de app (detecção automática por imagem)

**Gatilho:** qualquer imagem recebida é analisada pelo Claude com prompt unificado. Se contiver MAC → branch ativação.

**Prompt Claude:** detecta `ATIVAÇÃO\nmac: x\ndevice_key: y` OU `RESUMO GERADO POR IA` OU `IGNORAR`

**Cadeia ativação:**
```
É ativação? (IF: text startsWith 'ATIVAÇÃO')
  → true → Extrair ativação (Set)
           → Telegram — Ativação (HTTP POST sendMessage)
  → false → Extrair resumo → É comprovante? → Enviar texto (ao cliente)
```

**Extrair ativação (Set node):** campos `macValue`, `chaveValue`, `nomeContato`
- `macValue`: `/mac:\s*([^\n]+)/i`
- `chaveValue`: `/device_key:\s*(\S+)/i`
- `nomeContato`: `contacts[0].profile.name` ou `messages[0].from`

**Telegram — Ativação:** 1 mensagem com botões `copy_text`
- Bot: @jonascheibe_bot (token: `5906280570:AAFxVppf-Ftlu2lz6_E4pdJM-lFULezh_e0`)
- Chat ID pessoal Jonas: `1110331118`
- Formato: texto Markdown + inline_keyboard com `📋 Copiar MAC` e `🔑 Copiar Chave` (condicional)
- **Meta Cloud API não permite enviar para si mesmo** → por isso Telegram em vez de WhatsApp

## Quirks críticos

1. **`N8N_DEFAULT_BINARY_DATA_MODE=default` OBRIGATÓRIO** no Easypanel n8n.
   - Sem isso: `binary.data.data` = `"filesystem-v2"` → bytes corrompidos → Claude rejeita imagem

2. **Code nodes no task runner não têm `fetch`, `$helpers`** — sempre usar HTTP Request nodes

3. **n8n webhook envelopa body:** expressões sempre `$json.body.entry[0]...`

4. **`@` em literais n8n** = string vazia — JIDs e tokens especiais devem ficar em Set node, referenciados via expressão

5. **`$json` scope** — em nós sequenciais, sempre usar `$('NomeDoNó').item.json.campo` para cruzar nós

6. **n8n PUT API** — settings só aceita `executionOrder` e `callerPolicy`; `binaryMode` causa erro 400

## Credenciais

- **Token WhatsApp:** hardcoded nos nós HTTP — **expira ~07/08/2026** → [[project_whatsapp_token_expiry]]
- WABA: 265749013278174 | Phone ID: 234653083067380
- **Anthropic:** credencial `9Pkx45SwAQwRFXAg` no n8n

## How to apply

Ao mexer neste workflow: verificar que `N8N_DEFAULT_BINARY_DATA_MODE=default` está no ambiente n8n do Easypanel. Usar API n8n para updates (ver [[n8n-api-acesso-e-workflow-ids]]).

## Incidente — resposta ao cliente parou de sair (26/07/2026)

Nós `É comprovante?` e `É comprovante? (PDF)` (IF) checavam `contains "RESUMO GERADO POR IA"` na resposta do Claude. Analisando 52 execuções reais de comprovante nos últimos ~2 dias (via `runData`, `includeData=true`): **48 vieram com o cabeçalho certo, 4 vieram sem** (~8% de falha) — e por coincidência as 2 últimas antes do usuário notar foram consecutivas, dando a impressão de que "parou de funcionar". Não é regressão total nem mudança de versão — é variação estocástica normal do modelo (`claude-haiku-4-5-20251001`) em textos que soam como "rótulo/título de seção" (`RESUMO GERADO POR IA`) em vez de campo de dado extraído da imagem (`Nome do Pagador`, `Valor pago` etc.). Modelos menores/rápidos como Haiku tendem a tratar esse tipo de "texto de moldura" como opcional e às vezes reescrevem (ex: um caso trocou por `COMPROVANTE DE PAGAMENTO`) ou omitem, mesmo com "responda SOMENTE nesse formato" no prompt. Sem correlação encontrada com hora, valor, nome do pagador, `stop_reason` ou tokens de saída (todos `end_turn`, bem abaixo do limite de 500).

Resultado do bug: IF caía no branch falso → `Enviar texto` nunca rodava → cliente não recebia resposta. Execuções sempre "success" nos logs, por isso passou despercebido — só aparece comparando o texto real gerado com a condição do IF.

**Fix aplicado:** troquei `rightValue` dos dois nós IF de `"RESUMO GERADO POR IA"` para `"Nome do Pagador"` — campo presente em 100% das 52 execuções analisadas, cabeçalho presente ou não. PUT feito via API n8n.

**Why:** depender de o modelo reproduzir literalmente uma frase "decorativa" é frágil por natureza (variação de amostragem), mesmo sem mudança de prompt ou versão. Condições de IF devem se basear em campos de dado que o modelo sempre extrai da imagem, não em boilerplate textual.

**How to apply:** ao investigar "workflow não errou mas não fez X" em qualquer automação com LLM, sempre puxar `runData` de várias execuções recentes (`includeData=true`) e comparar o texto real gerado com a condição usada — não assumir que "success" nos logs = saída no formato esperado. Preferir condições de IF baseadas em campos de dado extraídos, evitar depender de cabeçalhos/rótulos textuais fixos pedidos ao modelo.
