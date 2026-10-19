---
name: project-robo-navegador
description: Robô de navegador (15/10/2026) — Chrome comum + extensão numa tela virtual no PC do Jonas executa ações no POP Player (Cloudflare bloqueia servidor e Playwright); fila no banco, POP com listas e migração de DNS funcionando
metadata:
  type: project
  modified: 2026-10-15
---

## Por que existe
POP Player (e Duplecast) têm *managed challenge* do Cloudflare no site inteiro: `fetch`/`curl` dão 403 e até Chrome via Playwright é barrado (CDP detectado — `incident_popplayer_cloudflare_bloqueio.md`). Teste de 15/10/2026: **Chrome comum, sem automação, na tela virtual Xvfb, passa** — inclusive logado em `users.php`. Não é stealth: é um navegador normal com uma extensão nossa.

## Como funciona
- `robo-navegador/iniciar.sh` (iniciar | reiniciar | parar | tela | foto): Xvfb `:99` + `google-chrome` com perfil `~/.local/share/js-robo/perfil`. `tela` abre o mesmo perfil no desktop (para logar/carregar extensão à mão).
- Extensão `robo-navegador/extensao` (carregada UMA vez via chrome://extensions → "Carregar sem compactação"; o Chrome atual ignora `--load-extension`). Mudou código → `iniciar.sh reiniciar` (às vezes leva ~1 min até a vigia recarregar a aba; se não voltar, botão "Atualizar" em chrome://extensions).
  - `background.js`: fala com o js-painel (`config.js`, fora do git: URL + INTERNAL_API_TOKEN) e mantém 1 aba do POP aberta (vigia por alarme de 1 min, recarrega aba parada há 2 min).
  - `popplayer.js` (content script): pede tarefa (long-poll 20 s), faz login sozinho com a credencial do `painel_servidores` tipo 'popplayer' (id 110) e executa por `fetch` de dentro da página. Estado no título da aba (`[robô: aguardando …]`), legível com `DISPLAY=:99 xdotool search --onlyvisible --class chrome getwindowname`.
  - Ações: `listas_do_mac`, `criar`, `editar`, `apagar` (as duas últimas recusam se a lista for de outro MAC), `listar_todos`, `listar_dns`, `migrar_dns` (POST AJAX em migrardns.php: `ajax=true, dns_atual, dns_nova`).
- js-painel: `sql/023_robo_tarefas.sql` (`robo_tarefas`, `robo_status`, aplicado 15/10), `/api/interno/robo/proxima|resultado`, `src/lib/robo.ts` (`executarNoRobo`: robô sem contato há 90 s → erro na hora, sem enfileirar; tarefa não pega em 2 min expira), `src/lib/popplayer.ts` (Atualizar/criar/editar/apagar lista do app POP, `ID_APP_POPPLAYER = 32`), card POP em Conexões sem Sync/status.
- 403 do Cloudflare nas chamadas = liberação (`cf_clearance`) vencida. **Recarregar não adianta** se a aba está na tela de login (fora da proteção, 15/10/2026: 57 Atualizar em lote e depois tudo 403): o robô **navega para uma página protegida** (POP `users.php`, Duplecast `/client/`) e o navegador refaz o desafio sozinho.

## Duplecast (15/10/2026)
✅ Em produção (`f664e59` + `daaf02c`, deploy pelo Jonas 15/10); POP e Duplecast conferidos pela fila de produção, robô versão 1.1.0.
Mesmo robô, janela própria (background.js mantém uma aba de trabalho por site; janela, não aba de fundo, porque aba escondida tem timers freados). Detalhe em `reference_duplecast_revenda.md`.

## Central (15/10/2026)
Renovação 1 mês de dentro da página (robô), ligada no adapter `central.ts`; detalhe em `project_central_renovacao_navegador.md`. Tarefa pega e sem resposta em 5 min vira erro (`/proxima`); `sem_tarefa` = só credenciais (tela de login/bloqueio).

## Estado (15/10/2026)
- ✅ Testado via fila contra o POP real (js-painel local na porta 3055): leitura por MAC (1 s, com login), criar/editar/apagar em MAC de teste `AA:BB:CC:00:00:01` (apagado no fim), recusa por MAC errado.
- ✅ Migração de DNS feita (Jonas rodou o script — o modo automático bloqueia o Claude de enviar migração): cdn4k/conecta5→pfun.store, monitor3/blushes→chdef.site, techonline/conectajs→hboard.site, bandeiraf→ligaf.me. Conferido: 28 listas migradas certas, 39 intactas, 0 alteradas indevidamente. Cópia antes: `~/.local/share/js-robo/backups/pop_listas_20261015_antes_migracao_dns.json` (tem senhas de cliente, pasta 700).
- 5x52.world e https://ennai.top: Jonas confirmou que são da Central → cadastrados na aba Hosts como secundários (ids 30/31); script de migração para pfun.store pronto (`migrar_pop_central.sh` na pasta temporária da sessão), Jonas ainda não rodou em 15/10. Sobra xc.s-dns.org (1 lista, inativo, sem servidor).
- ✅ Serviço `js-robo` (systemd --user, `robo-navegador/js-robo.service` com link em ~/.config/systemd/user, `iniciar.sh manter`): sobe com a sessão do Jonas e reabre o que cair; desligar pelo botão fecha o Chrome limpo.
- ✅ "Migrar endereço" do POP em Conexões (migrar-host.ts → ação `migrar_dns`, que conta as listas do endereço antes).
- ✅ Em produção desde 15/10/2026 (`aa41c58`, deploy pelo Jonas): `config.js` aponta para `https://painel.jssistemas.online`, leitura por MAC conferida pela fila de produção.
- 📋 Falta: testar a tela (Atualizar/+/editar num aparelho POP de cliente); Raspberry Pi opcional (Pi 4 4 GB+/Pi 5, Raspberry Pi OS + HA em Docker); Duplecast no mesmo robô.

- 15/10/2026: Atualizar em lote nos 57 aparelhos POP (todos com lista agora, 63 listas ligadas a conta); apagadas no POP as listas sem conta de Lucas Mateus Venancio, Vanderlei Wobeto (assinaturas vencidas em setembro) e JS Contas (xc.s-dns.org, teste) — os aparelhos seguem cadastrados no js-painel sem lista.

## Operação — pegadinhas (15/10/2026)
- Mudou `config.js` (URL do js-painel) ou o manifesto: reiniciar o serviço NÃO basta — a parte de fundo continua com o valor antigo ("Failed to fetch"). Clicar em **Atualizar** em chrome://extensions do robô. A janela muda de posição na tela virtual: fotografar antes (`iniciar.sh foto`) e mirar o botão; um clique em "Carregar sem compactação" abre o seletor de pasta NA TELA DO JONAS.
- Pra testar sem deploy: js-painel local (`next dev -p 3055`, mesmo banco) e `config.js` em `http://localhost:3055`; pedidos da tela de produção continuam atendidos (mesma fila no banco). Voltar pra produção depois do deploy.
- Consulta ao banco travando sem erro = túnel 5433 zumbi: matar e recriar (`ssh -f -N -o ServerAliveInterval=15 -L 5433:localhost:5432 root@168.231.98.162`).

## Incidente 19/10/2026 — Central e FAST paradas ~10 min após ligar o PC
- PC ligou 07:10:19, `js-robo` subiu 07:10:26, rede só 07:10:33. O Chrome reabriu as abas sem internet: Central ficou no /lock (botão não liberou em 40 s), FAST no login com token velho ("Sua sessão expirou"). Cada uma caiu na espera fixa de 10 min, e tentava de novo **na mesma página velha**. Pedidos das 07:15 (Central vanderleif/thiagdt/sandrads, FAST e54487frp/bgk92615 +29 dias) expiraram sem execução — nenhum crédito gasto. Voltaram sozinhas 07:21–07:22.
- Correção (só no robô, local, sem deploy): `iniciar.sh` espera a internet (até 2 min) antes de abrir o Chrome; FAST e Central: 1ª falha espera 1 min, depois 10 min, e a nova tentativa é sempre numa página recarregada (contadores em sessionStorage, zerados ao entrar). Conferido com `iniciar.sh reiniciar`: 4 sites "aguardando" em ~20 s.
- `e2418b8` (19/10, ✅ em produção): o /proxima grava `robo_status.sem_sessao_desde` (sql/030, aplicada) quando o robô avisa `sem_tarefa`; `executarNoRobo` recusa na hora com aviso se estiver preso no login/bloqueio há mais de 45 s (limite: desbloqueio normal leva ~10–20 s; abaixo disso o pedido entra na fila como antes).
- 📋 Renovações que expiraram no incidente, a refazer pela tela: Central vanderleif, thiagdt, sandrads; FAST e54487frp, bgk92615.

## 19/10/2026 — POP espera a verificação do Cloudflare (`a6ad7f5`, extensão 1.4.1)
- **Antes:** o 403 (cf_clearance vencido) recusava o pedido na hora ("tente em 1 minuto"), e a 2ª tentativa passava depois de ~1–2 min (casos em 15, 16 e 19/10).
- **Agora:**
  - o robô guarda a tarefa em sessionStorage (`robo-pop-pendente`), vai para `users.php`, o navegador refaz o desafio e a tarefa é repetida uma vez;
  - só repete se nada foi gravado no POP antes do 403 (flag `escreveu`; o login não conta), para não duplicar lista;
  - descarta a tarefa guardada depois de 3 min;
  - o painel espera o POP por 4 min (`executarNoRobo`).
- Extensão já recarregada no PC (`iniciar.sh reiniciar`); consulta real ok. 📋 O caminho do 403 em si ainda não foi visto acontecer.
