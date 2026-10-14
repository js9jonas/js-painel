---
name: project-popplayer-integracao
description: 13/10/2026 — investigação de adapter pro POP Player (popplayer.pro): Cloudflare bloqueia, sem API pública; 3 alternativas propostas, Jonas ainda não escolheu
metadata:
  type: project
---

**Situação (13/10/2026):** o painel popplayer.pro continua atrás do desafio do Cloudflare (inclusive `users.php`),
e a pesquisa web não achou API pública nem documentação. Sem adapter: cadastro e listas do POP seguem manuais.
Contornar o Cloudflare com stealth/anti-detecção está fora (decisão de 30/08).

**Alternativas propostas (nenhuma escolhida ainda):**
1. Pedir ao fornecedor uma API ou liberação do IP da VPS (allowlist) — o caminho limpo.
2. Ponte Tampermonkey no Chrome do próprio Jonas (sessão já passou pelo Cloudflare) recebendo os comandos do js-painel.
3. Botão "Cadastrar no POP" que abre o painel já com os dados preenchidos (só reduz digitação).

Cobertura: os apps integrados somam ~94% dos aparelhos ativos; o POP é o maior que falta.
Histórico do fornecedor: memória global `project_popplayer_avaliacao_fornecedor`.
