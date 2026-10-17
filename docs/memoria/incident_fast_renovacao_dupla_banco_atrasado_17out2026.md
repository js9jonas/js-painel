---
name: incident-fast-renovacao-dupla-banco-atrasado-17out2026
description: Marta ete21786 (FAST) renovada 2 meses seguidos em 17/10/2026 — banco atrasado fez a conta aparecer vencendo em /alertas; renovar da FAST não conferia o painel e a rota não ia pro audit_log
metadata:
  type: project
  modified: 2026-10-17
---

**O que houve (17/10/2026):** teste do Claude renovou a Marta (`ete21786`) direto na API da FAST, 18/10→18/11, mas a gravação no banco foi bloqueada pelo modo automático — o js-painel seguiu com 18/10. Ela apareceu em /alertas como vencendo e um clique em "Renovar via API" (Traefik: `POST /api/paineis/servidores/8/renovar` às 14:34 e 14:58 UTC, IP do Jonas) renovou de novo: **18/11→18/12, 1 crédito a mais** (435→434). Contrato vai até 26/11: a Marta ficou com ~3 semanas a mais na FAST (nada a desfazer — vale como adiantamento da próxima renovação).

**Duas falhas:**
1. `fast.ts renovar()` renovava sem ler o vencimento atual no painel (a Central já tinha a trava de 25 dias).
2. A rota `/api/paineis/servidores/[id]/renovar` (botão "Renovar via API" de /alertas e renovação automática do RenovarAssinatura) **não gravava no audit_log** — o caso só foi reconstruído pelo log do Traefik, sem saber a conta.

**Correção:** FAST lê `get_client` antes; vale por mais de 25 dias → não renova, devolve aviso "nenhum crédito gasto" e acerta a data no banco (testado na própria Marta: recusou, saldo igual). A rota grava `renovacao` no audit_log (usuário da sessão) sempre que o painel renovou de fato.

✅ `d206ca1` em produção (deploy confirmado pelo Jonas 17/10/2026).

**Decisão do Jonas (17/10/2026): NÃO pôr a trava nos outros 10 adapters agora** (CLUB, LIEBE, UNITV, Uniplay, NOW, NATV, Appacesso, SmartOne, IBO Pro, IBO Player) — falha provavelmente rara. Se aparecer um caso novo: **primeiro informar o Jonas** (painel, conta, o que aconteceu) e só mexer depois que ele decidir — nada de corrigir direto. Não repropor antes disso.

**Lição:** teste que muda o painel tem que deixar o banco igual na mesma hora; quando a gravação for bloqueada, avisar claramente que a conta vai aparecer errada em /alertas até o sync.
