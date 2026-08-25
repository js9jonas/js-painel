---
name: Automação painéis IPTV — adapters e vinculação
description: Estado atual da automação de renovação nos painéis IPTV, estrutura de adapters, endpoints CLUB, e tela de vinculação
type: project
originSessionId: 714ce632-18fa-47fb-8de2-54187a0cc5a4
---
## O que foi construído (abr/2026)

### Adapter pattern — `src/lib/painel-adapters/`
- `types.ts` — interfaces `ContaPainel`, `ResultadoRenovacao`, `PainelAdapter`, `ServidorCredenciais`
- `club.ts` — adapter completo para o CLUB (único implementado)
- `index.ts` — `getAdapter(idServidor)`: busca creds no banco, retorna adapter pelo `painel_tipo`

### Rotas de API (todas com `export const runtime = "nodejs"`)
- `POST /api/servidores/[id]/sincronizar` — importa contas do painel para tabela `contas`
- `POST /api/servidores/[id]/renovar` — `{usuario, meses=1}` → renova no painel e atualiza DB
- `GET /api/servidores/[id]/contas` — lista contas com cliente vinculado (`?vence_em_dias=N&q=search`)

### Tela de vinculação — `/servidores/vinculacao`
- Page server component (`servidores/vinculacao/page.tsx`) com 3 contadores
- `VinculacaoClient.tsx` — filtros todos/sem/com, busca inline, tabela por servidor
- Server actions: `vincularConta(idConta, idCliente)` e `desvincularConta(idConta)` em `vincularConta.ts`
- Acesso via IPTV → Vinculação no nav

## CLUB — endpoints e autenticação
- **API base:** `https://pdcapi.io/`
- **Auth:** JWT no header `X-ACCESS-TOKEN` — salvo em `servidores.session_cookie`
- **Login:** `POST https://dashboard.bz/ss.php` com hCaptcha — **sessão única**, desconecta ao logar em outro lugar
- **Listar contas:** `POST https://pdcapi.io/listas/minhas` (DataTable: `draw`, `start`, `length`)
  - Campo nome de usuário: `username`; rótulo: `reseller_notes`; vencimento: `exp_date`; id interno: `id`
- **Renovar:** `POST https://pdcapi.io/listas/{id}/renovar` com `tempo=months` (ex: `tempo=1`)
- **Token expiry:** ~7 dias; quando expirar, Jonas precisa logar manualmente no CLUB e salvar novo token no banco
- **637 contas** importadas para tabela `contas` com `id_servidor = 1`

## CENTRAL — endpoints e autenticação (capturado abr/2026)
- **API base:** `https://api.controle.fit/api`
- **Frontend:** `https://painel.fun/` (painel ZGestix / controle.vip)
- **Auth:** JWT Bearer no header `Authorization: Bearer <token>`  
  — salvo em `servidores.session_cookie`; expira em **1 hora** (sessão curta!)
- **Login:** `POST /auth/sign-in` com `{username, password, "cf-turnstile-response": "<token>"}` — Cloudflare Turnstile (só resolve via browser real)
- **Token refresh:** **não existe** endpoint de refresh — precisa relogar
- **Listar contas:** `GET /users?page=N&per=100&reseller=Jonas3468`
  - Servidor limita a **100 por página**; total 386 contas em 4 páginas
  - Campos: `id` (interno), `username`, `full_name`, `reseller_notes`, `exp_date` (unix timestamp), `enabled` (1/0)
- **Renovar:** `POST /users/{id}/renew` com body `{"mounth": 1}` (**typo intencional do servidor: `mounth` não `month`**)
- **Outros:** `GET /users/{id}/block|unblock`, `DELETE /users/{id}`, `PUT /users/{id}`
- **Adapter:** `src/lib/painel-adapters/central.ts` (implementado)
- **Atualizar token:** `POST /api/servidores/2/atualizar-token` com `{token: "eyJ..."}` — Jonas cola o JWT do localStorage de painel.fun (DevTools → Application → Local Storage → session-store → state.token)

