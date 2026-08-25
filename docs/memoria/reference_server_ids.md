---
name: reference-server-ids
description: "IDs dos painéis/servidores IPTV nas tabelas do banco js — servidores (conteúdo M3U), painel_servidores (app MAC), aplicativos.id_app"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 223cd4e8-ff9a-402e-b077-84ec89e3052c
---

# IDs de servidores IPTV — banco `js`

## Tabela `public.servidores` — painéis de conteúdo (lista M3U)

| id_servidor | Painel | Observação |
|---|---|---|
| 1 | CLUB | pdcapi.io; JWT X-ACCESS-TOKEN; sessão única |
| 2 | CENTRAL | api.controle.fit / painel.fun; JWT Bearer; expira 1h |
| 3 | UNIPLAY | gesapioffice.com / searchdefense.top; JWT Bearer; IP bloqueado na VPS |
| 4 | NOW | pnw7.cc; PHP PHPSESSID; ~24h |
| 5 | UNITV | panel-web.starhome.vip; token permanente + cf_clearance |
| 7 | LIEBE | painel.liebeapp.me; Laravel Sanctum Bearer; Cloudflare bloqueia Node |
| 8 | FAST | api.painelcliente.com; token permanente; sem expiração |
| 9 | TVExpress | descontinuado — não usar |

## Tabela `public.painel_servidores` — painéis de aplicativo (MAC/device)

| id | Painel | Observação |
|---|---|---|
| 100 | FunPlays | api.funplays.app; JWT 1h sem Bearer; reCAPTCHA Enterprise |
| 103 | SmartOne | smartone-iptv.com; blesta_sid ~13min; Turnstile CapSolver |

> LazerPlay tem `id_app = 2` em `aplicativos` mas id em `painel_servidores` não mapeado ainda.

## Coluna `aplicativos.id_app` — tipo de app panel

| id_app | Painel |
|---|---|
| 2 | LazerPlay |
| 3 | FunPlays |
| 4 | SmartOne |

## Como usar em queries

```sql
-- Devices SmartOne
WHERE a.id_app = 4

-- Devices FunPlays
WHERE a.id_app = 3

-- Contas de um painel de conteúdo específico
WHERE c.id_servidor = 1  -- CLUB
```

**Why:** Durante pesquisa de licenças SmartOne livres (29/06/2026) foi necessário descobrir esses IDs via query antes de filtrar. Gravar evita round-trip desnecessário.
