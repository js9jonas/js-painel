# FunPlay — dois painéis (antigo → novo) e chave real do aparelho — 08/10/2026

## Situação
- Jonas comprou um **painel FunPlay novo** (mesmo site `reseller.funplays.app`, outro login). Credencial só em
  `painel_servidores` (id **106**, "FunPlay (novo)"); a senha apareceu na conversa → **trocar ao fim da migração**
  e atualizar no banco. O antigo virou **"FunPlay (antigo)"** (id 100).
- A partir de 08/10 todo aparelho FunPlay novo é cadastrado no painel novo. Os com validade no antigo (≈925, validade
  até 12/2028) vão ser migrados por **script interno rodado 1 vez** (Fase 2).
- Comportamento do FunPlay (informado pelo Jonas): ao cadastrar o MAC no novo ("add existing device": MAC + chave),
  ele **sai do antigo** e a **validade vai junto**; o comentário (nome do cliente) chega como **"N/A"** e precisa ser
  preenchido de novo.

## Bug corrigido (commit 397602c, sql/014)
Desde 15/06/2026 (dc6c622) o sync de painéis de app (FunPlay/LazerPlay/CorePlayer/SmartOne) gravava o **número
interno** do aparelho na coluna `aplicativos.chave`, apagando a chave real da TV — a API sempre mandou `key`
(conferido ao vivo 08/10: 949/949 FunPlay, 364/364 LazerPlay, 7/7 CorePlayer). Daí a impressão de "chaves
rotacionadas". Nenhuma cópia sobrou (backups só 7 dias). Agora: `id_dispositivo_painel` = número interno (só pro
sistema, não exibir — pedido do Jonas), `chave` = chave real (recuperada no 1º sync), `chave_anterior`/
`chave_mudou_em` quando a chave mudar de verdade (responde se o FunPlay rotaciona). SmartOne não tem chave.

## Sync em família
Botão de sync de qualquer FunPlay lê **os dois painéis**; dono do MAC = painel que o lista (em dois, validade maior);
removido = não está em nenhum. Se um painel falhar no login/lista, nada é gravado.

## Endpoints capturados (08/10/2026, Playwright com o Jonas operando o painel novo)
- `PUT /reseller/device/comment` `{ comment, id }` — `id` = número interno do aparelho (não o id da nota).
- `GET /reseller/validate_mac?mac=` → `{ payed, id, auth_type, ... }`.
- `POST /reseller/add_existing_device` `{ mac, key }` → "Success". Nenhum pede captcha (só o JWT do login).
- Jonas confirmou: migrar **não gasta crédito**; validade e número interno vêm junto; comentário chega "N/A".

## Migração (script `scripts/migrar-funplay-painel-novo.mjs`, commit e143eb3)
- `listar` em 08/10: 924 a migrar (922 com cliente, 2 sem; 39 com playlist no banco).
- `testar 2` (Cleber Splendor, Samara Davila): validade/comentário ok, saíram do antigo, **playlists do antigo não
  aparecem no novo** (1→0, 2→0). Jonas: é o mesmo problema de listas ocultas que já havia no painel antigo
  (desconfia do master) — seguir sem recriar. Cópia das playlists em `lab.bkp_funplay_playlists_20261008` (41/39).
- `tudo` rodado em 08/10 ~23h30 (ver resultado abaixo).

## Próximos passos
- Jonas: deploy + sincronizar (qualquer card FunPlay; LazerPlay/CorePlayer/SmartOne também, pra recuperar chaves).
- ✅ Sync preenche comentário "N/A" com o nome do cliente (e143eb3, deploy pendente).
- Fase 2: capturar o endpoint do "add existing device" (Jonas adiciona 1 aparelho com a rede monitorada) → script único:
  lista prévia → teste com 2 → resto devagar → sync → relatório.
- Fase 3: painel antigo sem validade → `ativo = false`. Por último: trocar a senha do painel novo.