## FAST — API oficial (não precisa capturar endpoints via browser)
- **Diferencial:** FAST tem API REST documentada com Swagger/OpenAPI — **não requer reverse-engineering de requisições do painel web**
- **Swagger UI:** `https://painelcliente.com/swagger` | spec: `https://painelcliente.com/openapi.json` (público)
- **API base:** `https://api.painelcliente.com`
- **Auth:** token permanente na URL (`/{path}/{token}`) + secret no body JSON — **sem expiração**, sem sessão, sem login automático necessário
- **Campos no banco:** `servidores.api_token` e `servidores.api_secret` (id_servidor = 8)
- **Listar contas:** `POST /get_clients_all/{token}` com `{secret, limit: 500}`
- **Renovar:** `POST /renew_client/{token}` com `{secret, username, month: N}`
- **Adapter:** `src/lib/painel-adapters/fast.ts` (implementado e registrado em index.ts)
- **Regra:** Para painéis futuros, sempre verificar primeiro se existe documentação/API oficial antes de capturar endpoints manualmente

## UNIPLAY — endpoints e autenticação (capturado abr/2026)
- **API base:** `https://gesapioffice.com/api`
- **Frontend:** `http://searchdefense.top/`
- **Auth:** JWT Bearer no header `Authorization: Bearer <token>` — salvo em `servidores.session_cookie` como JSON `{token, cryptPass}`
- **Login:** `POST /login` com `{"username":"...","password":"...","code":""}` — **sem CAPTCHA real** (code vazio funciona!)
  - Retorna: `{access_token, crypt_pass, expires_in: 129600, ...}` — `crypt_pass` re-encriptado a cada login
  - **OBRIGATÓRIO:** headers `Origin: http://searchdefense.top` e `Referer: http://searchdefense.top/` — sem eles retorna 500
- **Token:** JWT, **~6h** (do payload JWT), renovado automaticamente pelo adapter
- **Listar usuários IPTV:** `GET /users-iptv?reg_password=<crypt_pass>` com Bearer
  - Campos: `id` (interno, usado para renovar), `username`, `nota` (rótulo), `exp_date_timestamp` (unix), `status` ("Ativo"/"Desativado"), `is_trial`
- **Renovar:** `POST /users-iptv/{id}` com `{"action":1,"credits":N,"reg_password":"<crypt_pass>"}` — N = meses
- **Adapter:** `src/lib/painel-adapters/uniplay.ts` (implementado, auto-login, id_servidor = 3)
- **287 contas** sincronizadas

## NOW — endpoints e autenticação (capturado abr/2026)
- **URL correta:** `https://pnw7.cc/painel/z=EmRthTY3kTO` (URL antiga no banco estava errada)
- **Auth:** PHP session via cookie `PHPSESSID` — **sem auto-login** (reCAPTCHA Enterprise obrigatório server-side)
- **Login manual:** Jonas loga no painel; PHPSESSID salvo em `servidores.session_cookie`; expirar em ~24h
- **Refresh:** `POST /api/servidores/4/atualizar-token` com `{ token: "PHPSESSID=<valor>" }`
- **Listar usuários:** `POST /painel/usuario-status-processo.php?usuario=jsnow&status=Todos&perfil=` (DataTables)
  - `status=Todos` obrigatório — padrão da UI é "Ativos" (omite vencidos!)
  - Resposta: HTML em cada coluna; col[0]=checkbox(value=username), col[1]=nome, col[3]=vencimento, col[6]=ações
  - Parser: regex no HTML para extrair username, nome, data (`dd/mm/yyyy`), status via classe CSS
- **Renovar:** `POST /painel/EnviarRenovarUsuario.php` com `id=<username>&qtdMes=<meses>`
- **Adapter:** `src/lib/painel-adapters/now.ts` (implementado, id_servidor = 4, 11 contas)

## Tabela `contas`
```sql
-- campos relevantes
id_conta, usuario, rotulo, vencimento_real_painel, status_conta, id_servidor
```

## Tabela `servidores` (campos adicionados)
```sql
painel_tipo, painel_url, painel_usuario, painel_senha, session_cookie, session_expiry
```

## Regra de negócio gravada
**SEMPRE renovar por 1 mês, sem perguntar.** (instrução explícita de Jonas)

## UNITV — adapter implementado (abr/2026) ✅

