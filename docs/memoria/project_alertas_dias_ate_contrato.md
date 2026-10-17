---
name: project-alertas-dias-ate-contrato
description: /alertas — conta FAST/Central com fim de contrato a 1–29 dias soma só os dias que faltam (robô de navegador) em vez de renovar 1 mês; commit 2009b18 (17/10/2026)
metadata:
  type: project
  modified: 2026-10-17
---

**Pedido (Jonas, 17/10/2026):** em /alertas, quando o fim do contrato está a menos de 30 dias do vencimento da conta, renovar só pelos dias necessários.

**Onde existe "por dias":**
- **FAST:** a API pública (`api.painelcliente.com`, Swagger em painelcliente.com/swagger, só logado) **só renova por mês** — `renew_client` aceita só `month`; mandar `days` é ignorado e renova 1 mês (testado na Marta `ete21786`, 18/10→18/11, 1 crédito). "Adicionar dias ao vencimento" existe só no **site**: `POST ./API.php {action:'change_day', client_id, day, token:<meta csrf-token>}`, `client_id` = id da API. Regras do site: 1–30 dias, conta **ativa**, custo dias×telas (1 crédito = 30 dias). **O saldo "436,13" = 436 créditos + 13 dias guardados** (não centavos). 1º uso: Jadir `03b6uhi8` +19 dias, 19/10→07/11 (436,13→435,24).
- **Central:** tela "Alterar vencimento" → `POST users/{id}/renew-by-calendar {selected_date, days, credits}`, 1–30 dias a partir de max(vencimento, hoje), `credits = dias/30×telas` (2 casas). Lido no bundle do painel.fun; `add-days` existe na API mas a tela não usa mais. ⚠️ ainda não executado de verdade.

**Implementação (`2009b18`):** robô de navegador (`project_robo_navegador.md`) — `robo-navegador/extensao/fast.js` novo (login sozinho com Turnstile, espera 10 min se o login falhar; ação `adicionar_dias`), ação `adicionar_dias_ate` no `central.js`, extensão 1.4.0 (host painelcliente.com). Adapters: `adicionarDiasAte(usuario, dataAlvo)` em `fast.ts`/`central.ts`. Rota `POST /api/paineis/servidores/[id]/adicionar-dias {usuario}`: dias calculados no servidor/robô sobre o vencimento lido na hora (nunca da tela), trava `pg_try_advisory_lock` por conta, confere antes/depois, `audit_log` tipo `renovacao`. Botão em /alertas vira "+N dias (até dd/mm)" com 1–29 dias e conta não vencida.

**Observação:** a maioria dos casos é 26–29 dias (contrato mensal que acaba poucos dias antes) — vão receber "+N dias" em vez de 1 mês.

✅ FAST em produção e testada pela tela em 17/10/2026: Vitor Oliveira `6gmfewcr` +6 dias, 21/10→27/10 (FAST, banco e audit_log conferidos). Robô 1.4.0 entrou na FAST sozinho (Turnstile passou sem clique).

**Pegadinha da atualização:** Jonas clicou em Atualizar no Chrome errado — o do robô (tela virtual :99) seguia em 1.3.0 (`robo_status.versao` mostra). Na tela virtual não há gerenciador de janelas: **teclado não chega** (xdotool key/type sem foco); funciona só com cliques — "+" de nova aba (713,20), barra de endereço, digitar `chrome://extensions` + Enter (com a barra clicada a digitação entra), ↻ do card da extensão. Conferir com `iniciar.sh foto`.

📋 Pendente: 1º uso real na Central (renew-by-calendar nunca executado de verdade).
