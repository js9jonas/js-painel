---
name: incident-chat-pool-esgotado-29ago2026
description: "29/08/2026 — polling do /chat sem trava de sobreposição esgotou o pool de conexões do Postgres, travando /chat, /conexoes e renovar juntos; corrigido com trava no cliente + statement_timeout + tabela-resumo incremental"
metadata:
  node_type: memory
  type: incident
  modified: 2026-08-29T21:50:00.000Z
---

## O que aconteceu

Jonas reportou simultaneamente: `/chat` não abria, `/conexoes` mostrava nenhum servidor conectando, e "renovar" ficava carregando pra sempre. Investigação (logs `docker service logs js_painel` + `pg_stat_activity` via `dbtunnel`) achou 16-20 cópias **idênticas** da query de `GET /api/whatsapp/conversas` presas simultaneamente, algumas há 3-4 minutos.

**Causa raiz:** `carregarConversas()` em `src/app/(protected)/chat/page.tsx` rodava num `setInterval(..., 10000)` sem checar se a chamada anterior ainda estava em andamento. A query em si (agregação com 2 sub-queries correlacionadas por grupo + `JOIN` fuzzy de telefone via `OR`) já não é barata (~1-3s isolada); com 2+ pessoas (Jonas + funcionária) com a aba aberta ao mesmo tempo numa VPS de só 2 vCPUs, cópias concorrentes competiam por CPU, cada uma ficava mais lenta que o próprio intervalo de 10s, e o polling empilhava mais uma a cada ciclo — bola de neve. Como `pool` (`src/lib/db.ts`) é compartilhado por **toda** a aplicação, esgotado ele, qualquer outra rota que precisasse de uma conexão (status de painel em `/conexoes`, `renovar-sessao`) ficava esperando pra sempre.

**Reforça um padrão já visto no projeto** (ver `[[reference_unique_telefone_mac]]`): lógica de agregação recalculada do zero a cada leitura, sem nenhum dado incremental/cache, escala mal conforme o histórico cresce.

## Mitigação imediata (feita em produção, 29/08/2026)

1. `pg_terminate_backend` nas conexões presas (só leitura, sem risco a dado) — precisou ser feito **duas vezes**, porque um simples restart do container (`docker service update --force js_painel`) não resolveu: o polling recriou o acúmulo em ~2 minutos.
2. Restart do container `js_painel`.

## Correção definitiva (commit `20e2b2e` + trigger de banco)

- **`src/lib/db.ts`**: `statement_timeout = 15000` em toda conexão do pool. Rede de segurança geral — nenhuma query, dessa rota ou de qualquer futura, pode mais travar indefinidamente e sufocar o app inteiro.
- **`chat/page.tsx`**: guarda `carregandoConversasRef` — pula o ciclo do polling se a chamada anterior ainda não voltou, em vez de empilhar outra.
- **Tabela-resumo incremental** `public.chat_conversas_resumo` (script `scripts/2026-08-29-chat-conversas-resumo.sql`, aplicado direto no banco via `dbtunnel` — projeto não tem sistema de migrations formal): 1 linha por telefone, mantida em dia por trigger em `whatsapp_mensagens` (INSERT/DELETE/UPDATE de conteudo/tipo/origem/telefone/recebida_em) e em `whatsapp_leituras` (marcar como lida). `GET /api/whatsapp/conversas` virou um `SELECT` simples ordenado por `ultima_mensagem_em DESC`, sem nenhum JOIN/agregação em tempo de leitura — testado em produção: **150ms para 1.648 conversas** (vs. minutos sob concorrência antes). Função central `chat_resumo_recompute(telefone)` reusada por ambos os triggers, evita duplicar a lógica de agregação.
- **Escopo deliberadamente reduzido** ("básico suficiente" — pedido explícito do Jonas): não criei trigger em `contatos`/`clientes` pra propagar edição de nome/foto/vínculo de cliente pro resumo — isso fica com um pequeno lag até a próxima mensagem daquele telefone recalcular a linha (raro na prática, e o campo errado é só cosmético: nome/foto exibida, não afeta funcionalidade). Se isso incomodar no dia a dia, adicionar trigger equivalente em `contatos`/`clientes` é o próximo passo natural.

## SSE ainda NÃO implementado — de propósito

Jonas mencionou que uma tentativa passada de trocar o polling por push (Server-Sent Events) não funcionou — a página nunca atualizava sozinha, e por isso o polling ficou como estava. Não investiguei a causa dessa tentativa anterior (não há registro dela na memória do projeto). **Antes de tentar SSE de novo, vale entender por que a tentativa anterior falhou** (client não escutava o evento? conexão HTTP fechava por timeout/proxy do Traefik/Easypanel? EventEmitter não era de fato singleton entre requests do Next.js?) em vez de repetir a mesma abordagem — combinado com o Jonas, ainda não agendado.

## Como verificar se o problema recorreu

```sql
select count(*), state from pg_stat_activity where datname=current_database() group by state;
select pid, now()-query_start, left(query,80) from pg_stat_activity where state='active' and pid<>pg_backend_pid() order by 2 desc limit 10;
```
Se aparecerem várias cópias idênticas de uma mesma query "active" por mais de alguns segundos, é o mesmo padrão — meta primeiro `statement_timeout` deve limitar o estrago sozinho agora, mas vale investigar qual rota specific.