- **Frontend:** `https://panel-web.starhome.vip/` (ResellerSystem / UniTV)
- **Solução Cloudflare:** Python `curl_cffi` com `impersonate='chrome120'` — bypassa TLS fingerprinting
- **Criptografia AES-128-CBC:** Key=`93403d3aa2ec48b4` (UTF8), IV=`7cf0127d190cb909` (UTF8), output hex maiúsculo
- **Token permanente:** `f1089b6267eed53cf086e6fbca376a6e` — dealer token, não expira
- **cf_clearance:** expira ~1 ano (até abr/2027) — extraído via `page.context().cookies()` no Playwright
- **Sessão salva no banco:** JSON `{token, cfClearance}` em `servidores.session_cookie`, `id_servidor = 5`
- **Renovar sessão:** `POST /api/servidores/5/refresh-session { token, cfClearance }` quando cf_clearance expirar (~abr/2027)
- **Adapter:** `src/lib/painel-adapters/unitv.ts` — chama `python3 src/scripts/unitv_request.py` via `execFileAsync`
- **Script Python:** `src/scripts/unitv_request.py` — lê JSON do stdin, faz request com curl_cffi, devolve JSON no stdout
- **nixpacks.toml:** Python 3.11 + `pip3 install curl-cffi --break-system-packages` adicionados
- **53 contas** no painel; status: `days > 0` → ok, `days <= 0` → vencida, `status === 0` → bloqueada
- **Listar:** `POST /api/account` com body criptografado, `pageSize: 500`
- **Renovar:** `POST /api/account/renew` com sign = `MD5("dealer" + id + "1" + "1")`
- **Status: IMPLEMENTADO** — adapter pronto e testado end-to-end, 53 contas listadas com sucesso

## LIEBE — endpoints e autenticação (capturado abr/2026)
- **Frontend:** `https://painel.liebeapp.me/` (plataforma Sigma / smart-ti.com)
- **Backend real:** `liebeapp.sigma.vin` (mas também protegido por Cloudflare)
- **Auth:** Laravel Sanctum Bearer token — **sem expiração aparente**
  - Salvo em `servidores.session_cookie`; `id_servidor = 7`
- **Login:** `POST /api/auth/login` com `{username, password}` — sem CAPTCHA (checkbox "Verificado" é só cosmético)
  - Retorna token diretamente em `response.token` (não aninhado em `data`)
  - Token formato: `{id}|{hash}` (ex: `39339|TMUouoIK8nBeR2...`)
- **Listar clientes:** `GET /api/customers?page=1&perPage=500`
  - Resposta paginada: `{data: [...], meta: {total, last_page, ...}}`
  - Campos: `id` (interno), `username`, `name` (rótulo), `expires_at` (ISO UTC), `status` ("ACTIVE"/"EXPIRED")
- **Renovar:** `POST /api/customers/{id}/renew` (sem body necessário — usa duração do plano)
  - Retorna `{data: {...cliente atualizado com novo expires_at}}`
- **Cloudflare Bot Protection:** ❌ Bloqueia requests Node.js (mesmo com Bearer token)
  - Apenas browser real (Playwright) passa
  - `cf_clearance` é HttpOnly — não acessível via JS
- **3 contas** no painel; token provavelmente longa duração/permanente
- **Status: DEFERRED** — mesma situação do UNITV; precisa Playwright server-side ou cf_clearance bridge

## TVExpress — descontinuado
- `id_servidor = 9` — Jonas não utiliza mais este painel. Não implementar.

## FUNPLAYS — adapter completo com sync de dispositivos (15/06/2026) ✅

- **Frontend reseller:** `https://reseller.funplays.app`
- **API base:** `https://api.funplays.app`
- **Auth:** JWT no header `authorization: <token>` (sem prefixo "Bearer") — expira 1h
- **Login:** `POST /auth/login {email, password, recaptcha_token}` — reCAPTCHA Enterprise key `6LcS2BYsAAAAALlg6fQnrKJLBTheTQbiyy6hUbnz`; CapSolver `ReCaptchaV2EnterpriseTaskProxyless` para automação
- **Listar devices:** `GET /reseller/devices?limit=100&page=N&sort=["id","DESC"]` — paginado, `{message: {rows, pageCount}}`
- **Listar playlists de device:** `GET /reseller/playlist?deviceId=N` — retorna array diretamente em `message`
- **Renovar:** `POST /reseller/activate {mac, package_id: 1}` — package_id 1 = anual
- **Créditos:** `GET /reseller` → `message.total_activations`
- **Adapter:** `src/lib/painel-adapters/funplays.ts` — `criarFunPlaysAdapter`, `loginFunPlays`, `getDispositivos`, `getPlaylistsDispositivo`, `ativarDispositivo`
- **painel_servidores id=100** — JWT armazenado em `session_cookie`; expira ~07/07/2026 (1h no banco precisa CAPSOLVER_API_KEY para relogar)
- **803 devices** sincronizados; **856 playlists** sincronizadas; **696 vinculados** automaticamente a clientes via playlists→contas→assinaturas

