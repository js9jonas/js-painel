---
name: reference-adapters-paineis-iptv
description: "Especificações técnicas detalhadas de cada adapter de painel IPTV no js-painel — autenticação, endpoints, quirks, status de funcionamento e pendências de teste"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7c8445e8-6f4c-4dbb-a665-372b0ce63ee2
  modified: 2026-08-24T01:33:26.072Z
---

# Adapters — Painéis IPTV (js-painel)

Arquivo de referência vivo. Atualizar conforme Jonas reportar resultados dos testes manuais.

**Arquitetura:** `src/lib/painel-adapters/` · Tabela: `public.painel_servidores` · Contas: `public.contas`  
**Callbacks:** `onSaveSession` (grava em `painel_servidores`) · `onSaveContas` (grava em `contas.id_painel_servidor`)  
**Página:** `/conexoes` — cards com status ao vivo, sincronizar, atualizar token

---

## FAST (id=8)

- **Arquivo:** `fast.ts`
- **API base:** `https://api.painelcliente.com`
- **Auth:** TOKEN permanente na URL + SECRET no body JSON — sem expiração, sem captcha
- **Swagger:** `https://painelcliente.com/swagger` (público, OAS 3.0)
- **Endpoints usados:**
  - `POST /get_clients_all/{token}` — body `{secret, limit:500}` — lista todas as contas
  - `POST /renew_client/{token}` — body `{secret, username, month:N}` — renova
  - `POST /profile/{token}` — body `{secret}` — retorna créditos (campo exato a confirmar em teste)
- **Formato resposta:** `{statusCode:200, result:true, data:{...}}` / erro: `result:false, mens:"..."`
- **Datas:** timestamp Unix → `new Date(ts * 1000)`
- **getCreditos():** implementado — busca `data.credits ?? data.credit ?? data.saldo`
- **Status página:** mostra "Conectado" + créditos em tempo real ✅
- **Pendências de teste:** confirmar campo exato do crédito na resposta do `/profile`

---

## UNIPLAY / SearchDefense (id=3)

- **Arquivo:** `uniplay.ts`
- **API base:** `https://gesapioffice.com/api`
- **Frontend:** `http://searchdefense.top/`
- **Auth:** JWT Bearer — auto-login SEM captcha (`code:""` funciona)
- **Token expiry:** ~6h — renovado automaticamente pelo adapter
- **Headers obrigatórios no login E nas chamadas:**
  ```
  Origin: http://searchdefense.top
  Referer: http://searchdefense.top/
  User-Agent: Mozilla/5.0 Chrome/120
  ```
- **Login:** `POST /login` body `{username, password, code:""}` → retorna `{access_token, crypt_pass}`
- **Sessão salva:** JSON `{token, cryptPass}` em `painel_servidores.session_cookie`
- **Listar:** `GET /users-iptv?reg_password=<crypt_pass>` com Bearer
- **Renovar:** `PUT /users-iptv/{id}` body `{action:1, credits:N, reg_password:"<crypt_pass>"}` ⚠️ **PUT não POST** (POST retorna 405 desde jun/2026)
  - Resposta: string JSON `"DD\/MM\/YYYY HH:mm:ss"` — usar `JSON.parse()` para desescapar, depois regex
  - PUT funciona via proxy Webshare; POST timeout via proxy; PUT sem proxy bloqueado pelo IP do datacenter
- **Ajuste 23:59:** `PUT /users-iptv/{id}` body `{"action":10}` — chamado logo após o renew
  - Resposta: string JSON `"DD\/MM\/YYYY 23:59:59"` — mesmo parse do renew; sem `reg_password` no body
  - Confirmação no painel: dialog "Setar hora para 23:59 do dia do vencimento?" → Sim
  - Implementado em 08/06/2026: renovar() agora chama action:1 + action:10 automaticamente
- **Dashboard/créditos:** `GET /dash-reseller` com Bearer → `credits` string `"275.10"` → `parseFloat`
- **Status lógico:** `"Ativo"/"Desativado"` · vencimento: campo `exp_date_timestamp` (unix)

---

## CLUB (id=1)

