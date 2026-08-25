---
name: reference-endpoints-paineis-iptv
description: Mapeamento completo de endpoints REST de cada painel IPTV — implementados e pendentes — descobertos via inspeção de JS e monitoramento Playwright (sessão 17-18/06/2026)
metadata: 
  node_type: memory
  type: reference
  originSessionId: e60fb6e2-3ae9-4bad-8761-69389e49d32e
  modified: 2026-08-05T14:22:47.309Z
---

# Endpoints REST dos Painéis IPTV

> Atualizado em 18/06/2026 após sessão de exploração.

---

## CLUB — pdcapi.io / dashboard.bz

**Auth:** `X-ACCESS-TOKEN: {jwt}` | Proxy Webshare obrigatório | hCaptcha via 2captcha no login

| Endpoint | Método | Params/Body | Implementado |
|---|---|---|---|
| `listas/minhas` | POST | `draw=1&start=0&length=2000` | ✅ listarContas |
| `listas/{id}/info` | GET | — | ✅ senha no sync (batches 20) |
| `listas/{id}/renovar` | POST | `tempo=1` | ✅ renovar |
| `listas/{id}/editar` | POST | `username_edit, password_edit, reseller_notes, plano_novo_edit` | ✅ editarConta |
| `listas/teste` | POST | `adulto=35/36, horas=1-6, username, password, nitro=0` | ✅ gerarTeste |
| `listas/{id}/deletar` | GET | — | ✅ deletarConta |
| `listas/nova` | POST | `username, password, email, conexoes, tempo, plano:"", plano_novo, plano_opt:"on", plano_custom[]` (5x pares) | ✅ criarConta (05/08/2026) — ⚠️ bouquet adulto não confiável na criação, sempre editar depois |
| `bouquets` | GET | `X_FILTRO:1` | ❌ pendente |
| `stats` | GET | — | ✅ getCreditos |
| `listas/{id}/desabilitar` / `habilitar` | GET | — | ❌ pendente |

**Notas:**
- `adulto` no gerarTeste é o ID do bouquet (35=sem adultos, 36=com adultos), NÃO booleano
- Senha não vem no bulk — obtida via `listas/{id}/info` individualmente
- Sessão única: login em outro lugar desconecta a sessão atual

---

## CENTRAL — api.controle.fit

**Auth:** `Authorization: Bearer {jwt}` | Sem proxy | Login via Turnstile (CapSolver)

| Endpoint | Método | Body | Implementado |
|---|---|---|---|
| `/users?page&per&reseller` | GET | — | ✅ listarContas + senha |
| `/users/{id}/renew` | POST | `{mounth:1}` | ✅ renovar |
| `/users/{id}/set-expiry-time` | POST | `{}` | ✅ (no renovar) |
| `/users/{id}` | PUT | `{username, password, reseller_notes, ...}` | ✅ editarConta |
| `/trial_users` | POST | `{username, password, type:1, is_trial:true, package_id:61/62, adult_channels, g-recaptcha-response, official_credits:0, isIPTV:true}` | ✅ gerarTeste |
| `/users/{id}/add-days` | POST | `{days:N}` | ⚠️ Reservado para alertas (venc_contrato < 30d) |
| `/users/{id}` | DELETE | — | ❌ pendente |
| `/users/{id}/block` / `unblock` | GET | — | ❌ pendente |
| `/users/cleanup/expired-trials` | DELETE | — | ❌ pendente |
| `/profile` | GET | — | ✅ getCreditos |

**Notas:**
- `package_id: 61` = teste sem adultos, `62` = com adultos. Duração: 3h fixas pelo pacote
- `editarConta` NÃO precisa de reCAPTCHA — apenas criação
- reCAPTCHA Enterprise: sitekey `6LeJTpIeAAAAALiuQPGPcaXbs9XL-cKdwEBuOmJ7`, URL `https://painel.fun/users`

---

## UNIPLAY — gesapioffice.com

**Auth:** `Authorization: Bearer {jwt}` | Proxy Webshare obrigatório | `reg_password=cryptPass` em listagens

