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

**`contatos.telefone` é único no banco inteiro (10/08/2026)** — índice único parcial `ux_contatos_telefone_global ON contatos(telefone) WHERE telefone IS NOT NULL AND telefone <> '0000000000'` (o placeholder `0000000000`, usado em ~16 clientes sem telefone real, fica de fora da regra). Antes disso só existia `ux_contatos_cliente_telefone` em `(id_cliente, telefone)`, que impedia duplicata dentro do mesmo cliente mas não entre clientes diferentes — brecha que já causou duplicatas reais (família pagando por outro registrada como cliente novo em vez de assinatura extra no cliente existente, ver `reference_merge_clientes.md` na memória).

Toda gravação de telefone (`src/app/actions/novoCliente.ts`, `clientes.ts::salvarContato`, `contatos.ts::addContato`/`updateContato`) faz um pré-check com `buscarDonoDoTelefone()`/`erroTelefoneDuplicado()` (`src/lib/contatos.ts`) antes do INSERT/UPDATE, pra mostrar uma mensagem amigável nomeando o cliente dono do número em vez de deixar estourar o erro cru da constraint. A constraint em si continua como rede de segurança (concorrência). Exceção proposital: `contatos.ts::vincularContatoNoChat` (usado em `VincularClienteModal`) não faz esse check — a função existe justamente pra **reatribuir** um telefone de um cliente pra outro a partir do chat, então tentar impedir duplicata ali quebraria a funcionalidade.

**`aplicativos.mac` é único por `(mac, id_app)` (10/08/2026)** — índice único parcial `ux_aplicativos_mac_app ON aplicativos(mac, id_app) WHERE mac IS NOT NULL AND removido_em IS NULL`. Diferente do telefone, **não é único globalmente**: o mesmo device físico frequentemente tem 2+ apps instalados (ex: FunPlay e LazerPlay no mesmo box), cada um virando uma linha própria em `aplicativos` com o mesmo MAC — por isso o escopo é por `id_app`, não o MAC sozinho. Linhas com `removido_em` preenchido (histórico de renovação — o app recria a linha em vez de editar, ver `sync-aplicativos/route.ts`) ficam fora da regra, senão toda renovação quebraria a constraint.

Pré-check equivalente ao do telefone: `buscarDonoDoMac()`/`erroMacDuplicado()` (`src/lib/aplicativos.ts`), usado em `src/app/actions/aplicativos.ts::createAplicativo`/`updateAplicativo` (único ponto de escrita manual de MAC — `vincularConta.ts` não grava `mac`). **`sync-aplicativos/route.ts` não precisou de nenhuma alteração**: já fazia `SELECT ... WHERE UPPER(mac)=UPPER($1) AND id_app=$2` antes de decidir INSERT vs UPDATE, ou seja já era imune a essa constraint por desenho — o gap real estava só na criação manual (`createAplicativo`), que inseria direto sem checar nada antes.

Achado ao aplicar essa constraint (10/08/2026): 3 pares de linhas com MAC+id_app idêntico, sempre um registro **sem `id_cliente`** (órfão de sincronização nunca reclamado) colidindo com um registro de cliente real — resolvido com soft-delete (`removido_em = NOW()`) nas 3 órfãs antes de criar o índice. Se a constraint disparar de novo no futuro com um padrão parecido, esse é o caminho: confirmar que a linha conflitante é mesmo órfã/lixo antes de apagar, não presumir.

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

## Memória do projeto

Antes de mexer em áreas cobertas por decisões/incidentes passados, ler docs/memoria/README.md (índice) — migrado da memória global do Claude Code em 24/08/2026.