- **Arquivo:** `club.ts`
- **API base:** `https://pdcapi.io/`
- **Frontend login:** `https://dashboard.bz/`
- **Auth:** header `X-ACCESS-TOKEN: <jwt>`
- **Token expiry:** ~7 dias nominal (cabeçalho do arquivo); `parseJwtExpiry()` tenta ler `exp` do JWT, fallback 2h se token opaco
- **Login:** **AUTO-LOGIN desde 02/06/2026** — `loginViaCaptcha()` resolve hCaptcha via **2captcha** (`HCaptchaTaskProxyless`, não CapSolver) e faz `POST pdcapi.io/login` sozinho. Botão "Renovar Sessão CLUB" no card chama isso.
- **✅ 16/06/2026 — botão manual removido:** "Atualizar token" (colar via DevTools) foi removido de `PainelServidorCard.tsx` — era a única entrada de `TIPOS_TOKEN_MANUAL`, então o modal (`AtualizarTokenModal.tsx`), a rota `atualizar-token` e `atualizarSessionPainelServidor()` em `lib/paineis.ts` foram deletados junto (ficaram órfãos). Único caminho de relogin agora: automático (`withRelogin`) ou botão "Renovar Sessão CLUB" (job em background via 2captcha).
- **⚠️ Sessão única:** fazer login em outro lugar derruba a sessão ativa
- **✅ 16/06/2026 — re-login automático em runtime (não só pelo botão):** `pdcapi.io` responde HTTP 200 com `{result:false, msg:"A sessão está expirada"}` para token morto — não dá pra detectar só pelo status HTTP. `apiFetch()` agora inspeciona o corpo e lança `ClubSessionExpiredError` quando a msg contém "expirad"; `withRelogin()` (mesmo padrão do `now.ts`) captura isso, chama `loginClub()` (2captcha) e repete a chamada original uma vez. `getSession()`/`obterToken()`/`fetchComRetry()` antigos foram removidos. Ver [[project_club_token_expiry]] para o caso completo (bug + teste real).
- **Bug corrigido na mesma leva:** rota `/api/paineis/servidores/[id]/renovar` ignorava `resultado.ok`/`erro` do adapter e sempre reportava "Renovado" mesmo em falha — agora checa `resultado.ok` antes. Afetava qualquer adapter que retorna `{ok:false, erro}` sem lançar exceção (CLUB, CENTRAL).
- **Listar:** `POST /listas/minhas` body URLSearchParams `{draw:"1", start:"0", length:"2000"}` — DataTable
- **Renovar:** `POST /listas/{id_interno}/renovar` body `{tempo:<meses>}` — precisa do ID interno (não username)
  - Fluxo: listar → achar `l.id` pelo `l.username` → renovar por ID
- **Campos relevantes:** `username`, `reseller_notes` (rótulo), `exp_date` (unix), `status` (1=ok, 0=bloqueado)
- **✅ `deletarConta()` implementado** — `GET listas/{id}/deletar`, confirma sucesso re-listando
- **✅ `criarConta()` implementado (05/08/2026)** — `POST listas/nova`, descoberto via reverse engineering (interceptor de fetch/XHR no browser, dashboard.bz). Body: `username, password, email, conexoes (telas), tempo (meses), plano:"", plano_novo (ids de bouquet), plano_opt:"on", plano_custom[] (5x pares "semAdulto|comAdulto": 215|216, 217|218, 219|220, 221|222, 223|224)`. Pacote "Completo": `215,217,219,221,223,225` sem adulto / `216,218,220,222,224,225` com adulto (225=Radios, sem variante adulta).
- **⚠️ Quirk crítico:** a criação (`listas/nova`) **não aplica o bouquet com adulto de forma confiável**, mesmo enviando os IDs corretos em `plano_novo` — a conta sempre sai "Canais Adultos: Não". `criarConta()` por isso SEMPRE roda uma edição de confirmação pós-criação (`listas/{id}/editar`) que aplica o bouquet correto de verdade — confirmado empiricamente em produção (Jonas notou o padrão, ver [[project_club_migracao_painel]]).
- **Painel novo cadastrado 05/08/2026:** `painel_servidores id=105` "CLUB (novo)" (`jonasrevz20`) — mesma plataforma/API, credenciais diferentes do painel antigo (`id=1`, renomeado "CLUB (antigo)", `2971jonas`). Ver [[project_club_migracao_painel]] pro contexto completo da migração.
- **✅ Fix 05/08/2026 — campo `plano_adulto` descoberto via interceptor de fetch/XHR:** `editarConta()` e o passo de confirmação do `criarConta()` mandavam só os IDs do bouquet (215..225 sem adulto / 216..225 com adulto) e isso NUNCA foi suficiente — o payload real do formulário de edição (capturado logando manualmente em dashboard.bz + hookando `window.fetch`/`XMLHttpRequest.prototype.send`) tem um campo **separado** `plano_adulto=1` que é o que de fato liga o conteúdo adulto, e `plano_opt_edit` precisa ser `"on"` (não `"antigo"`, que só mantém o pacote atual sem aplicar nada novo). `editarConta()` ganhou parâmetro opcional `comAdultos` pra trocar bouquet de conta já existente (usa `plano_opt_edit="on"` + `plano_adulto` só quando explicitamente passado; sem o parâmetro, preserva o bouquet atual como sempre foi). Commit `f0e653b`.
- **⚠️ Username é único GLOBALMENTE na plataforma, não só por revenda:** tentar criar/editar um username que ainda existe em OUTRA conta de revenda (ex: painel antigo id=1) retorna erro `"Esse nome de usuário já está em uso"` mesmo estando em revendas diferentes. Confirma a necessidade de excluir do painel antigo ANTES de recriar/editar no novo durante a migração.

