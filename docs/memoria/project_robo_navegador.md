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
- 403 eventual do Cloudflare numa chamada: o robô devolve erro e recarrega a página; repetir em ~1 min resolve.

## Duplecast (15/10/2026)
Mesmo robô, janela própria (background.js mantém uma aba de trabalho por site; janela, não aba de fundo, porque aba escondida tem timers freados). Detalhe em `reference_duplecast_revenda.md`.

## Estado (15/10/2026)
- ✅ Testado via fila contra o POP real (js-painel local na porta 3055): leitura por MAC (1 s, com login), criar/editar/apagar em MAC de teste `AA:BB:CC:00:00:01` (apagado no fim), recusa por MAC errado.
- ✅ Migração de DNS feita (Jonas rodou o script — o modo automático bloqueia o Claude de enviar migração): cdn4k/conecta5→pfun.store, monitor3/blushes→chdef.site, techonline/conectajs→hboard.site, bandeiraf→ligaf.me. Conferido: 28 listas migradas certas, 39 intactas, 0 alteradas indevidamente. Cópia antes: `~/.local/share/js-robo/backups/pop_listas_20261015_antes_migracao_dns.json` (tem senhas de cliente, pasta 700).
- 5x52.world e https://ennai.top: Jonas confirmou que são da Central → cadastrados na aba Hosts como secundários (ids 30/31); script de migração para pfun.store pronto (`migrar_pop_central.sh` na pasta temporária da sessão), Jonas ainda não rodou em 15/10. Sobra xc.s-dns.org (1 lista, inativo, sem servidor).
- ✅ Serviço `js-robo` (systemd --user, `robo-navegador/js-robo.service` com link em ~/.config/systemd/user, `iniciar.sh manter`): sobe com a sessão do Jonas e reabre o que cair; desligar pelo botão fecha o Chrome limpo.
- ✅ "Migrar endereço" do POP em Conexões (migrar-host.ts → ação `migrar_dns`, que conta as listas do endereço antes).
- ✅ Em produção desde 15/10/2026 (`aa41c58`, deploy pelo Jonas): `config.js` aponta para `https://painel.jssistemas.online`, leitura por MAC conferida pela fila de produção.
- 📋 Falta: testar a tela (Atualizar/+/editar num aparelho POP de cliente); Raspberry Pi opcional (Pi 4 4 GB+/Pi 5, Raspberry Pi OS + HA em Docker); Duplecast no mesmo robô.
