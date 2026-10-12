---
name: project-funplay-listas-invisiveis
description: "FunPlay não mostra no site (nem na API) as listas que os clientes usam de fato (ocultas). Contorno em uso desde 11/10/2026: migrar as ocultas de cada servidor para um host secundário e recriar as listas no host principal — FAST e Central feitos, Uniplay em andamento"
metadata:
  type: project
---

## Andamento por servidor (Fun Play 106) — atualizado 11/10/2026

Procedimento: (1) Jonas cadastra o servidor no painel com o host principal e migra para o host secundário **levando**
as listas (ocultas saem do principal); (2) script devolve ao principal as listas visíveis conhecidas e cria
"<PrimeiroNome> TV" (marcada ativa, gravada em `aplicativo_playlists` com `id_conta`) nos aparelhos de clientes
com uma única conta daquele servidor; (3) casos com várias contas: triagem por observação do aparelho/rótulo da
conta, Jonas aprova; (4) Jonas migra o servidor de volta ao principal **sem** levar as listas. Hosts registrados na
aba Hosts de /conexoes (tabela `servidor_hosts`).

| Servidor | Principal | Ocultas em | Situação |
|---|---|---|---|
| FAST | ligaf.me | bandeiraf.vip | ✅ 245 listas (209 + 36) |
| Central | pfun.store | bandeira5.info | ✅ 9 devolvidas + 128 únicas + 22 várias contas; servidor de volta no principal |
| Uniplay | chdef.site | monitor3.cfd | 🔄 11/10: 4 devolvidas, 182 únicas e 42 de várias contas rodando; falta Jonas voltar o servidor para chdef.site sem levar listas |
| NOW, Lazer Play, Core Player | — | — | 📋 a fazer |

- Uniplay: `blushes.top` é do próprio servidor mas já é padrão em outro painel — usar na migração do Fun Play dá erro; por isso as ocultas foram para `monitor3.cfd`.
- Ficaram sem lista os clientes com várias contas sem indicação de qual vai em cada aparelho (Central: 19 clientes; Uniplay: 19) — ficam para quando o cliente pedir.
- Sessão do painel 106 dura ~1 h; script espera e relê o token quando o Jonas renova pela produção.
- **Não fazer `source` do `.env.local`** ao rodar scripts/dev local (CRLF quebra os valores) — passar só `DATABASE_URL` limpa.

## Problema (03/10/2026)

Só **27 de 937** apps Fun Play ativos têm lista em `aplicativo_playlists` (sync diário de `sync-aplicativos`, último 03/10 00:00 BRT — dado atualizado). Mas os clientes usam o app normalmente em casa: **o site/API do FunPlay não exibe a lista que está em operação**, então o sync não tem o que gravar. Ao tentar cadastrar a mesma URL, o site responde que **a lista já existe** e recusa. Jonas suspeita de falha do sistema FunPlay; o suporte deles não resolve.

Comparação (apps com lista): Smartone 480, Fun Play 27, POP Player 21, Lazer Play 7, Core Player 7.

## Contorno validado à mão (03/10) — cliente Evair Volnei Brune, MAC a1:58:61:86:e3:fb

1. Cadastrou a lista com **outra URL** (aceita).
2. Ferramenta de **migração em massa** do próprio site FunPlay → trocou para a URL principal (a que era recusada como "já existe").
3. Resultado: a lista passou a aparecer no painel com a URL real. Suspeita (não confirmada): no app do cliente ela pode aparecer **2x** em Listas.

## Plano original do Jonas (04/10/2026) — substituído pelo procedimento por servidor (ver "Andamento por servidor")

Script que, para cada app Fun Play ativo **sem lista** cujo cliente tem **exatamente 1 conta ativa**, cria uma playlist com **URL fictícia** que identifique o servidor; depois Jonas usa a migração em massa do site: fictícia → URL principal do servidor. Clientes com 2+ contas ficam de fora (não dá pra saber qual conta vai em qual aparelho).

Base técnica já existente: `criarPlaylist()` em `src/lib/painel-adapters/appacesso.ts` (FunPlays/LazerPlay usam a mesma API).

Pontos a confirmar antes de rodar em massa:
- **O que a migração em massa troca:** só o domínio ou a URL inteira? Cada lista tem usuário/senha próprios (`http://<domínio>/get.php?username=…&password=…&type=m3u_plus&output=ts`). Se troca só o domínio, a URL fictícia deve levar o usuário/senha reais da conta com um domínio fictício por servidor (ex.: um por Central/FAST/Uniplay). Se troca a URL inteira, não serve pra várias contas.
- Confirmar no aparelho do Evair se a lista aparece duplicada no app.
- Rodar primeiro um relatório (dry-run) de quem entra/sai, depois um lote pequeno, com pausa entre chamadas.

## Playlist ativa (09/10/2026, commits ba4038c + 5e64444) — ✅ em produção, Jonas confirmou funcionando
- Endpoint capturado no LazerPlay com o Jonas operando (Playwright): `PUT /reseller/playlist/set_selected { id }` → "Success";
  mesmo bundle (`main.b0256ef8.js`) no FunPlay e no CorePlayer. Só o id da playlist, sem deviceId.
- js-painel: menu ▾ da playlist → "★ Marcar como ativa" + selo ATIVA (`?acao=selecionar` na rota de playlists); a rota
  relê as playlists no painel e só grava `is_selected` se a escolhida voltou como ativa. SmartOne não tem.
- Observado: playlist recém-criada pelo revendedor nasce `is_selected:false` mesmo sendo a única, e vem com
  `added_by_web:false`. Pra marcar como ativa num aparelho com lista invisível, Jonas teve que cadastrar a lista de novo
  primeiro (as invisíveis não aparecem pra escolher). Não se sabe se o set_selected desmarca as invisíveis.
