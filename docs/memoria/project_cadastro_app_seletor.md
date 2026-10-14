---
name: project-cadastro-app-seletor
description: 13/10/2026 — modal de cadastro de app (/clientes/[id] e /chat) mostra os 4 apps mais usados + "Mais aplicativos…" (commit 423edd9)
metadata:
  type: project
---

`AplicativoModal.tsx`: o seletor mostra só os 4 apps mais usados (`APPS_PRINCIPAIS`, ordem por `uso`, que vem de
`getApps` em `src/lib/aplicativos.ts`) e a opção sentinela `MAIS_APPS`, que reabre o select com todos os outros.
Pra reabrir, `src/components/ui/select.tsx` ganhou `open`/`onOpenChange` opcionais. Commit `423edd9` (13/10/2026).