---

## CENTRAL / painel.fun (id=2)

- **Arquivo:** `central.ts`
- **API base:** `https://api.controle.fit/api`
- **Frontend:** `https://painel.fun/` (plataforma ZGestix / controle.vip)
- **Auth:** JWT Bearer — `Authorization: Bearer <token>`
- **Token expiry:** **1 hora** — renovação muito frequente
- **Login:** **AUTO-LOGIN** — `loginViaCapSolver()` resolve Cloudflare Turnstile via **CapSolver** (`AntiTurnstileTaskProxyLess`) e faz `POST /auth/sign-in` sozinho, sem intervenção manual
- **Não existe endpoint de refresh** — precisa logar de novo a cada expiração (automático)
- **Listar:** `GET /users?page=N&per=100&reseller=<usuario>` — paginado, máx 100/página
- **Renovar:** `POST /users/{id_interno}/renew` body `{"mounth":1}` (**typo intencional do servidor**)
  - Fluxo: buscar por username entre páginas → renovar por `id` interno
- **Ajuste 23:59:** `POST /users/{id}/set-expiry-time` body `{}` — chamado logo após o renew
  - Resposta: `{message, data:{old_expiry, new_expiry, old_expiry_timestamp, new_expiry_timestamp, timezone:"America/Sao_Paulo", changed:bool}, user:{...}}`
  - Usa `data.new_expiry_timestamp ?? user.exp_date` para obter o timestamp final
  - Confirmação no painel requer clicar "Sim, alterar" no dialog — no adapter a chamada API dispensa confirmação
- **Campos:** `id`, `username`, `full_name`, `reseller_notes`, `exp_date` (unix), `enabled` (1/0)
- **Implementado em 08/06/2026:** renovar() agora chama renew + set-expiry-time automaticamente
- **✅ 16/06/2026 — fix do "Renovado" sem data:** `renew` já retorna o objeto do usuário com `exp_date` atualizado (resposta plana, sem wrapper), mas era descartado. O código dependia de `set-expiry-time` retornar `data.new_expiry_timestamp` — só existe quando há mudança real de horário. Quando o horário já está em 23:59 (comum a partir da 2ª renovação em diante), a API responde `{data:{no_change_needed:true, current_expiry_timestamp}}` — campo diferente, não tratado. `novoVencimento` ficava `undefined`, `onSaveContas` nunca era chamado, e só um "Sincronizar" manual (listagem completa) corrigia depois — dava a falsa impressão de "demora vários minutos". Fix: usa `renewed.exp_date` (do próprio renew) como base, refinado por `data.new_expiry_timestamp ?? data.current_expiry_timestamp ?? user.exp_date`. Confirmado com renovação real de `noeliscor` (exp_date 1786935599 → 16/08/2026 23:59:59 BRT, capturado corretamente).

---

## NOW / pnw7 (id=4)

- **Arquivo:** `now.ts`
- **URL base:** `https://pnw7.cc/painel`
- **URL painel:** `https://pnw7.cc/painel/z=QHUiJjMygjN` (atualizado 04/06/2026)
- **Usuário/senha:** ver `public.servidores` (não fica na memória)
- **Auth:** PHP session cookie (`PHPSESSID`) — **auto-login via CapSolver reCAPTCHA v2**
- **Sitekey reCAPTCHA:** `6Lf3ccgUAAAAAH5oBq0mVN-RhDu6MDwZ3pZxVKtl`
- **Login:** `POST /validar-login.php` com `{usuario, senha, codrev, captcha-response}` — PHPSESSID no Set-Cookie
- **Session TTL:** 23h (salvo com `session_expiry`); renovação automática ao expirar
- **codrev:** derivado da `painel_url` após `z=` — enviado como cookie `codeRev=<valor>`
- **Listar:** `POST /usuario-status-processo.php?usuario=<user>&status=Todos&perfil=` — DataTables com HTML
  - Parser regex: `col[0]` = username via `value="..."`, `col[1]` = nome, `col[3]` = data + status via classe CSS
