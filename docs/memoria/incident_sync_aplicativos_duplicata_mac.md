---
name: incident-sync-aplicativos-duplicata-mac
description: "Sync de apps (aplicativos) duplicou registro pro mesmo MAC em vez de atualizar — root cause suspeita em 11/07, confirmada e corrigida no código em 13/08/2026"
metadata:
  node_type: memory
  type: project
  originSessionId: bdccc205-b494-4f13-a505-002c1ce604af
  modified: 2026-08-13T20:11:33.734Z
---

## O que aconteceu (11/07/2026)

MAC `59:31:79:19:86:99` (cliente Gabrielle Serafim, id_cliente 2762, painel Fun Play id_app=3) parou de sincronizar validade/modelo corretamente. Investigação no banco `aplicativos` mostrou **duas linhas para o mesmo MAC + mesmo id_app**:
- linha antiga (criada 04/07): vinculada à Gabrielle, mas `validade` travada, sem `modelo`/`id_painel_servidor` (formato pré-migração 003).
- linha nova (criada pelo sync às 17:13 de 11/07): `id_cliente NULL`, `modelo=roku`, `id_painel_servidor=100`, `validade` correta (18/12/2026).

## Causa provável

O sync (`src/app/api/paineis/servidores/[id]/sync-aplicativos/route.ts`, linha ~116-151) casa por `UPPER(mac) = UPPER($1) AND id_app = $2` — deveria ter encontrado a linha antiga e feito UPDATE, não INSERT. Como as duas linhas tinham exatamente o mesmo MAC (confirmado byte a byte via `encode(mac::bytea,'hex')`, sem diferença de espaço/encoding oculta) e mesmo `id_app=3`, a explicação mais provável é uma **race condition em `mapConcorrente`**: o device apareceu duas vezes na resposta paginada da API do FunPlay (ex: cliente resetou o app e por um tempo existiram dois registros do device na FunPlay com o mesmo MAC), e duas execuções concorrentes da checagem "existe?" rodaram antes de qualquer uma commitar o INSERT.

**Não foi confirmado no código** (não cheguei a reproduzir/debugar a race em si) — é a hipótese mais consistente com a evidência, não uma causa raiz provada.

## Correção aplicada

1. Confirmado com Jonas que a linha sem `id_cliente` era da Gabrielle mesmo (a linha antiga já vinculada era a certa).
2. `DELETE FROM aplicativos WHERE id_app_registro = 4998 AND id_cliente IS NULL` — removida a duplicata.
3. Jonas rodou o sync manualmente de novo em Conexões → Fun Play: **dessa vez atualizou a linha existente corretamente** (chave 549779→1931995, validade→2026-12-18, modelo→roku, id_painel_servidor→100), sem criar nova duplicata. ✅ Confirmado no banco após o re-sync — só a linha 4981 existe, com todos os campos corretos.

## Se acontecer de novo

- Buscar duplicatas: `SELECT mac, id_app, count(*) FROM aplicativos WHERE removido_em IS NULL GROUP BY mac, id_app HAVING count(*) > 1`.
- Antes de apagar qualquer linha, confirmar com Jonas qual `id_cliente` é o correto (normalmente a linha COM cliente vinculado é a certa; a órfã pode ser apagada).
- Se o padrão se repetir com frequência, vale revisar `mapConcorrente` em `sync-aplicativos/route.ts` para fazer o SELECT+INSERT/UPDATE como upsert atômico (`INSERT ... ON CONFLICT`) em vez de check-then-act, o que eliminaria a race de vez — mas isso exigiria uma constraint UNIQUE(mac, id_app) que hoje não existe (por isso a duplicata conseguiu ser inserida sem erro).

Ver [[project_conexoes_paineis]], [[reference_adapters_paineis_iptv]].

## ✅ Confirmação e correção definitiva (13/08/2026)

A hipótese de race se confirmou na prática: depois que [[reference_unique_telefone_mac]] criou a constraint `ux_aplicativos_mac_app` (10/08), um sync do FunPlays passou a **falhar com erro explícito** (`duplicate key value violates unique constraint "ux_aplicativos_mac_app"`) em vez de silenciosamente duplicar — só que a falha derrubava o **job inteiro** via `Promise.all` do `mapConcorrente`, deixando o resto do sync incompleto sem aviso (inclusive pulando a etapa final de marcar devices removidos remotamente). Verificado no banco que nenhuma duplicata real ficou persistida (o INSERT que perdeu a corrida foi revertido pelo Postgres).

**Correção aplicada em `sync-aplicativos/route.ts` (commit `f0d3fd1`, 13/08/2026):**
1. INSERT que falha com código `23505` (conflito de MAC) refaz o SELECT — a linha que "ganhou" a corrida já deve existir — e trata como UPDATE em vez de propagar o erro. A corrida se autocorrige.
2. Cada device processa dentro do seu próprio `try/catch`, contabilizado em `stats.erros` (novo campo). Uma falha isolada (dessa causa ou qualquer outra) não aborta mais o job inteiro.
3. O `aviso` final do job (já exibido em `PainelAppSyncCard.tsx` via `job.aviso`) agora também reporta quantos devices falharam individualmente, quando houver.

**Se o erro aparecer de novo:** não é mais esperado travar o sync inteiro — se travar, o fix acima não pegou o caso (ex: erro em código diferente do `23505`, ou lançado fora do `try` interno). Conferir `stats.erros` no resultado do job e os logs do servidor (`console.error` prefixado `[sync-aplicativos]`) para identificar o MAC específico.