### Schema adicionado (migrações 002 + 003):
- `aplicativos.modelo` (varchar 20) — modelo do device (ex: "webos", "android")
- `aplicativos.id_painel_servidor` (FK→painel_servidores) — painel de origem do device
- `aplicativos.chave` — usado para armazenar FunPlays deviceId (era FK, agora varchar livre)
- `aplicativo_playlists` — tabela com playlists por device; UNIQUE(id_app_registro, playlist_id_externo)

### Endpoint de sync:
- `POST /api/paineis/servidores/[id]/sync-aplicativos` — upsert devices + playlists + auto-link contas
- Script de teste: `scripts/test-funplays-sync.mjs`

### UI em clientes/[id]:
- `AplicativosManager` agora mostra coluna "PLAYLISTS" com botão "▼ N✓/◌/⊗"
- Ao clicar expande row com badges por playlist: verde=vinculada, âmbar=não reconhecida, vermelho=expirada
- `getAplicativosByClienteId` agora retorna `playlists: PlaylistRow[]` via JSON_AGG

## SMARTONE — adapter HTML scraping + sync de dispositivos (16/06/2026) ✅

- **Frontend:** `https://smartone-iptv.com/client/login/` — plataforma Blesta, **sem API JSON** (scraping HTML puro)
- **Auth:** cookie de sessão `blesta_sid` (não JWT) — vida curta ~13min, validade controlada por `session_expiry`
- **Login:** `POST /client/login/` com `_csrf_token` (extraído do HTML) + Cloudflare Turnstile (CapSolver `AntiTurnstileTaskProxyLess`, sitekey `0x4AAAAAAAP8nNwILjC5_ux6`)
- **Listar devices:** `GET /plugin/smart_one/client_main/index/active/{page}/` — paginado, parse de `<tr>` via regex (`data-smartkey`, `data-title="Mac/Expiration/Device/Note"`)
- **Listar playlist do device:** `GET /plugin/smart_one/client_main/edit_playlist/{id}/` — extrai `server_host/port/username/password` dos inputs HTML, monta 1 playlist sintética por device
- **Renovar:** consome um "giftcode" — `GET /plugin/smart_one/client_codes/index/unused/` busca código livre, `POST /plugin/smart_one/client_codes/activate/{code}/` ativa no MAC
- **Créditos:** `GET /plugin/smart_one/client_codes/` → regex no badge "Unused"
- **Adapter:** `src/lib/painel-adapters/smartone.ts` — `criarSmartOneAdapter`, `id_app = 4` em `ID_APP` (sync-aplicativos/route.ts)
- **546 devices** sincronizados; **546 playlists**; alta taxa de vínculo automático a clientes via playlists→contas→assinaturas

## BUG CRÍTICO corrigido — comparação de MAC case-sensitive no sync (16/06/2026)

`src/app/api/paineis/servidores/[id]/sync-aplicativos/route.ts` comparava `WHERE mac = $1` (case-sensitive) para decidir se um device já existia. MACs cadastrados manualmente (legado, antes da automação) ficavam em lowercase; MACs vindos dos adapters chegam em uppercase — nunca davam match, e cada sync **criava uma linha duplicada** em vez de atualizar a existente. Afetava todos os painéis tipo app (FunPlays/LazerPlay/CorePlayer/SmartOne), não só SmartOne.

**Fix:** trocado para `WHERE UPPER(mac) = UPPER($1)` tanto na busca de device existente quanto no vínculo cross-app por MAC (linhas ~115-121 e ~190-195).

**Limpeza retroativa executada:**
- SmartOne (id_app=4): 410 pares duplicados, zero conflitos de `id_cliente` → merge direto
- FunPlays+LazerPlay (id_app=3,2): 78 pares — 70 sem conflito (merge automático) + 8 com `id_cliente` conflitante entre as duas linhas, resolvidos via validação manual (ver [[feedback-dedup-validacao-conta]])