- **Renovar:** `POST /EnviarRenovarUsuario.php` body `{id:<username>, qtdMes:<N>}`
- **getCreditos():** `GET /index.php?p=inicio` → regex `(\d+) créditos` no HTML (primeiro match = saldo)
- **Sessão PHP expira antes do session_expiry:** servidor retorna HTML `<script>` em vez de JSON — `assertJson()` detecta e `withRelogin()` dispara re-login CapSolver automaticamente
- **Renovar:** `POST /EnviarRenovarUsuario.php` body `{id:<username>, qtdMes:<N>}` — busca nova data na listagem pós-renovação

---

## UNITV / StarHome (id=5)

- **Arquivo:** `unitv.ts` (Python/curl_cffi removido em 04/06/2026)
- **API base:** `https://panel-web.revenda.watch/api` (migrado de starhome.vip que saiu do ar)
- **Auth:** dealer token de sessão — **auto-login via CapSolver ImageToTextTask (síncrono)**
- **Criptografia:** AES-128-CBC — Key=`93403d3aa2ec48b4` (UTF8), IV=`7cf0127d190cb909` (UTF8), output hex maiúsculo
- **Captcha:** 4 dígitos numéricos — CapSolver retorna resultado já no `createTask` (não precisa polling)
- **device_code:** `bw6Oe063D1qAsbbnQHSRJ9Jxqt0` — device registrado pelo browser de Jonas; código diferente retorna `tip=3` (verificação de dispositivo) e token vazio
- **Sessão salva:** JSON `{token}` em `painel_servidores.session_cookie` (sem cfClearance)
- **Re-login:** automático em returnCode 300
- **Proxy Webshare:** obrigatório — IP do datacenter bloqueado pelo Cloudflare do revenda.watch
- **Listar:** `POST /api/account` body AES criptografado, `pageSize:500`
- **Renovar:** `POST /api/account/renew` com sign = `MD5("dealer" + id + "1" + meses)`
- **getCreditos():** `POST /api/getDealerInfo` → `package_objs.find(p.package_id===1).points` ⚠️ **não usar** `dealerInfo.points` (agregado geral incorreto)
- **Renovar quirks:** `account/renew` retorna `data:null` → usar `requireData=false` no apiCall; aguardar 5s antes de buscar `expireTime` na listagem (API leva 3-5s para processar)

---

## LIEBE / liebeapp (id=7)

- **Arquivo:** `liebe.ts` — ✅ implementado 04/06/2026
- **API backend:** `https://liebeapp.sigma.vin/api` (plataforma Sigma / smart-ti.com)
- **Frontend:** `https://painel.liebeapp.me/`
- **Auth:** Laravel Sanctum Bearer token — **auto-login via impit** (sem captcha)
- **Login:** `POST /api/auth/login` body `{username, password}` → `response.token` (formato `{id}|{hash}`)
- **Proxy Webshare:** obrigatório — liebeapp.sigma.vin bloqueia IP do datacenter (retorna 403)
- **Re-login:** automático em **401 e 403** — Laravel Sanctum pode retornar 403 (não só 401) para token expirado. Fix aplicado 06/06/2026.
- **Listar:** `GET /api/customers?page=1&perPage=500` — paginado
- **Renovar:** `POST /api/customers/{id}/renew` sem body
- **Campos:** `username`, `note||name` (rótulo), `expires_at_tz` (vencimento local), `status`
- **3 contas** no painel — ✅ Conectado; créditos via `GET /api/auth/me → credits`

---

## NATV (id=6)

- **Status:** ⏳ Aguardando API dos desenvolvedores
- **Acesso atual:** Telegram bot `@painel_natvbot` — credenciais em `public.servidores` (não fica na memória)
- **Bloqueio:** bot Telegram não é uma API HTTP estruturada; precisaria gramjs (MTProto) + parsing de texto livre
- **Solução preferida:** contato via master → devs para obter API HTTP direta de revendedor
- **Mensagem elaborada:** 04/06/2026 para master pedir à equipe de desenvolvimento endpoints de revendedor

---

## Sync de aplicativos (FunPlays/LazerPlay/CorePlayer/SmartOne) — fix 16/06/2026

