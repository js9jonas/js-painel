---
name: project_idempotencia_chaves
description: 12/10/2026 — chave de idempotência em toda ação do navegador que altera dados (fetch não-GET + server actions); proxy recusa com 409 a requisição repetida. Tabela idempotencia_chaves
metadata:
  type: project
---

**Por quê:** o navegador às vezes reenvia a mesma requisição ao retomar a aba, e o Next segue executando a rota mesmo quando o navegador já desistiu (499). Caso real: templates mandados 2x em lote (`incident_template_duplicado_post_reenviado_12out2026`). Pedido do Jonas: proteger todas as ações, não só o template.

**Como funciona (`478122e`):**
- `src/components/IdempotenciaFetch.tsx` (montado no `src/app/layout.tsx`) envolve o `window.fetch`: toda chamada POST/PUT/PATCH/DELETE ao próprio domínio ganha `Idempotency-Key` com um UUID novo **por chamada**. Server actions também (o Next usa o fetch global). Não altera o objeto de cabeçalhos de quem chamou; chave já posta é respeitada; GET e outros domínios ficam intactos.
- `src/proxy.ts`: depois do login, `registrarChaveIdempotencia()` (`src/lib/idempotencia.ts`) grava a chave em `public.idempotencia_chaves` (`sql/016`, já aplicada). Chave repetida → **409** "Essa ação já foi feita…", a rota nem roda. Conta em `repeticoes`/`ultima_repeticao` e loga `[idempotencia] requisição repetida recusada` no container.
- Sem chave (n8n, webhook da Meta, cron) ou banco com erro → segue como antes (recurso acessório, nunca bloqueia a ação).
- Limpeza: 1% das gravações apaga chaves com mais de 7 dias (as repetidas ficam 90 dias, pra medir).

**Em produção 12/10/2026 (deploy do Jonas):** chaves das ações reais gravando com usuário (enviar, marcar-lida), repeticoes=0; curl sem sessão em https://painel.jssistemas.online → 307 pro /login (página e API). Jonas confirmou tudo funcionando.

**Testado antes:** dev server local + cookie mintado, rota inexistente (sem efeito colateral): mesma chave → 404 e depois 409; chave nova / sem chave → passa; sem login → login; GET nunca barrado. Wrapper do fetch testado isolado com fetch falso (7 casos). Build ok.

**Limite:** só protege repetição da MESMA requisição. Clique novo é ação nova, de propósito; contra isso continuam as regras de negócio (ex.: template 1x por dia por número).

**Pra medir depois:** `SELECT rota, count(*), sum(repeticoes) FROM idempotencia_chaves WHERE repeticoes > 0 GROUP BY 1` — mostra se/onde o navegador repete.
