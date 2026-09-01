---
name: incident_build_oom_easypanel
description: "Deploy no Easypanel falhou com heap out of memory na checagem de TypeScript do next build (31/08/2026) — corrigido com NODE_OPTIONS=--max-old-space-size=4096 no script de build"
metadata:
  node_type: memory
  type: reference
---

# Incidente: build falha com "JavaScript heap out of memory"

**Sintoma (31/08/2026):** deploy pelo Easypanel falhou no passo `npm run build`. Log completo mostrou `next build` compilando com sucesso (`✓ Compiled successfully in 55s`), mas travando e morrendo (`SIGABRT`) durante a fase `Running TypeScript...` — a checagem de tipos do projeto inteiro, separada da compilação Turbopack. Heap batendo no teto padrão do Node (~2GB) antes de crashar.

## Causa

Não era erro de código — `npm run build` e `npm ci` rodavam limpos localmente. O checker de TypeScript roda sobre o projeto inteiro (não incremental), e cresceu o suficiente (troca de 29 `<select>` nativos por um componente Radix genérico, ver [[incident_select_nativo_linux_click_drag]]) pra estourar um teto de heap que já estava apertado dentro do container de build do Easypanel.

## Correção

`package.json` → script `build`:
```json
"build": "NODE_OPTIONS='--max-old-space-size=4096' next build"
```

Dobra o teto de heap do Node de ~2GB (padrão) pra 4GB — dentro da folga observada na VPS no momento (`free -h`: ~5GB disponíveis de 7.8GB totais, mesmo com outros serviços rodando).

## Se acontecer de novo

Se o build voltar a estourar mesmo com 4GB (projeto crescendo mais, ou VPS sob mais pressão de memória de outros serviços concorrentes), os próximos passos nessa ordem:
1. Checar `free -h` na VPS no momento do build — se a memória disponível já estiver baixa, o problema é concorrência de outros serviços/builds, não só o teto do Node.
2. Subir `--max-old-space-size` mais (ex: 6144), sempre deixando folga — nunca chegar perto do total físico da VPS (7.8GB), senão o OOM killer do próprio host mata o processo em vez do V8 falhar de forma controlada.
3. Considerar rodar `tsc --noEmit` como etapa separada com cache incremental, ou avaliar se `next.config.js` pode pular a checagem de tipo no build de produção (`typescript.ignoreBuildErrors`) — só como último recurso, já que perde a proteção de tipo no deploy.

Ver também: [[incident_select_nativo_linux_click_drag]] (mudança que expôs o teto apertado)