| Endpoint | Método | Body/Params | Implementado |
|---|---|---|---|
| `/users-iptv?reg_password=...` | GET | — | ✅ listarContas + senha |
| `/users-iptv/{id}` action 1 | PUT | `{action:1, credits:N, reg_password}` | ✅ renovar |
| `/users-iptv/{id}` action 10 | PUT | `{action:10}` | ✅ (no renovar) |
| `/users-iptv/{id}` action 3 | PUT | `{action:3, nota, package, reg_password, username, id_iptv, isCustomPackage:false, bouquets:[], exp_day:0, flagVencimento:0}` | ✅ editarConta |
| `/users-iptv` | POST | `{isOficial:false, package:"1", credits:1, isCustomPackage:false, nota, test_hours:"1"-"6"}` | ✅ gerarTeste |
| `/recreate-line/{id}` | PUT | body vazio | ✅ recriarlinha |
| `/users-iptv/{id}` action 0 | PUT | `{action:0, on:0/1}` | ❌ pendente |
| `/users-iptv/{id}` action 2 | PUT | `{action:2}` | ❌ pendente (deletar) |
| `/dash-reseller` | GET | — | ✅ getCreditos |

**Notas:**
- `package: 0` = mantém plano atual no editarConta
- gerarTeste retorna username numérico + password automático
- recriarlinha gera novo username+password mantendo mesmo vencimento e nota
- Campos editáveis: rótulo (nota), pacote, whatsapp. Username/password NÃO editáveis diretamente

**Mapa action codes (action via PUT /users-iptv/{id}):**
- 0 = On/Off (on:0/1)
- 1 = Renovar (credits:N, reg_password)
- 2 = Deletar
- 3 = Editar (nota, package, whatsapp)
- 4 = Edit nota apenas (nota, reg_password) — versão simples
- 5 = Edit pacote (product_id)
- 6 = Migrar usuário (reg_password)
- 9 = Migrar usuário P2P (reg_password, package)
- 10 = Set expiry 23:59
- 11 = Migrar para novo P2P

---

## FAST — api.painelcliente.com

**Auth:** `token` permanente na URL + `secret` no body | Swagger em `https://painelcliente.com/swagger` (OAS 3.0, requer login)

| Endpoint | Método | Body | Implementado |
|---|---|---|---|
| `/get_clients_all/{token}` | POST | `{secret, page?, limit?}` | ✅ listarContas |
| `/renew_client/{token}` | POST | `{secret, username, month}` | ✅ renovar |
| `/profile/{token}` | POST | `{secret}` | ✅ getCreditos |
| `/update_client/{token}` | POST | `{secret, username, password?, idbouquet?, notes?}` | ✅ editarConta |
| `/trial_create/{token}` | POST | `{secret, username, password, idbouquet:[], notes?}` | ✅ gerarTeste (4h fixas) |
| `/bouquets/{token}` | POST | `{secret}` | ✅ (no gerarTeste) |
| `/get_client/{token}` | POST | `{secret, username}` | ❌ pendente |
| `/block_client/{token}` | POST | `{secret, username, status:bool}` | ❌ pendente |
| `/delete_client/{token}` | POST | `{secret, username}` | ❌ pendente |
| `/screen_client/add/{token}` | POST | `{secret, username, connections}` | ❌ pendente |

**Notas:**
- Username NÃO pode ser alterado (é o identificador)
- Testes: 4 horas fixas
- Response format: `{statusCode:200, result:true, data:{...}}` ou `{result:false, mens:"..."}`
- Rate limit: 429 se renovar mais de 1x por minuto

## LIEBE — painel.liebeapp.me / liebeapp.sigma.vin (Sigma platform)

**Auth:** `Authorization: Bearer {token}` | Laravel Sanctum | Proxy Webshare obrigatório | `POST /auth/login {username, password}`

| Endpoint | Método | Body/Params | Implementado |
|---|---|---|---|
| `/customers?page=1&perPage=500` | GET | — | ✅ listarContas + senha |
| `/customers/{slug}/renew` | POST | — | ✅ renovar |
| `/auth/me` | GET | — | ✅ getCreditos |
| `/customers?username={u}&perPage=20` | GET | filtro por username | ✅ editarConta (busca slug) |
| `/customers/{slug}` | GET | — | ✅ editarConta (objeto completo) |
| `/customers/{slug}` | PUT | objeto completo do cliente | ✅ editarConta |
| `/customers` | POST | `{server_id, package_id, trial_hours, connections:1}` | ✅ gerarTeste |
| `/servers` | GET | — | ✅ gerarTeste (busca package_id trial) |

