---
name: incident-central-capsolver-bot-detection
description: "Card CENTRAL em /conexoes do js-painel dando 'CapSolver falhou: Bot behavior detected, error code:600010' — causa raiz e correção (22/07/2026)"
metadata: 
  node_type: memory
  type: project
  originSessionId: a31e1c29-edfc-405a-9a38-f0d2570d9971
  modified: 2026-07-23T01:28:08.240Z
---

## O que aconteceu

O card CENTRAL em `/conexoes` (js-painel) passou a mostrar `CapSolver falhou: Bot behavior detected, error code:600010`. Causa raiz encadeada, não foi sitekey/domínio mudado nem saldo do CapSolver zerado (saldo ~US$5, conferido via `getBalance`).

**Causa real:** o cron local `src/scripts/central_refresh_token.js` (roda a cada 50min, renova `session_cookie` do painel via Chrome real com Playwright — evita depender do CapSolver, já que Chrome real passa no Turnstile do Cloudflare sem cair em detecção de bot) quebrou depois de um reboot da máquina (07:23) porque o cron não tem `$DISPLAY` e o script usa `headless: false` de propósito. Sem esse refresh automático, toda carga de `/conexoes` caía no fallback via CapSolver — e com o volume de tentativas repetidas (cron falhando toda hora + qualquer acesso à página), o Cloudflare passou a rejeitar como bot.

## Correção aplicada

1. **Xvfb instalado** (`sudo apt install xvfb`) — cron agora roda `xvfb-run -a node src/scripts/central_refresh_token.js`, dando um display virtual ao Chrome sem abrir janela visível no desktop real. Confirmado ao vivo: com Xvfb, o Turnstile mostra "Sucesso!" normalmente.
2. **Fix de seletor no script:** o perfil persistente do Chrome (`~/.config/playwright-profile`) às vezes cai numa **tela de bloqueio** (só campo de senha, "Digite sua senha para desbloquear", lembra o usuário salvo) em vez da tela cheia de login usuário+senha — o script travava tentando preencher um campo de usuário que não existe nesse estado. Corrigido tornando esse campo opcional (`page.locator(...).count() > 0` antes de preencher).
3. **Salvamento do token trocado de Postgres direto pra HTTP:** o script conectava direto no Postgres via IP externo (`168.231.98.162:5432`), bloqueado por firewall desde 11/07/2026 (ver [[reference-tuneis-ssh-vps]]) — isso fazia o `pool.query` travar silenciosamente (nunca dava erro, só hang). Trocado por uma chamada HTTP a uma rota nova, `POST /api/interno/central-token`, autenticada via `INTERNAL_API_TOKEN`/`x-internal-token` (ver [[reference-internal-api-keys]]) — não depende de túnel SSH aberto.

## Lição / como aplicar no futuro

- Scripts locais (fora do Next.js) que precisam gravar no banco do js `js` devem preferir uma rota HTTP autenticada do próprio app deployado, em vez de `DATABASE_URL` apontando pro IP externo — essa porta está fechada pro mundo desde 11/07/2026, só um túnel SSH ou uma rota HTTP funcionam.
- Ao debugar scripts Playwright com `launchPersistentContext`, lembrar que o estado salvo no profile pode mudar o fluxo esperado da página (login completo vs. tela de bloqueio) — sempre tirar screenshot/dump de HTML antes de assumir os seletores.
- Cron jobs que precisam de Chrome "de cabeça" (headless:false, pra evitar detecção de bot) precisam de `xvfb-run` — cron não herda `$DISPLAY` de sessão gráfica nenhuma, real ou não.
