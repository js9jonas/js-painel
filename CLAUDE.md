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
EVOLUTION_URL   # WhatsApp
EVOLUTION_KEY
```
