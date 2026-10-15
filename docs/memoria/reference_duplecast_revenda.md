---
name: reference-duplecast-revenda
description: Duplecast — fluxo de ativação pela revenda capturado em 15/10/2026 (formulários server-side com CSRF, atrás do Cloudflare); base para um adapter no js-painel
metadata:
  type: reference
  modified: 2026-10-15
---

Capturado via Playwright em 15/10/2026, com o Jonas ativando o código `496673022266` no MAC `28:07:08:DD:7E:97` (pacote 1 Year, expira 15/10/2027).

Site `duplecast.com` (Blesta: `/client/...`), atrás do **Cloudflare** — no Playwright o desafio passou sozinho (1º GET dá 403 "Um momento…" e libera). Sem API JSON: tudo é formulário HTML com `_csrf_token`.

1. `GET /client/login` → pegar `_csrf_token` do form; `POST /client/login` com `_csrf_token, username, password, remember_me` → 302 para `/client/` (conta de cliente #3660, "Jonas Scheibe").
2. `GET /client/plugin/duplecast/client_codes/index/unused/` → códigos sem uso (link de ativar por código). Lista completa em `.../index/all/<página>/?sort=date_added&order=desc` (colunas: Code, Mac, Package, Date Added, Date Used, Expire). Em 15/10: 60 códigos, 59 usados, 1 livre (`417934857507`).
3. `GET /client/plugin/duplecast/client_codes/activate/<code>/` → form com novo `_csrf_token`; `POST` no mesmo endereço com `_csrf_token, mac, code` (MAC com dois-pontos) → 302 para `/client/plugin/duplecast/client_codes/` com alerta "Device ID Successfully Activated".

Playlists (painel de revenda, mesmo login), capturado em seguida:
- Lista: `/plugin/duplecast/client_playlist/` (também `/client/plugin/.../index/all/`).
- Adicionar: `GET` + `POST /client/plugin/duplecast/client_playlist/add/` com `_csrf_token, form_action=generate_m3u_playlist, mac, m3u_name, m3u_playlist (URL get.php), epg_url, note` → 302 para a lista. (Variante Xtream não capturada; no SmartOne é `form_action=generate_xtream_playlist`.)
- Editar: `POST /client/plugin/duplecast/client_playlist/edit/<id>/` com `_csrf_token, mac, server_name, server_host, server_port, server_username, server_password, note` — mesmo se adicionada como M3U, a edição é em campos Xtream.
- Excluir: `POST /plugin/duplecast/client_playlist/delete/<id>/` com `_csrf_token, 0=, submit=Yes`.

**Mesma plataforma do SmartOne** (`src/lib/painel-adapters/smartone.ts`, Blesta + plugin): ativação por código idêntica, edição com os mesmos campos `server_*`. Diferenças: prefixo `duplecast/client_playlist` × `smart_one/client_main` (`add_playlist`/`edit_playlist`/`delete_smartkey`); login do Duplecast **sem Turnstile** no form (SmartOne precisa do CapSolver).

Outras telas: `client_codes/buy/` (comprar via PayPal), `client_codes/transfer/`, `device_main/` (Manage Device).

⛔ **Teste 15/10/2026: chamada direta bloqueada.** O site inteiro está atrás de *managed challenge* do Cloudflare (`cf-mitigated: challenge`, página "Just a moment..."): `fetch` do desktop e `curl` da VPS, com ou sem cabeçalhos de navegador, levam 403 já no `GET /client/login`. Só um navegador real passa (no Playwright passou sozinho). Mesmo cenário do POP Player/CENTRAL — adapter server-side no molde do SmartOne não funciona.
No banco: app `id_app` 11 "Duplecast", 46 aparelhos ativos; sem linha em `painel_servidores`.
Caminhos (decisão do Jonas): navegador no desktop (Playwright/Tampermonkey) com IP residencial; ferramentas pagas anti-Cloudflare já foram recusadas em 13/10 para o POP Player.
