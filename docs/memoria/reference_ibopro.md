---
name: reference_ibopro
description: IBO Player Pro (id_app 7) — painel de revenda + site do cliente, endpoints, assinatura dos cabeçalhos, limite de login por IP
metadata:
  type: reference
---

# IBO Player Pro no js-painel (13/10/2026)

Tráfego capturado com o Jonas navegando (Playwright). Código: `src/lib/painel-adapters/ibopro.ts` (API) e
`src/lib/ibopro.ts` (regras/banco). Painel em `painel_servidores` id 108, tipo `ibopro` (`sql/018`; senha
preenchida pelo Jonas em Conexões, nunca no repo).

## Painel de revenda — cms.iboproapp.com (API api.iboproapp.com)
- `POST /admin/login {username,password}` → `accessToken` (JWT, `exp` em **milissegundos**, ~2,4 h). Sem captcha.
- `GET /admin/me` → `credits`. `POST /admin/statistics`.
- `POST /admin/devices/paginate {page,limit,sort,filter:{mac_address,app_type:"all",paid:false,name:""}}`
  → aparelho: `id` (hex), `mac_address`, `is_paid` "1"/"0", `expire_date` (UTC), `name`, `note`, `app_type`.
- `POST /admin/devices/info {mac_address}` — acha também aparelho fora da revenda.
- `POST /admin/devices/update-additional` — objeto inteiro do aparelho com `name` trocado.
- `POST /admin/devices/activate {mac_address,tier:"YEAR",isPaid:true,expireDate,name,note}` — **1 crédito = 1 ano
  somado à validade atual** (Fabricio 18/10/2026 → 18/10/2027). ⚠️ `name:""` APAGA o nome: o js-painel manda o nome.

## Site do cliente — iboproapp.com/manage-playlists
- `POST /auth/login {mac,password}` — senha = **chave do aparelho** (`aplicativos.chave`). Token vale 10 dias.
- `POST /me` (isActive, expiration). `GET /playlistw`. `POST /playlistw` (nova: `playlist_id:null`; edição: id).
  `DELETE /playlistw {mac_address,playlist_id}`.
- Cada pedido leva 6 cabeçalhos (`x-token`, `x-token-2`, `x-token-3`, `x-hash`, `x-hash-2`, `X-Gc-Token`)
  calculados no navegador (base64 + "iBo"/"PrO" + hora). Reproduzidos em `cabecalhosCliente`; conferido
  contra cabeçalho real.
- ⚠️ **Limite por IP: ~10 logins → "Too many requests!" com retry-after ~24 h.** O 1º sync (que lia as listas
  de todos) bloqueou o IP de casa em 13/10. Por isso o sync só lê a revenda; listas só sob demanda por aparelho
  (Atualizar/editar), com token guardado em memória.

## No js-painel
- Sync (Conexões): validade/painel de todos, cria os que faltam sem cliente, grava nome do cliente no aparelho
  sem nome; aparelho fora da revenda fica sem painel (validade mantida).
- /alertas: Renovar (1 crédito, trava de 40 dias). Atualizar: revenda, com fallback pro site do cliente.
- Listas: `playlist_id_externo` = últimos 12 hex do id da lista (coluna é bigint); sem "lista ativa".
- `id_dispositivo_painel` fica NULL (id do aparelho é hex); tudo pelo MAC.

## Migração em massa de endereço
- `POST /admin/playlists/mass-change-hostname {old,new}` → `totalUpdated` (aceita porta). Sem login no site do cliente.
- Botão "Migrar endereço" no card de Conexões (mesma tela do SmartOne: `src/lib/migrar-host.ts`,
  `MigrarHostModal`). SmartOne: formulário `/plugin/smart_one/client_main/hostname/` (`from_server_host`,
  `to_server_host`, `server_type=all`, csrf) → "Successfully Updated on N playlists"; **sem porta** (o "Mass change
  PORT" do site não foi capturado). Fun/Lazer/Core: o antigo botão "Servidores" virou "Migrar endereço".

## Histórico
- `29038d8` — integração (sync, Renovar, Atualizar, listas sob demanda). `sql/018` aplicada.
- `9a965d3` — 1º uso real de editar lista (Elton Alf, 13/10, produção): o IBO foi alterado, mas a tela e o banco
  ficaram com a URL antiga, porque o `GET /playlistw` logo após o POST ainda devolve a versão velha. Agora o
  banco grava a lista que o próprio POST devolve e a tela recarrega depois de editar.
- Sync de 13/10: 124 aparelhos na revenda, 9 criados sem cliente (ex-clientes), 6 fora da revenda (3 ativos:
  Jhayro IPTV 19, Maicon Rodrigues, Wellington Martins IPTV — ativados por outra conta).

📋 1º uso real pendente: Renovar pela tela (próximo a vencer: Leo Gelatti, 29/10/2026). Conferir que a edição
de lista aparece na hora depois do deploy do `9a965d3`.
