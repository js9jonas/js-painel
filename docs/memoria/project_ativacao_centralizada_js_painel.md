# Intenção: ativações e cadastros de clientes 100% dentro do js-painel — registrado 08/10/2026

📋 Sem data. Pedido do Jonas: fazer as **ativações de aplicativos (FunPlay/LazerPlay…) e o cadastro de novos clientes
inteiramente pelo js-painel**, pra centralizar o trabalho (hoje ele alterna entre o site do painel de revenda e o
js-painel).

## O que o Jonas já sabe do fluxo atual (ponto de partida)
- **Aparelho recém-instalado**: ele usa uma **página de cadastro** e só consegue colocar o aparelho no painel via
  **ativação** (não via "add existing device").
- **"Add existing device" NÃO funciona em aparelho no período grátis (7 dias)** — só pra aparelho já pago/ativado
  antes. (Por isso a migração de 08/10 anota falhas em vez de parar no modo `vencidos`.)
- Ativar = `POST /reseller/activate` (já existe no adapter: `ativarDispositivo` em `appacesso.ts`, usado por
  `renovar`). Comentário = `PUT /reseller/device/comment`; mover = `POST /reseller/add_existing_device {mac,key}`;
  checar = `GET /reseller/validate_mac` (endpoints capturados 08/10 — `project_funplay_dois_paineis.md`).

## A levantar antes de implementar (não assumir — capturar no painel com o Jonas operando)
- Qual é a "página de cadastro" do aparelho novo e o que ela faz por trás (endpoint, se pede captcha).
- Formato exato do `/reseller/activate` (pacotes `/reseller/packages`, `activation_packages`), custo em créditos,
  e o que acontece com aparelho em período grátis.
- Fluxo desejado na tela: cliente novo → aparelho (MAC/chave, inclusive da leitura de imagem do /chat) → ativar →
  comentário = nome → vínculo no js-painel, tudo num lugar só. Ações com custo real: confirmação explícita
  (regra: nunca gastar crédito em teste sem perguntar).

## Atualização 11/10/2026 — endpoints confirmados pelo código do site (main.b0256ef8.js, igual em FunPlay/LazerPlay/CorePlayer)
- **Correção do Jonas:** "add existing device" **funciona** em aparelho novo. Depois dele o painel não mostra validade; no aparelho aparece ~1 mês (cortesia dos devs, não confiável) → por isso ativar logo em seguida.
- **Ativar:** `POST /reseller/activate { mac, package_id, comment? }`. `GET /reseller/packages` (FunPlay 106) tem um único pacote: id 1 "Anual", `activation_needed: 1` (1 crédito). O `ativarDispositivo` do adapter já manda `package_id: 1`; o `comment` opcional preenche o nome do cliente na mesma chamada.
- **Add existing:** `POST /reseller/add_existing_device { mac, key }` quando `auth_type === "device_key"`; se for `"otp"`, o fluxo é `GET /reseller/activation_code` e depois o código da TV `{ code, mac }`.
- **Migração em massa ("Server Migrate"):** `GET /reseller/server` lista os "servidores" do revendedor (FunPlay 106: id 2317, nome FAST, host `http://bandeiraf.vip`, code `fastjsx`, 276 aparelhos, criado 11/10 18:06 BRT pelo Jonas). Migrar: `PUT /reseller/server/migrate { id, host, replace }`, com `replace` = checkbox "Migrate Playlists" (padrão marcado). Criar servidor: `POST /reseller/server { host, name, code?, external_api? }`. Histórico/pendências: `GET /reseller/server/actions` (vazio). Existe também "Free DNS" (`PUT /reseller/free_dns/migrate { to, replace, id }`), que não é o que o Jonas usa.
- ⚠️ As 245 listas `ligaf.me` criadas em 11/10 não estão em nenhum "servidor" do painel. Pra conseguir migrá-las em massa depois, provavelmente é preciso cadastrar um servidor com host `ligaf.me` (não testado).
- `GET /reseller/servers` (plural) dá 404; o certo é `/reseller/server`.

## Implementado 11/10/2026 — ✅ Jonas testou a tela e aprovou; falta testar com um aparelho novo real
- Decisão do Jonas: cadastro novo = **só add existing + lista, sem gastar crédito** (quase sempre é teste). Ativação só quando o cliente assinar.
- Modal "Novo Aplicativo" (tela do cliente e /chat): ao escolher Fun Play/Lazer Play/Core Player, opção "Cadastrar no painel do app" (marcada) + escolha da conta da lista → `POST /api/aplicativos/cadastrar-painel` (job): validate_mac → add existing → nome no comentário → `aplicativos` (reaproveita registro removido ou órfão sem cliente) → lista ativa da conta (`aplicativo_playlists.id_conta`) + `audit_log`.
- /alertas "Aplicativos expirando": app desses 3 painéis sem validade aparece como se vencesse hoje, selo "Precisa ativar" (aparece até no filtro padrão "com contrato") e botão **"Ativar no painel"** (2 cliques, 1 crédito) → `POST /api/aplicativos/[id]/ativar-painel` (job). Se o painel já mostra validade > 40 dias, não ativa de novo (só copia a data). Validade gravada = a do painel.
- Lacuna achada: antes disso o js-painel **não ativava app no painel**; o "+1 ano" de /alertas e o renovar de app só gravam a data no banco.
- Base comum: `src/lib/app-painel.ts` (painel ativo por app, sessão com captcha, lista ativa), `src/lib/apps-painel-ids.ts` (ids 3/2/31, sem servidor), `validarMac`/`buscarDispositivoPorMac` em `appacesso.ts`.

## Servidores de lista + migração em massa no js-painel (11/10/2026, local, aguardando teste do Jonas)
- /conexoes → aba Painéis de Aplicativo → botão **"Servidores"** nos cards Fun Play/Lazer Play/Core Player: lista (com recontagem), cadastrar (nome + host + código), **Migrar** (novo host + "Levar as listas junto", revisão e confirmação em 2 passos). Rota `/api/paineis/servidores/[id]/servidores-app`; auditoria tipo `servidor_app`.
- **Descoberto:** a contagem de aparelhos do servidor é **por host**, mas só se atualiza com `PUT /reseller/server/sync_device_count { id }` (a tela reconta sozinha).
- **Feito a pedido do Jonas:** FAST do FunPlay (id 2317) migrado `bandeiraf.vip` → `ligaf.me` com `replace:false` ("Server is updated"). Lista do Miguel (bandeiraf) intacta; recontado = **245** (exatamente as `ligaf.me` do lote). As `bandeiraf.vip` (inclusive ocultas) ficaram fora de qualquer servidor, de propósito.
- ⚠️ Cuidado ao criar servidores pros outros hosts (Central `pfun.store`, Uniplay `chdef.site`…): as ocultas desses servidores provavelmente ainda estão no host original e passariam a contar (e migrar) junto. LazerPlay 107 não tem nenhum servidor (11/10).