- **Causa do "Erro de rede":** rota `/api/paineis/servidores/[id]/sync-aplicativos` processava cada device sequencialmente (login + 1 chamada de playlist por device). Com painéis grandes (FunPlays 803 devices, LazerPlay 634, SmartOne 532), passava do timeout do proxy do Easypanel e o front-end caía no catch genérico `"Erro de rede."` em `PainelAppSyncCard.tsx` — não era falha de conectividade externa (confirmado testando direto da VPS via terminal Hostinger: ambas APIs respondem normal).
- **Fix:** mesmo padrão job-em-background do `renovar-sessao` do CLUB — POST retorna `jobId` na hora, `GET ?jobId=` faz polling (a cada 3s no card). Devices processados em lotes de 6 em paralelo (`mapConcorrente`, limite ajustado ao pool padrão do `pg`, max 10 conexões).
- **Bug relacionado corrigido:** `PainelAppSyncCard.tsx` não buscava créditos do LazerPlay porque o `useEffect` de status só tinha `[painel.id]` como dependência — nunca re-executava quando a sessão passava de expirada→ativa (ex: após auto-relogin do sync). Fix: adicionado `sessionAtiva` ao array de dependências.
- **Testado:** FunPlays 803 devices/856 playlists e LazerPlay 634/667 (com relogin automático via CapSolver) sincronizados sem erro, em segundos.

## Editar/excluir playlist — descoberto 16/06/2026 via monitoramento de rede

Nenhum adapter tinha CREATE/EDIT/DELETE de playlist — só leitura (`getPlaylistsDispositivo`) e ativação de device. Endpoints descobertos manualmente (login real + ação no navegador + inspeção da network):

- **FunPlays/LazerPlay/CorePlayer (api.appacesso.com/funplays.app/coreplayer.io):** `PUT /reseller/playlist` `{id, deviceId, name, url, is_protected}` editar; `DELETE /reseller/playlist` `{id, deviceId}` excluir. Resposta simples `{error, message, status}`.
- **SmartOne:** `POST /plugin/smart_one/client_main/edit_playlist/{id}/` form-urlencoded (`_csrf_token, mac, server_name, server_host, server_port, server_username, server_password, note`) editar — sucesso = redirect 302; `GET /plugin/smart_one/client_main/delete_smartkey/{id}/active/` excluir, sem confirmação extra, sucesso = redirect 302.
- **⚠️ Quirk do SmartOne:** a página `edit_playlist/{id}/` continua retornando os dados em cache mesmo DEPOIS de excluído o smartkey — não é fonte confiável pra verificar exclusão. A listagem `index/active/` (ou buscar pelo smartkey nela) é que reflete a exclusão real.

Implementado em `appacesso.ts` (compartilhado), `smartone.ts`, rota `/api/aplicativos/[idAppRegistro]/playlists/[idPlaylist]` (job+polling, mesmo padrão de sempre pra evitar timeout em relogin lento), seta de opções (▾) no balão de playlist em `AplicativosManager.tsx` + `EditarPlaylistModal.tsx`. Testado de ponta a ponta nos dois tipos de painel (LazerPlay e SmartOne), editar e excluir, confirmado contra a API real (não só nosso banco).

### Criar playlist (16/06/2026) — `criarPlaylist` em cada adapter + rota `/api/aplicativos/[idAppRegistro]/playlists`

- **FunPlays/LazerPlay/CorePlayer:** `POST /reseller/playlist` `{deviceId, name, url, is_protected}` (mesmo endpoint do editar, sem `id`). Vira nova linha em `aplicativo_playlists` do mesmo `id_app_registro` — sem custo, sem criar device novo.
- **SmartOne:** `POST /add_playlist/` form (`form_action=generate_xtream_playlist, mac, xtream_name, xtream_playlist, note`). **Cria um smartkey NOVO no painel** (status "Pending", não "Active" — diferente de FunPlays/LazerPlay onde o device já existente recebe só mais uma opção). A resposta não informa o id criado — descoberto buscando na listagem `index/all/?sort=id&order=desc` pelo MAC (função `parseDispositivosPagina`, já usada em `getDispositivos`).
- **Confirmado por Jonas 05/07/2026:** smartkey novo (via cadastro manual ou `add_playlist`) só aparece pesquisando pelo MAC direto no site do SmartOne — não sai do status "Pending" sozinho. Vira "Active" (e passa a aparecer em `getDispositivos()`/listagem geral) somente quando o cliente abre o app na TV pela primeira vez com aquele MAC. Ou seja: não há ação manual a fazer no painel — é só aguardar o primeiro acesso do cliente; o próximo `sync-aplicativos` já casa o MAC e preenche `id_painel_servidor`/`chave` automaticamente. Caso de referência: Leonardo Flores, MAC `E4:3E:D7:67:4C:38`, `id_app_registro=4987`.
- **⚠️ Decisão de modelagem corrigida 16/06/2026:** a primeira versão criava uma linha NOVA em `public.aplicativos` pro smartkey novo do SmartOne — Jonas pegou isso como bug ("criou 2 cadastros, deveria incluir no existente"). Corrigido: o smartkey novo entra como linha adicional em `aplicativo_playlists` do MESMO `id_app_registro` que disparou a ação (igual ao FunPlays/LazerPlay visualmente), mesmo sendo tecnicamente um device separado no painel do SmartOne.
- **`note` = nome do cliente** (pedido explícito do Jonas, pra identificar no site do SmartOne quem é o dono daquele smartkey).