**Notas:**
- IDs são slugs alfanuméricos (ex: `0VDV8EAz1K`), não numéricos
- PUT exige o objeto **completo** do cliente (não parcial)
- Pacotes de teste têm `is_trial:"YES"`, `is_adult:bool`, `status:"ACTIVE"`
- Campos de contato editáveis: `username`, `password`, `name`, `note` (rótulo), `email`, `whatsapp`
- `note` = Observações = rótulo no nosso sistema
- editarConta NÃO precisa de captcha — apenas PUT simples
- gerarTeste retorna `data.username`, `data.password`, `data.expires_at_tz`

## NOW — pnw7.cc/painel (PHP session + reCAPTCHA v2)

**Auth:** `PHPSESSID` cookie + `codeRev` cookie | CapSolver ReCaptchaV2TaskProxyLess | Login: `POST validar-login.php`

| Endpoint | Método | Body | Implementado |
|---|---|---|---|
| `usuario-status-processo.php?usuario=&status=Todos&perfil=` | POST | DataTables params | ✅ listarContas + senha |
| `EnviarRenovarUsuario.php` | POST | `id={user}&qtdMes={n}` | ✅ renovar |
| `ScriptModalUserEditar.php` | POST | `usuario={user}` | ✅ editarConta (busca valores atuais) |
| `EnviarEditarUser.php` | POST | `EditarNome,EditarSenha,EditarPerfil[],Usuario,...` | ✅ editarConta |
| `EnviarAdicionarTeste.php` | POST | `EditarNome,EditarUsuario,EditarSenha,EditarPerfil[],...` | ✅ gerarTeste |
| `teste-status-processo.php?usuario=&status=&perfil=` | POST | DataTables params | ✅ gerarTeste (busca vencimento) |
| `EnviarTornarTesteUser.php` | POST | `id={user}` | ❌ (converte teste → usuário, não necessário no adapter) |

**Notas:**
- `EditarPerfil[]` = `[COM-ADULTO]` ou `[SEM-ADULTO]`
- Duração do teste = 3h **fixas** pelo servidor (campo "Tempo do Teste" é apenas informativo, não enviado no body)
- `LimparScript` tag na resposta = operação bem-sucedida; ausência = sessão expirada
- Modal de edição carregado via `ScriptModalUserEditar.php` com valores atuais pré-preenchidos
- Credenciais geradas: lowercase + dígitos, 9 chars, ao menos 1 letra + 1 número

## UNITV — panel-web.revenda.watch (AES-128-CBC)

**Auth:** `dealer_token` JWT | Captcha visual (CapSolver ImageToTextTask) | AES-128-CBC em todos os bodies

| Endpoint | Método | Body (decriptado) | Implementado |
|---|---|---|---|
| `account` | POST | `{package_id:1, dealer_token, dealer_name, time_zone, page, pageSize}` | ✅ listarContas + senha |
| `account/renew` | POST | `{sn, id, package_id:1, points_type:1, auth_cycle:1, pre_auth_id:123, points:N, sign, dealer_token, dealer_name}` | ✅ renovar |
| `getDealerInfo` | POST | `{dealer_token, dealer_name}` | ✅ getCreditos |
| `account/upEdit` | POST | `{sn, id, sn_name, sn_email, sn_telphone, remark, dealer_token, dealer_name}` | ✅ editarConta |
| `account/password` | POST | `{sn, id, dealer_token, dealer_name}` | ✅ recriarlinha |

**Notas:**
- Sem `gerarTeste` — contas criadas via "Create accounts in bulk" (1 mês, 1 conexão, Basic Plan)
- `sn` = username, `id` = ID numérico interno (obtido via listagem)
- `sn_name` = Buyer name = rótulo da conta no nosso sistema
- `account/upEdit` retorna `data: null` (usar `requireData=false`)
- `account/password` reset de senha auto-gerada; nova senha em `newPassword` da próxima listagem (~2s)
- Chave AES: `93403d3aa2ec48b4` / IV: `7cf0127d190cb909` (AES-128-CBC, hex uppercase)
- `recriarlinha` = reset de senha (gera nova senha aleatória)

---

## Interface PainelAdapter — métodos opcionais

```typescript
editarConta?(usuario, {novoUsuario?, novaSenha?, novoRotulo?, novoPacote?}): Promise<ResultadoEdicao>
gerarTeste?({comAdultos?, horas?, rotulo?}): Promise<ResultadoTeste>
recriarlinha?(usuario): Promise<ResultadoTeste>
```

**Regra:** Verificar se o adapter tem o método antes de expor a funcionalidade na UI.