Ver [[feedback-cascade-delete-merge]] para o procedimento de merge seguro (migrar `aplicativo_playlists` e `audit_log` antes do DELETE).

## Estado completo dos adapters — 30/06/2026

| Adapter | listarContas | renovar | getCreditos | editarConta | gerarTeste | recriarlinha | importarSenhas |
|---------|-------------|---------|-------------|-------------|------------|--------------|----------------|
| CLUB    | ✅ (1 req bulk) | ✅ | ✅ | ✅ user+senha+rótulo | ✅ 1-6h | — | ✅ lotes 10 |
| CENTRAL | ✅ paginado  | ✅ | ✅ | ✅ user+senha+rótulo | ✅ 3h fixas | — | — |
| UNIPLAY | ✅ | ✅ | ✅ | ✅ rótulo+pacote | ✅ 1-6h | ✅ | — |
| FAST    | ✅ | ✅ | ✅ | ✅ senha+rótulo | ✅ 4h fixas | — | — |
| LIEBE   | ✅ | ✅ | ✅ | ✅ user+senha+rótulo | ✅ dinâmico (busca pacote) | — | — |
| NOW     | ✅ | ✅ | ✅ | ✅ senha+rótulo | ✅ 3h fixas | — | — |
| UNITV   | ✅ | ✅ | ✅ | ✅ rótulo | ✅ conta real 1 mês | ✅ reset senha | — |
| NATV    | ✅ | ✅ | ✅ | — | ✅ por minutos | — | — |

### CLUB — sessão única, cuidado com volume de requests
- `listarContas()` faz apenas **1 request** (bulk). 280 chamadas individuais de senha invalidavam a sessão.
- `importarSenhas()` separado: lotes de 10, 500ms entre lotes, acionado via botão no card `/conexoes`
- 262 contas CLUB; 119 com senha no banco (18/06/2026)

### UNITV — criação de conta via gerarTeste
- `gerarTeste()` = `account/create` + snapshot lista antes/depois para pegar o `sn` novo
- `sign = md5("dealer", package_id, points_type, points)` — confirmado via decrypt AES
- `recriarlinha()` = `account/password` reset, nova senha via refetch lista `newPassword`

### Interface PainelAdapter (types.ts)
```typescript
editarConta?(usuario, {novoUsuario?, novaSenha?, novoRotulo?, novoPacote?}): Promise<ResultadoEdicao>
gerarTeste?({comAdultos?, horas?, rotulo?}): Promise<ResultadoTeste>
recriarlinha?(usuario): Promise<ResultadoTeste>
importarSenhas?(): Promise<Map<string, string | null>>
```

## NATV — adapter implementado (30/06/2026) ✅

- **Base URL:** `https://revenda.pixbot.link`
- **Auth:** Bearer Token permanente em `api_token` — sem sessão/captcha
- **Swagger UI:** `https://revenda.pixbot.link` (Swagger embutido)
- **Listar contas:** `GET /report/allusers` → `UserReportItem[]` com campos abreviados (`i,u,p,n,d,l,e,r,c,o,t,b,x`)
  - `e` = exp_date (Unix timestamp segundos), `b` = blocked (0/1), `t` = is_test (1=teste)
  - `listarContas()` filtra `t !== 1` para excluir contas de teste
- **Renovar:** `POST /user/activation {username, months}` — months: 1/2/3/4/5/6/12
- **Gerar teste:** `POST /user {username, minutes}` — minutes: 15-360; prefixo "nt" + 7 chars aleatórios
- **Créditos:** `GET /report/actionlog` → campo `b` do ActionLogItem mais recente
- **Banco:** `painel_servidores id = 104`, `tipo = "natv"`, `api_token = "WheuHn309ySYf6a4"`

## Próximos passos
- Workflow n8n chamando `POST /api/servidores/[id]/renovar` para automatizar renovações

**Why:** Automatizar renovações que hoje são feitas manualmente em cada painel.  
**How to apply:** Quando Jonas mencionar "adapter", "renovar painel", "capturar endpoints" ou "CENTRAL/UNIPLAY/etc", este é o contexto.