---

## Padrão crítico — bloqueio de IP do datacenter Hostinger

**Domínios que bloqueiam o IP `168.231.98.162` (Hostinger) — todos exigem proxy:**
`pdcapi.io` (CLUB), `gesapioffice.com` (UNIPLAY), `panel-web.revenda.watch` (UNITV), `liebeapp.sigma.vin` (LIEBE).  
Qualquer adapter nesses domínios precisa de `proxyUrl: process.env.UNIPLAY_PROXY_URL` + `impitFetch`.  
O proxy Webshare rotativo (`p.webshare.io:80`) já está configurado no Easypanel.

### Retry automático de proxy (03/06/2026)
- `src/lib/painel-adapters/proxy-retry.ts` — utilitário compartilhado `impitFetch(client, url, options)`
- Tenta até 4 vezes com backoff 800ms×tentativa; só retenta em erros de proxy (502, "proxy", "connect")
- CLUB e UNIPLAY usam `impitFetch` em todas as chamadas impit
- Resolve caso em que o pool rotativo Webshare entrega IP bloqueado pelo destino

### Webshare — incidente 03/06/2026
- Ficou fora durante horas com `X-Webshare-Reason: internal_error_auth_circuit_breaker_open`
- Ambos CLUB e UNIPLAY indisponíveis durante o incidente
- Retornou `000` mesmo via curl direto — problema interno deles, não do código

### ⚠️ 23/07/2026 — timeout interno do impit igualava o timeout externo do /conexoes
Erro visto: "Request timeout (30000 ms) exceeded" no card UNIPLAY em `/conexoes` (mensagem nativa do `impit`, não custom). Causa: nenhum adapter passava `timeout` explícito pro `new Impit(...)`, então o default do impit (~30s) coincidia quase exatamente com o `TIMEOUT_MS = 30_000` do `status/route.ts` — quando o IP sorteado do pool rotativo Webshare travava a conexão em vez de falhar rápido, o timeout externo matava a chamada no mesmo instante em que o impit ia estourar, sem sobrar janela pro retry de `proxy-retry.ts` (que já tentaria outro IP) sequer ser acionado.
**Fix:** `timeout: 10_000` adicionado na instância `Impit` compartilhada de `uniplay.ts`, `club.ts`, `liebe.ts` e `unitv.ts` (as 4 que usam `UNIPLAY_PROXY_URL`). Agora uma trava de IP falha em 10s, sobrando até ~20s pra 2-3 tentativas com IP diferente antes do timeout externo de 30s.
**How to apply:** se o erro voltar mesmo com o fix, ou aparecer em CENTRAL (que não usa esse proxy, usa CapSolver), investigar causa diferente — não é mais o mesmo problema de janela de retry.

### ⚠️ 23/07/2026 — causa raiz real do timeout: N+1 de listagem sob cliques concorrentes
Jonas relatou que estava na página Alertas clicando rápido em "Renovar via API" para várias contas em sequência quando o timeout apareceu. Hipótese confirmada por reprodução direta: TODA ação de conta única no UNIPLAY (`renovar`, `editarConta`, `deletarConta`, `recriarlinha`) faz uma **listagem completa de todos os usuários** (~200KB, milhares de registros) só pra achar o ID interno pelo username — não existe endpoint de busca por username na API do gesapioffice.com.
Testei 10 listagens completas concorrentes (simulando 10 clicks rápidos): tempo por listagem subiu de ~2,4s (isolada) para 6,8s–9,5s (concorrente) — quase 4x mais lento. Com clicks suficientes, isso empurra o tempo total (listagem + 2 PUT sequenciais de `renovar()`) pra perto ou além dos 30s do timeout externo do `/conexoes`.
**Descartado:** login concorrente não é o problema — testei 5 logins simultâneos e todos os 5 tokens continuaram válidos ao mesmo tempo (UNIPLAY não invalida sessão anterior, diferente do CLUB que é sessão única).
**Fix aplicado:** cache de 8s da listagem completa, compartilhado entre requisições concorrentes do mesmo painel (`_listagemCache` em `uniplay.ts`, chave = id do painel, coalescing de promise em voo). Clicks rápidos em múltiplas contas dentro da janela de 8s reaproveitam a mesma listagem em vez de cada um buscar a sua.
**How to apply:** se o mesmo padrão de timeout aparecer em outro painel sob uso rápido em sequência (CLUB, LIEBE, UNITV), verificar se o adapter também faz listagem completa por ação individual — mesmo fix (cache curto por painel) provavelmente se aplica.

