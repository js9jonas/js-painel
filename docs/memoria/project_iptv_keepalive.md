---
name: project-iptv-keepalive
description: Script Tampermonkey unificado que mantém sessões de 9 painéis IPTV ativas — todos implementados na v2.5
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c8e4595-9821-4192-a611-31849bbc8404
  modified: 2026-08-24T01:29:10.014Z
---

## Arquivo do script

**`/home/jonas/Documentos/iptv-keepalive.user.js`** — sempre atualizar aqui a cada mudança. O usuário pega sempre deste arquivo para instalar/atualizar no Tampermonkey.

## Versão atual: v2.5 — todos os 9 painéis implementados

**Why:** Painéis IPTV expiram sessões (JWT 60-360 min ou PHP/cookie session). Sem renovação, redireciona para login.
**How to apply:** Ao adicionar painel, identificar tipo de auth (JWT, cookie, Bearer), endpoint de login, tipo de captcha.

## 2captcha
- API Key: não fica na memória — ver [[reference-ferramentas-adquiridas]] ou gerenciador de senhas
- Suporta: reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, OCR imagem
- Custo: reCAPTCHA ~R$ 1,50/1.000 | Turnstile ~R$ 0,75/1.000 | OCR imagem ~R$ 1,50/1.000

## Todos os painéis (v2.5)

| Painel | Estratégia | Captcha | Custo/mês |
|---|---|---|---|
| `reseller.funplays.app` | JWT 60min, renova via 2captcha | reCAPTCHA v2 | R$ 1,08 |
| `reseller.lazerplay.io` | JWT 60min, renova via 2captcha | reCAPTCHA v2 | R$ 1,08 |
| `searchdefense.top` | JWT 360min, renova direto (Origin header) | Nenhum | R$ 0,00 |
| `smartone-iptv.com` | Cookie ping a cada 10min | Nenhum | R$ 0,00 |
| `painelcliente.com` | Cookie ping a cada 10min | Nenhum | R$ 0,00 |
| `painel.fun` | JWT 60min, renova via 2captcha Turnstile | Turnstile invisível | R$ 0,54 |
| `dashboard.bz` | Sessão via `tkn` localStorage → POST `ss.php` | hCaptcha (não precisa) | R$ 0,00 |
| `panel-web.revenda.watch` | Reativo: OCR captcha PNG + preenche form Vue | Imagem numérica 4 dígitos | ~R$ 1,08 |
| `ibosol.com` | Cookie Bearer ping `backend.ibosol.com` + re-login form | Turnstile invisível | R$ 0,00 |

**Total: ~R$ 3,78/mês**

## Credenciais e detalhes técnicos

**Logins reais (usuário/senha) de cada painel:** não ficam na memória — já estão em texto no próprio script `/home/jonas/Documentos/iptv-keepalive.user.js` (fonte de verdade operacional) e devem estar também no gerenciador de senhas. Detalhes técnicos não-credenciais de cada painel:

**FunPlays** (`api.funplays.app/reseller/login`): JWT key: `JWT` | campo: `message`

**LazerPlay** (`api.appacesso.com/reseller/login`): JWT key: `JWT` | campo: `message`

**SearchDefense** (`gesapioffice.com/api/login`): JWT key: `userToken` | campo: `access_token` | headers: `Origin: https://searchdefense.top`

**SmartOne**: ping `/client/main/getcurrencyamounts/EUR`

**PainelCliente**: ping `/dashboard-api.php?action=get_expired`

**painel.fun** (`api.controle.fit/api/auth/sign-in`): JWT em `session-store.state.token` | Turnstile site key: `0x4AAAAAACFhU7XJduqvbHH2`

**dashboard.bz** (`pdcapi.io/login`): hCaptcha resolve com clique simples | token em `localStorage.tkn` → reusar em `/ss.php` sem novo captcha

**revenda.watch** (`panel-web.revenda.watch/api/login/saveLogin`): payload hex encriptado (não chamar direto) | captcha PNG base64 em `img[src^="data:image/png"]` → OCR 2captcha | preencher form Vue com nativeInputValueSetter + events | campos: `#form_item_account`, `input[placeholder=Password]`, `#form_item_validateCode` | estratégia reativa (aguarda `#/login`)

**ibosol** (`backend.ibosol.com/api/login`): token Laravel Sanctum em cookie `token=...` | ping `backend.ibosol.com/api/resellers-notifications` com Bearer | Turnstile invisível auto-resolve no re-login

## Como adicionar novo painel — templates

**JWT com reCAPTCHA:**
Adicionar entrada em `PAINEIS_JWT` com: `nome`, `payload()`, `apiLogin`, `apiCaptcha`, `pageUrl`, `jwtKey`, `jwtField`, `dashboard`. Adicionar `@match` e `@connect` no cabeçalho.

**JWT sem captcha:**
Adicionar entrada em `PAINEIS_JWT_NOCAP` com: `nome`, `payload()`, `apiLogin`, `headers` (incluir Origin), `jwtKey`, `jwtField`, `dashboard`.

**Cookie ping:**
Adicionar entrada em `PAINEIS_COOKIE` com: `nome`, `pingUrl`, `interval`.
