---
name: incident_segredos_repo_publico_28set2026
description: 28/09/2026 — INTERNAL_API_TOKEN, login da CENTRAL e dealer token UNITV em texto puro no repo público; varredura do histórico inteiro e plano de rotação
metadata:
  type: project
---

**Como achou:** revisando se o cron local `central_refresh_token.js` ainda era necessário (é — ver abaixo). O repo `js9jonas/js-painel` é **PÚBLICO**.

**Varredura do histórico inteiro** (`git log -p --all`, scanner que imprime só arquivo/tipo/commit, nunca o valor) — 40 achados, maioria falso positivo (`process.env.X`, sitekeys de reCAPTCHA, que são públicas). Reais:

| Segredo | Onde | Situação 28/09 |
|---|---|---|
| `INTERNAL_API_TOKEN` | fallback hardcoded em `src/scripts/central_refresh_token.js` (desde 24/08) | 🔴 **ativo** — em `src/proxy.ts` libera o middleware de auth em **toda** rota `/api/*` |
| Usuário+senha do painel CENTRAL | mesmo script (desde 25/04) | 🔴 presumivelmente ativos |
| Dealer token UNITV "permanente" | `docs/memoria/iptv_panel_adapters.md` | 🟠 validade não testada |
| Senha antiga do Postgres | fallback em 4 scripts (`arquivar-midias.mjs`, `test-*-sync.mjs`, versão antiga do refresh) | 🟢 ≠ senha atual e porta 5432 fechada externamente |
| Token antigo do bot Telegram | docs (já tratado em [[incident_telegram_token_vazado_github]]) | 🟢 revogado (getMe → 401) |

**Feito em 28/09:**
- `central_refresh_token.js` lê `INTERNAL_API_TOKEN`, `CENTRAL_USUARIO`, `CENTRAL_SENHA` do `.env.local` (parser mínimo, Node 18 não tem `loadEnvFile`) e **aborta** se faltar — sem fallback no código. Testado: variável vazia → aborta com exit 1; execução real → "Token salvo" (1ª tentativa falhou no login por instabilidade, 2ª ok; valores comparados por igualdade com os originais = idênticos).
- `arquivar-midias.mjs` sem fallback de `DATABASE_URL`.
- Token UNITV removido do doc (ponteiro pro banco).
- `test-funplays-sync.mjs`/`test-lazerplay-sync.mjs` sem senha do Postgres (usam `DATABASE_URL`).
- **n8n:** varridos os 18 workflows — só "Automações JS" (`J6sUbsVsN0yRpOk7`) usa o token, em 5 nós HTTP (M3U: buscar listas ×2, teste rápido/completo, compactar semana), todos com o valor literal no header. Convertidos pra credencial **`js-painel — token interno`** (httpHeaderAuth, id `0jUHMMZDk9L8JOSC`) — próxima troca de token = editar só a credencial. Conexões idênticas ao backup, workflow ativo e publicado.
  - ⚠️ Achado: os 3 gatilhos da cadeia M3U ("A cada 5 minutos", "A cada hora", "Toda segunda às 3h") **não estão conectados a nada** — a cadeia não roda (já era assim antes da mudança). Por isso não houve execução real pra validar a credencial; validação foi por leitura da config via API.
- **VPS:** varredura (rodada pelo Jonas, classificador bloqueou pra mim) — token só no env do serviço `js_painel`, nenhum cron/script.
- **Hook de segredos:** `.githooks/pre-commit` + `scripts/scan-segredos.py`, ativado com `git config core.hooksPath .githooks` (precisa rodar em cada clone novo). Testado bloqueando o token real.

**✅ `INTERNAL_API_TOKEN` rotacionado 28/09 ~17h30:** novo valor (64 hex, `openssl rand`) no Easypanel (deploy pelo Jonas), `.env.local` e credencial n8n `js-painel — token interno` (PATCH via API). Testado em produção (`GET /api/m3u-resumo`): novo → 200, antigo → 307 (redireciona pro login = bypass negado). Refresh da CENTRAL com o novo → "Token salvo". Arquivo temporário destruído com `shred`.

**✅ Senha da CENTRAL trocada 28/09 ~18h:** Jonas trocou no painel.fun e no cadastro do servidor no js-painel; `.env.local` atualizado via área de transferência (sem passar pelo chat). Testado: refresh fez login completo com a senha nova → "Token salvo".

**Pendente (rotação — tirar do código NÃO basta, o histórico é público):**
1. Trocar dealer token UNITV se o painel permitir.
2. Avaliar repo privado — confirmar antes que o Easypanel tem acesso autenticado ao GitHub, senão o deploy quebra.
3. Considerar restringir o bypass do `proxy.ts` a `/api/interno/*` em vez de `/api/*` inteiro (reduz o raio de um vazamento futuro).
4. Revogar a API key temporária do n8n (foi colada no chat).

**Por que o cron do refresh continua:** o token da CENTRAL que ele grava em `servidores.session_cookie` (id 2) é usado por **todas** as operações do adapter — saldo (`getCreditos`) e sync (`listarContas`) funcionam com ele; só a renovação (escrita) falha por `sessao_nao_renderizada`. Sem o cron, o adapter cai no login via CapSolver (pago por captcha).