---

## Fixes aplicados em 06/06/2026

### LIEBE — 403 tratado como re-login
- `liebeGet` e `liebePost` agora lançam `LiebeUnauthorizedError` em **401 e 403**
- Laravel Sanctum pode retornar 403 (e não 401) para token expirado — sem este fix, o adapter falha sem tentar re-login
- Erros HTTP genéricos agora incluem os primeiros 200 chars do body para facilitar debug

### Alertas — filtro `venc_contrato > venc_contas`
- Lista "contas a renovar" (`src/lib/alertas.ts`) só exibe assinaturas onde o contrato ainda cobre período após o vencimento da conta
- Ambos os branches do OR receberam a condição: `venc_contas` branch + `vencimento_real_painel` branch no EXISTS

### clientes/[id] — renovação automática de conta no painel ao salvar assinatura
- `RenovarAssinatura.tsx`: após salvar a assinatura (ambos os botões "Alterar" e "Renovar"), busca contas vinculadas com `vencimento_real_painel <= hoje` e chama `/api/paineis/servidores/[id]/renovar` para cada uma em paralelo
- Modal exibe resultado por conta (✓ nova data ou ✗ erro) antes de fechar
- `ContaPainelVinculada` ganhou campo `id_painel_servidor` — query e tipo atualizados em `src/lib/clientes.ts`
- `page.tsx` passa `contasVinculadas` para os dois `RenovarAssinatura` (card destaque + tabela)

---

## Estado dos testes (atualizado 2026-06-04)

| Painel | Status ao vivo | Créditos | Sessão | Observações |
|---|---|---|---|---|
| FAST | ✅ Conectado | ✅ | Token permanente | 100% automático |
| UNIPLAY | ✅ Conectado | ✅ | Auto-login impit+proxy | Proxy Webshare obrigatório |
| CENTRAL | ✅ Conectado | ✅ | Auto-login CapSolver Turnstile | Token 55min, renova automático |
| CLUB | ✅ Conectado | ✅ | Auto-login CapSolver hCaptcha | Proxy Webshare obrigatório; sessão única |
| UNITV | ✅ Conectado | ✅ 25 | Auto-login CapSolver ImageToText | Migrado starhome.vip → revenda.watch; impit+proxy; device_code fixo |
| NOW | ✅ Conectado | ✅ 40 | Auto-login CapSolver reCAPTCHA v2 | PHPSESSID 23h; URL z=QHUiJjMygjN; créditos em index.php HTML |
| LIEBE | ✅ Conectado | ✅ 16 | Auto-login impit (Sanctum Bearer) | liebeapp.sigma.vin; re-login em 401; token longa duração |
| NATV | ❌ sem adapter | N/A | N/A | Via Telegram |

## Página Alertas — Renovar via API (04/06/2026)

- **Rota:** `POST /api/paineis/servidores/[id]/renovar` body `{usuario}` → chama `adapter.renovar(usuario, 1)`
- **Componente:** `src/components/alertas/RenovarViaAPIButton.tsx` — botão com loading, confirmação e nova data no balão
- **Sub-linhas de contas:** query em `src/lib/alertas.ts` inclui `json_agg` de contas vinculadas por assinatura
- **Filtro:** `venc_contas >= CURRENT_DATE - 1` E `venc_contrato >= CURRENT_DATE`; contas com `vencimento_real_painel` no mesmo range aparecem como sub-linhas
- **Símbolo 🔗:** aparece na coluna pacote quando `contas_vinculadas_total == pacote_telas`
- **CLUB renovar:** `/listas/{id}/renovar` não retorna `exp_date` — refaz listagem e busca pelo username após renovação
- **UNITV renovar:** `account/renew` retorna `data:null` — `requireData=false`; delay de 5s antes da listagem pós-renovação
- **UNIPLAY renovar:** endpoint mudou `POST→PUT`; resposta string JSON `"DD\/MM\/YYYY"` — `JSON.parse()` antes do regex; usar `impitFetch` com proxy
- **NOW renovar:** `withRelogin()` detecta HTML na resposta e refaz login via CapSolver automaticamente

