---
name: project-saldo-servidor-automacao
description: "Saldo de créditos por servidor (/alertas) — reconciliação automática (cron 6h) contra o valor real do fornecedor + refresh do status ao vivo no card em /conexoes (27/08/2026)"
metadata:
  node_type: memory
  type: project
---

## Contexto (antes de 27/08/2026)

Existiam dois números de "créditos" completamente diferentes e nenhum se atualizava sozinho:

1. **"Créditos" ao vivo no card em `/conexoes`** — vem de `GET /api/paineis/servidores/[id]/status`, que chama `adapter.getCreditos()` direto no fornecedor, sem gravar nada no banco. Buscado só uma vez ao montar o card (`useEffect` em `PainelServidorCard.tsx`); se a aba ficasse aberta, o número ficava parado até um clique manual em "Atualizar status" ou reload.

2. **"Saldo de créditos por servidor" em `/alertas`** — número **calculado localmente** na tabela `saldo_servidor`, não uma leitura direta do fornecedor. Decrementado automaticamente a cada renovação (`abaterCreditoRenovacao()`, chamado em `renovar`/`adicionarMesConta`/`definirDataConta`), mas isso é uma **estimativa** (assume N créditos consumidos por renovação, baseado na contagem de contas). A correção contra o saldo **real** só acontecia como efeito colateral do botão "Sincronizar" no card do painel em `/conexoes` (chamava `getCreditos()` de verdade e sobrescrevia `saldo_servidor.saldo_atual`) — nunca automático.

## Fix aplicado (27/08/2026)

- **`reconciliarSaldoServidor()`** (`src/lib/saldoServidor.ts`) — extraída da lógica que antes vivia só dentro de `sincronizar/route.ts`. Compara o saldo local com o valor real e só grava histórico quando há desvio de fato (evita "ajuste de 0" poluindo o histórico a cada rodada do cron).
- **`src/lib/saldo-keepalive.ts`** + registrado em `src/instrumentation.ts` — cron interno (mesmo padrão do keepalive de sessão CLUB, ver [[project_club_token_expiry]]), roda a cada **6h**, varre todos os painéis ativos com `id_servidor` vinculado e reconcilia o saldo automaticamente. Cadência propositalmente baixa: créditos não mudam a ponto de precisar de granularidade de minutos, e cada chamada de `getCreditos()` soma ao orçamento de sessão única do CLUB (~280 chamadas antes de invalidar).
- **`PainelServidorCard.tsx`** — o `useEffect` que busca o status ao vivo agora também refaz a cada 10min e ao voltar o foco na aba (`visibilitychange`), além do fetch inicial ao montar.

**Escopo:** genérico pra todo painel que implementa `getCreditos` (não é específico de CLUB) — mesma lista de painéis que o botão manual "Sincronizar" já cobria.

Commit `07f74c4` (`main`), mesma sessão que o cron de renovação de sessão CLUB (`f6bc16d`) — ver [[project_jspainel_club_keepalive]] na memória global do Claude Code pro acompanhamento em andamento dos dois.
