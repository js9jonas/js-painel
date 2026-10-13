---
name: reference-clouddy-console
description: Clouddy (console.clouddy.online) — conta do CLIENTE, sem painel de revenda conhecido; endpoints capturados em 13/10/2026 pra futuro adapter
metadata:
  type: reference
  modified: 2026-10-13
---

Capturado via Playwright com o Jonas navegando na conta do cliente Sergio Antonio dos Reis (#1413) em 13/10/2026. **Não existe (que o Jonas saiba) conta de revendedor**: o adapter entra cliente por cliente com `aplicativos.mac` = e-mail e `aplicativos.chave` = senha da conta Clouddy.

Site de páginas (HTML + formulários), sem API JSON. Sem token CSRF nos formulários vistos. Sessão por cookie.

| Ação | Requisição |
|---|---|
| Login | `POST /user/auth/login` form-urlencoded: `form[email]`, `form[password]`, `cf-turnstile-response` (+ `g-recaptcha-response` com o mesmo valor) → 301 `/user/index` → `/user/dashboard`. **Cloudflare Turnstile** (CapSolver, igual SmartOne) |
| Validade | `GET /user/dashboard` — "Resumo": ID, Email, Estado ("Serviço ativo"), Depósito, Tarifa ("Annually 1"), Periodicidade, Custo ($2.00), Limite/Número de dispositivos, **Data de início do serviço** e **Data final do serviço** (`span.badge.badge-success`, formato `09/10/2027 18:51:06 -0300`) |
| Aparelhos | `GET /user/devices` — tabela ID, IP, DUID, Plataforma, **Última atividade** (`13/10/2026 08:27:50 -0300`); editar em `/user/devices/{id}/edit` |
| Lista TV | apagar `GET /user/tv-playlist/delete`; salvar `POST /user/tv-playlist/edit` multipart: `form[m3u]` (arquivo, vazio), `form[url]` (link `get.php?...&type=m3u_plus&output=ts`), `form[epg]` (vazio) |
| Lista VOD | apagar `GET /user/vod-playlist/delete`; salvar `POST /user/vod-playlist/edit` multipart: `form[m3u]`, `form[url]` |
| Senha da conta | `POST /user/profile/edit` form-urlencoded: `form[password]`, `form[pin]` (0000), `form[timezone]` (America/Sao_Paulo) |

- **Lista precisa ir em TV e VOD** (senão o cliente não vê todas as grades) — o adapter manda as duas.
- Ao salvar, o Clouddy reescreve o link para `xc://usuario:senha@servidor/` (formato Xtream Codes). Conferir lista comparando usuário/senha/servidor, não o texto do link. Página da lista mostra a credencial IPTV em texto — não logar.
- Outras páginas: `/user/tariffs`, `/user/payments`, `/user/transactions` (renovação ainda não capturada).

## Implementado 13/10/2026 (commit `a28e677`, ✅ em produção — Jonas confirmou "tudo certo" em 13/10/2026)

- Adapter `src/lib/painel-adapters/clouddy.ts` (login + Turnstile, resumo, última atividade, listas TV/VOD, senha); ações em `src/lib/clouddy.ts` com **sessão por conta em memória (6 h)** — 2ª leitura 2 s sem captcha, 1ª ~7 s.
- **O servidor recebe o site em INGLÊS**: rótulos "State", "End service date", datas `2027-10-09 18:51:06 -0300` (no navegador do Jonas, português e `09/10/2027`). O parser aceita os dois.
- `ID_APP_CLOUDDY = 5`. "↻ Atualizar" (/alertas e /clientes/[id]) lê validade + última atividade (`lista_acessada_em`) + listas → `aplicativo_playlists` com `playlist_id_externo` 1 = TV, 2 = VOD, URL convertida de `xc://` pro m3u padrão, `id_conta` pelo usuário.
- /clientes/[id]: balões TV/VOD do Clouddy têm menu só com **"Editar"** (sem excluir/marcar ativa) e o "+" da coluna abre o mesmo `ClouddyModal`: mostra a lista atual, troca por conta do cliente OU link m3u colado (get.php ou xc://) gravando TV e VOD e conferindo lendo de volta, e troca o **PIN** (4 números; padrão 0000 — o form do perfil exige a senha junto, vai a atual). Sem nome de lista (não existe no Clouddy). Botão "☁ Conta" removido a pedido do Jonas.
- **Troca de senha fica em /aplicativos → "☁ Contas Clouddy"** (Jonas troca a senha pra passar a conta a outro cliente): lista contas válidas, filtro "Sobrando" (cliente COM assinatura cadastrada, qualquer status, e nenhuma viva — ou app inativo; revendedor sem assinatura fica fora; 11 de 82 em 13/10) ou "Todas", busca por e-mail/cliente; confere logando com a senha nova (1 captcha a mais) ANTES de gravar `aplicativos.chave`. Vincular ao cliente novo segue pela "Busca por MAC" (pelo e-mail). Cada linha tem coluna Lista (TV salva no js-painel) + "↻ Atualizar" (lê validade, último acesso e listas e recarrega a tabela). Rotas: `POST /api/aplicativos/[id]/clouddy` (lista | pin | senha), `GET /api/aplicativos/clouddy`.
- Teste real só de leitura na conta do Sergio (#1413, app 976) ok. 📋 Ainda sem registro de uso real: trocar lista, PIN e senha pelo js-painel — se der erro, comparar com o tráfego capturado acima.