---

## Fixes aplicados em 04/06/2026

### UNITV — migração starhome.vip → revenda.watch
- `starhome.vip` saiu do ar (DNS SERVFAIL); novo domínio `panel-web.revenda.watch`
- Adapter reescrito: Python/curl_cffi removido → TypeScript puro com impit+proxy
- Auto-login: CapSolver `ImageToTextTask` — resultado já vem **síncrono** no `createTask` (não fazer polling)
- `device_code` deve ser `bw6Oe063D1qAsbbnQHSRJ9Jxqt0` (browser do Jonas); outro retorna `tip=3` e token vazio
- `getCreditos()` corrigido: usar `package_objs.find(package_id===1).points` (25), não `dealerInfo.points` (51 = agregado errado)
- Timeout status route: 12s → 30s (re-login via CapSolver leva ~7s total)

### NOW — auto-login implementado
- URL atualizada: `z=QHUiJjMygjN`; credenciais em `public.servidores` (não fica na memória)
- reCAPTCHA v2 (não Enterprise); sitekey `6Lf3ccgUAAAAAH5oBq0mVN-RhDu6MDwZ3pZxVKtl`
- Login: CapSolver `ReCaptchaV2TaskProxyLess` → `POST /validar-login.php` → PHPSESSID no Set-Cookie
- Form envia também `codrev=z=QHUiJjMygjN` (campo hidden)
- `getCreditos()`: parsing HTML `index.php?p=inicio` com regex `(\d+) créditos`

### LIEBE — desbloqueado
- Cloudflare não bloqueia mais `impit` no frontend; API backend (`liebeapp.sigma.vin`) requer proxy (403 na VPS)
- Adapter implementado do zero: auto-login Sanctum Bearer, re-login em 401
- `getCreditos()`: `GET /api/auth/me` → `credits`
- Campos: `username`, `note||name` (rótulo), `expires_at_tz` (vencimento local), `status`

### Regra geral
- `getCreditos()` deve ser implementado em todo adapter — salvo em [[feedback-getCreditos-adapter]]

---

## Fixes aplicados em 03/06/2026

### Saldo automático via sync (painel_servidores → servidores)
- `painel_servidores` ganhou coluna `id_servidor` (FK nullable → `servidores.id_servidor`)
- Migration rodada: `ALTER TABLE public.painel_servidores ADD COLUMN id_servidor bigint REFERENCES public.servidores(id_servidor);` no banco `js`
- Sync route (`/api/paineis/servidores/[id]/sincronizar`) chama `adapter.getCreditos()` após sync e grava em `saldo_servidor` como tipo `"ajuste"` com observação `"Sync automático via painel"`
- Modal de edição do painel em Conexões tem dropdown "Servidor vinculado" para fazer o vínculo
- Implementar vínculo: editar cada painel no modal e selecionar servidor correspondente

### Layout clientes/[id]
- Header z-index: `z-20` → `z-30` (dropdown IPTV aparecia atrás do card sticky da página)
- Card sticky cliente: `top-2` → `top-16` (para abaixo do header de 56px)
- Balão de conta vinculada: exibe `dd/mm` de `vencimento_real_painel` em vez de `ok`/`vencida`; campo adicionado à query e tipo `ContaPainelVinculada`

## Fixes aplicados em 02/06/2026

### UNIPLAY — proxy residencial
- Webshare Rotating Residential — `UNIPLAY_PROXY_URL` no Easypanel
- Endpoint com credenciais reais em [[reference-ferramentas-adquiridas]] (não fica na memória aqui)
- `impit` suporta `proxyUrl` nativamente — 1 linha de mudança
- `getCreditos()` tem retry em 401 (mesmo padrão do listarContas)
- Botão "Atualizar token" removido do card UNIPLAY (auto-login)

### Bug timezone em adapters (UNIPLAY, CLUB, CENTRAL, FAST)
- `.toISOString().slice(0,10)` converte para UTC → adianta 1 dia para 23:59:59 BRT
- Corrigido: `.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })`
- NOW e UNITV não afetados (parseia texto já em hora BR)
- **Ação pendente:** re-sincronizar todos os painéis para corrigir datas gravadas com bug

### Arquitetura callbacks
- `onSaveSession(cookie, expiry?)` → grava em `painel_servidores`
- `onSaveContas(usuario, novoVenc)` → grava em `contas.id_painel_servidor`
- Sempre rodar `npx tsc --noEmit` antes de push (Turbopack local mais permissivo)
