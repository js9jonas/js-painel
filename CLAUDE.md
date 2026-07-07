# js-painel

Painel de gestão de clientes IPTV da JS Sistemas (~1.100 clientes). Inclui agente IA de análise de dados com tool_use, sugestão de resposta WhatsApp e gerenciamento de assinaturas/servidores IPTV.

## Stack

- Next.js 16.x · React 19 · TypeScript · Tailwind CSS
- PostgreSQL via `pg` (pool direto em `src/lib/db.ts`) + Prisma 5 (schema separado) + drizzle-orm
- @anthropic-ai/sdk ^0.78.0
- next-auth v5 (beta) — autenticação em `src/auth.ts`
- Radix UI · lucide-react · recharts
- hls.js + mpegts.js (player IPTV)

## Comandos

```bash
npm run dev      # porta padrão (3000)
npm run build
npm run lint
```

## Banco de dados

Schema `public.*` — dados IPTV: clientes, assinaturas, planos, pagamentos, contatos, aplicativos, apps, servidores  
Schema `lab.*` — agentes IA e aprendizados (`lab.agente_dados_aprendizados`)  
Schema `gestao_comunidade.*` — acessado via tool_use do agente (read-only)

**Convenções SQL:**
- Prefixo `public.` sempre que necessário
- IDs castados como `::bigint`
- `revalidatePath` após toda Server Action mutante

## Agente IA de análise (`/agente`)

`src/app/api/agent/chat/route.ts` — agente com tool_use (loop até 12 iterações):
- Tool `run_query`: executa SELECT no PostgreSQL (máx 200 linhas, bloqueia mutations)
- Tool `get_schema`: retorna schema de `public`, `lab`, `gestao_comunidade`
- Contexto estático de negócio em `src/lib/agent-context.ts` (`STATIC_CONTEXT`)
- Aprendizados dinâmicos em `lab.agente_dados_aprendizados` (carregados em cada request)
- Extração de aprendizado via `claude-haiku-4-5-20251001` em background (fire & forget)
- Modelo principal: `claude-sonnet-4-6` (max_tokens: 4096)
- Resposta sempre em JSON: `{type, message, data}` — tipos: text, table, bar_chart, line_chart, pie_chart, kpi_cards
- Links Markdown obrigatórios para entidades: `/clientes/{id}`, `/pagamentos?cliente={id}`
- Acesso restrito a `role === 'admin'`

## Sugestão de chat WhatsApp

`src/app/api/ia/sugestao-chat/route.ts` — usa `claude-haiku-4-5-20251001` (max 300 tokens).  
Recebe `{historico, cliente}` e retorna texto simples (sem prefixos/aspas).

## Server Actions relevantes

`src/app/actions/` — padrão: query direta via `pool`, depois `revalidatePath`.  
Ações principais: `renovarConta`, `renovarAplicativo`, `inserirAssinatura`, `vincularConta`, `novoCliente`, `pagamentos`.

**Renovação sempre 1 mês** — padrão fixo, não perguntar.

## Variáveis de ambiente necessárias

```
ANTHROPIC_API_KEY
DATABASE_URL
NEXTAUTH_SECRET
AUTH_SECRET
WHATSAPP_TOKEN           # token 60 dias (~expira 07/08/2026); trocar por System User permanente
WHATSAPP_PHONE_NUMBER_ID # 234653083067380 (+55 51 8468-3468)
WHATSAPP_WABA_ID         # 265749013278174
WHATSAPP_VERIFY_TOKEN    # token de verificação do webhook
WHATSAPP_APP_SECRET      # App Secret do app jswhats (ID 1060517628167041) — usado para verificar assinatura HMAC-SHA256 do webhook
WHATSAPP_INTERNAL_KEY    # chave secreta para o endpoint POST /api/whatsapp/registrar (usado pelo n8n para salvar mensagens de automação no chat)
TELEGRAM_BOT_TOKEN       # bot @jonascheibe_bot — usado para notificar Jonas de mensagens sem template Meta aprovado (ex: cortesia de indicação)
TELEGRAM_CHAT_ID_JONAS   # chat_id pessoal do Jonas no Telegram (1110331118)
```

## Mensagens sem template Meta aprovado

Quando não há template aprovado pela Meta para um tipo de mensagem (ex: agradecimento de cortesia), **não enviar direto pela Cloud API**. Em vez disso, notificar o Telegram de Jonas (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID_JONAS`) com um botão inline `url` apontando para `https://wa.me/<numero>?text=<mensagem>` — ele abre o WhatsApp do próprio Jonas com o texto pronto, e o envio manual não exige template. Ver `src/app/api/assinaturas/[id]/cortesia/route.ts` (`notificarCortesiaTelegram`) como referência de implementação, incluindo escape de pontuação na URL (`encodeURIComponent` + `%21` pro `!`).
