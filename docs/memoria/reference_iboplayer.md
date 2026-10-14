---
name: reference_iboplayer
description: IBO Player (id_app 8) — revenda IBOSOL (multi-app) + site do cliente tvplayeribo.com com captcha de imagem lido pelo Claude; endpoints, chave mascarada, limites
metadata:
  type: reference
---

# IBO Player no js-painel (13/10/2026)

Código: `src/lib/painel-adapters/iboplayer.ts` (API) e `src/lib/iboplayer.ts` (regras/banco). Painel em
`painel_servidores` id 109, tipo `iboplayer` (`sql/019`; senha preenchida pelo Jonas em Conexões).

## Revenda IBOSOL — ibosol.com (API backend-apis.ibosol.com)
- Atende ~24 apps (IBO Player = app_id 1 / módulo "IBOPLAYER"; também Virginia, Duplex, BOB…). Só o IBO
  Player foi integrado (pedido do Jonas); os outros ficam pra depois.
- Login `POST /api/login {email,password,captcha_token,device_token:"",remember:true}` — Turnstile sitekey
  `0x4AAAAAACJ-DZrldbwqTtbg` (CapSolver). Token opaco (Bearer), validade não informada: guardado 12 h, 401 → reloga.
  Rate limit do login: 10.
- `POST /api/check-device-status {macAddress, app_id:1}` → status active/expired, `expire_date`, `last_seen`
  (vira "Acessou"), `app_type`. ⚠️ **`device_key` vem MASCARADO ("******")** — nunca usar como chave.
  `playlists` só traz as listas cadastradas PELA REVENDA (as do cliente não aparecem).
- `POST /api/activated-apps-list` (paginado) — aparelhos ativados pela revenda (id do registro, comment).
- `POST /api/get-multi-app-activate {module:{selectedModule:"IBOPLAYER"}, requestData:{is_trial:3, macAddress,
  appType:"single-app", email, creditPoints:1, isConfirmed:true, app_id:1}}` — 1 crédito = 1 ano (vitalício = 2).
  Ainda não usado de verdade.
- `POST /api/update-comment {id, comment}`. Troca de endereço: `count-playlist-domain` + `update-playlist`
  (`change_scope:"all"`), só alcança listas da revenda.
- Existe "API Key" de revendedor no painel (controlada pelo admin/pai, permissão Api-Control) — sem doc
  pública; pedir ao suporte se quiser acesso sem captcha.

## Site do cliente — tvplayeribo.com
- `GET /frontend/captcha/generate` → `{svg, token}`: 2 caracteres cinza contornados em fundo preto; a tag
  `<svg>` repete `height` e os glifos passam do viewBox. **CapSolver ImageToText erra** ("pipj" para "BR");
  o js-painel converte (sharp, fundo branco, viewBox esticado) e **o Claude (haiku) lê** — entrou de 1ª.
- `POST /frontend/device/login {mac_address, device_key, captcha, token}` → JWT de 1 dia. Rate limit 20.
- `GET /frontend/device/playlists`, `POST /frontend/device/savePlaylist` (com `current_playlist_url_id` edita),
  `DELETE /frontend/device/deletePlayListUrl/{id}` (body `{pin}`), `POST /frontend/device/saveParentPin`.
- Também existe `/frontend/qr/addPlaylist {identifier, …, captcha, token}` (pelo QR da TV, sem chave) — não usado.
- A resposta de playlists expõe dados de pagamento do próprio site (falha deles) — ignorar.

## No js-painel
- Sync: ativados da revenda + consulta 1 a 1 dos IBO Player ativos; validade, último acesso; cria os que faltam
  sem cliente; nome do cliente no comentário vazio. Não lê listas.
- Atualizar / Renovar (/alertas, trava de 40 dias) / listas sob demanda (`playlist_id_externo` = últimos 12 hex).
- 13/10: 1º Atualizar gravou "******" por cima da chave real do Paulo (#1412) — corrigido (máscara ignorada) e
  restaurado. Outros 43 IBO Player já tinham "******" de antes: limpos (chave NULL). Sem chave real, listas não
  funcionam — pedir a chave que aparece na TV.

📋 Pendente: 1º Renovar real; conferir `sharp` em produção (vem com o Next) na 1ª leitura de lista.

## IBO Xplayer (id_app 34) — 13/10/2026
- Na IBOSOL é o app **IBOXXPLAYER** (`app_id` 13, módulo `IBOXXPLAYER`); site do cliente **iboxxiptv.com**.
- 24 cadastros estavam como IBO Player com "Xplayer" na observação → movidos pro id_app 34 (`sql/020`).
  O sync de 13/10 deu "73 não encontrados" por isso: o `check-device-status` com app_id 1 não acha MAC de outro app.
- Mapa em `IBOSOL_POR_ID_APP` (`apps-painel-ids.ts`); sync, Atualizar, Renovar e listas atendem os dois apps.
- Site do cliente: mesmo login e captcha do tvplayeribo; diferenças nas listas (sempre com `device_id` = `device._id` do login):
  ver = POST `/frontend/device/playlists`; criar = POST `savePlaylist` com `current_playlist_url_id: -1`;
  editar = PUT `/frontend/device/editPlaylist/{id}`; apagar = DELETE `deletePlayListUrl/{id}` (resposta `status: "playlist deleted successfully"`).
- Testado: Atualizar do #2584 (Jose Rosa AM) leu validade + lista. Criar/editar/apagar pelo sistema ainda sem teste real.
- "Migrar endereço" do painel IBOSOL troca nos dois apps (uma chamada por app_platform/app_id; contagem conferida 13/10). BOB Player (BOBPLAYER, app_id 3): 2 cadastros com "BOB" na observação, app ainda não existe no banco.
- Sync: "Device not found" conta como não encontrado (não falha); MAC fora do formato conta à parte.

## Card de /conexoes "Sem conexão" — 14/10/2026 (corrigido)
- A IBOSOL derruba o token antes das 12 h que guardamos (401). O resto do sistema relogava via `comIbosol`,
  mas o adapter do card (`criarIboPlayerAdapter`) não: reusava o token morto e o "Atualizar" dava "Sem conexão" até o prazo salvo vencer.
- Agora o adapter reloga uma vez no 401, com login compartilhado entre aparelhos e créditos (pedidos em paralelo → 1 captcha só,
  e um login não derruba o token do outro). Testado local contra o painel 109: 13 aparelhos, 3 créditos.