- 09/10 (2º commit): ao **criar** playlist no appacesso, se ela for a única visível no aparelho, já manda o set_selected e
  confere relendo; se não confirmar, o modal fica aberto com aviso âmbar ("criada, mas não deu pra marcar como ativa") —
  pedido do Jonas, que aprovou avisar em vez de falhar calado. Corrigido junto: depois de criar, a lista ao vivo da tela
  não era recarregada (a playlist nova só aparecia após recarregar a página).

## Levantamento FAST (11/10/2026)
- Banco tinha só 10 listas Fun Play (Central 6 `pfun.store`, Uniplay 3 `chdef.site`, FAST 1 `bandeiraf.vip`) — eram 27 em 03/10; queda não investigada (talvez migração 100→106).
- `aplicativos.id_conta` está vazio em todos os Fun Play; ligação app→conta só dá pelo cliente (app → cliente → assinatura → conta).
- Clientes sem ambiguidade (1 assinatura viva, 1 única conta não removida = FAST, Fun Play ativo sem lista): **212** com 1 aparelho + 17 com 2+ aparelhos na mesma conta. Relatório: https://claude.ai/artifact/2zkScd22Ew8XXSgGdDpWLc
- **11/10/2026 cadastro em massa** (pedido do Jonas, domínio `ligaf.me`, nome "<PrimeiroNome> TV", marcada como ativa, gravada em `aplicativo_playlists`): ✅ **209 de 209 concluídos** + 36 aparelhos dos 17 clientes com 2-3 Fun Play na mesma conta FAST (todas marcadas como ativa, gravadas no banco) — 245 no total. A URL real foi **aceita** (sem o "já existe" de 03/10). Limites encontrados: FunPlay devolve "Too many requests" com ~1 chamada/1,2 s (com 4 s + nova tentativa passou); a `CAPSOLVER_API_KEY` do `.env.local` local está inválida ("clientKey is invalid"), então não dá pra renovar a sessão do painel 106 daqui — depende da sessão renovada pelo js-painel em produção. Script temporário apagado ao final. Cliente com `bandeiraf.vip`: Miguel Angelo (#255).

## Estratégia do Jonas — domínio separado para as ocultas (11/10/2026)
- Jonas usou a **migração de URL em massa** do painel FunPlay para mandar todas as listas (visíveis e ocultas) para `bandeiraf.vip`. As ocultas só aparecem na guia Listas do app no aparelho e não dá pra apagá-las remotamente.
- A partir daí, lista avulsa nova usa **outro domínio** (`ligaf.me`), que nunca bate com a oculta: o FunPlay não recusa como "já existe" e o cliente não precisa apagar nada à mão.
- A migração em massa também serve pra trocar o domínio de todas as listas quando uma URL dá problema. Conferido ao vivo: as listas `ligaf.me` criadas no lote de 11/10 **não** foram afetadas pela migração.
- 📋 Próximo (sem data): Jonas vai operar a migração em massa com Playwright aberto pra capturar o endpoint e trazer a função pro js-painel.

## Ideia do Jonas (11/10/2026): lista nova recusada por "já existe" (lista oculta no mesmo host)

Quando cadastrar uma lista e o painel do app recusar porque já existe uma igual (oculta) no aparelho, limpar via
migração do servidor daquele host (Servidores em /conexoes, ou `PUT /reseller/server/migrate`):

1. Migrar o servidor para o host da lista, **sem** "levar as listas" — só para o servidor apontar para esse host.
2. Migrar para um host **secundário com** "levar as listas" — tudo que está naquele host, inclusive a oculta, sai dele.
3. **Antes do passo 4**, voltar por API (`PUT /reseller/playlist`) as listas visíveis que o js-painel conhece para o
   host principal. O passo 2 leva também as listas boas, e sem isso elas ficariam no secundário. Foi o que se fez com a Central em 11/10:
   9 listas devolvidas.
4. Migrar de volta para o host principal **sem** levar as listas — as ocultas ficam no secundário e o cadastro da
   lista nova passa.

Ainda não usado neste formato (ideia registrada). Mesmo procedimento já aplicado em lote no FAST (bandeiraf.vip) e na
Central (bandeira5.info).

## 🔑 Achado do Jonas (12/10/2026): o site do CLIENTE mostra e apaga as listas ocultas

Capturado com Playwright no site do cliente do Lazer Play (`lazerplay.io/#/playlists`, API `api.lazerplay.io`); o Fun Play deve ter o mesmo (`api.funplays.app/api/...`, mesma plataforma) — **conferir**.
- `GET /api/validate_mac?mac=` → `{payed, free_trial, auth_type:"device_key", id, model...}`
- `POST /api/login_by_mac {mac, key}` → token de aparelho (JWT `type:"web_device"`). `key` = **chave do dispositivo** (a mesma de `aplicativos.chave`). Sem captcha no corpo (`GET /api/captcha` voltou vazio).
- `GET /api/device` (Bearer do aparelho) → aparelho com **todas** as playlists, inclusive as ocultas do painel de revenda. As que o revendedor criou vêm com `reseller_id` = nosso id (8448); as ocultas vêm com `reseller_id: null`.
- `DELETE /api/palylist_from_web {id}` (sic, "palylist") → `"Deleted"`. Jonas apagou assim uma lista oculta para liberar o cadastro pelo painel.
- Consequência: dá para ver e apagar as ocultas de qualquer aparelho cuja chave temos, sem precisar do cliente nem da migração de servidor. ⚠️ A resposta traz usuário/senha das listas: não registrar em log nem em memória.
