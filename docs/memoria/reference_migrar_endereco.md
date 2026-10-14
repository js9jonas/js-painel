---
name: reference_migrar_endereco
description: "Migrar endereço" (troca em massa do host das listas) em todos os painéis de app — como cada um faz, e cobertura de apps integrados em 13/10/2026
metadata:
  type: reference
---

# Migrar endereço — troca em massa do host das listas (13/10/2026, `049a438`)

Botão **"Migrar endereço"** no card de cada painel de app em Conexões → Painéis de Aplicativo. Uma operação no
painel troca o endereço de todas as listas da revenda; o js-painel espelha a troca em `aplicativo_playlists` e
registra no `audit_log` (tipo `servidor_app`).

| App | Como o painel faz | Onde no código |
|---|---|---|
| Fun Play / Lazer Play / Core Player | "Servidores" do painel appacesso: escolhe o servidor, endereço novo, listas migram junto | `servidores-app/route.ts`, `ServidoresAppModal` (antes "Servidores") |
| IBO Pro | `POST /admin/playlists/mass-change-hostname {old,new}` → `totalUpdated`; aceita porta | `src/lib/migrar-host.ts`, `MigrarHostModal` |
| SmartOne | formulário `/plugin/smart_one/client_main/hostname/` (`from_server_host`, `to_server_host`, `server_type=all`, csrf) → "Successfully Updated on N playlists"; **sem porta** | idem |
| IBO Player + IBO Xplayer | IBOSOL `count-playlist-domain` + `update-playlist` por app (IBOPLAYER/1, IBOXXPLAYER/13; só listas da revenda) | idem |
| Clouddy | não tem revenda: troca conta por conta (balão Editar) | `src/lib/clouddy.ts` |

- O modal sugere os hosts da aba Hosts e preenche o novo com o principal do mesmo servidor; confirmação em 2 cliques.
- 📋 SmartOne tem "Mass change PORT" separado — não capturado; se precisar, monitorar com o Jonas e adicionar.
- Migrações reais de 13/10 (feitas pelo Jonas no site, monitoradas): IBO techonline.me → hboard.site (2 listas);
  SmartOne bandeira5.info → pfun.store (20 no site, 19 espelhadas no banco).

## Cobertura de apps (13/10/2026, clientes com assinatura viva: 1.242)
Fun Play 865 aparelhos · SmartOne 394 · Lazer Play 141 · POP Player 58 (sem integração, Cloudflare) · Clouddy 45 ·
IBO PRO 41 · IBO Player 21 (outro app, sem integração) · Ninja 8 · Core Player 6. Integrados ≈ 94% dos aparelhos ativos.
**Dream TV** adicionado em `public.apps` (id_app 33, exige licença) em 13/10/2026, a pedido do Jonas.

**13/10/2026 (noite):** limpeza — 54 IBO Player vencidos e não achados na IBOSOL marcados `inativa` (audit por app);
**DuplexPlay extinto** (sem painel): os 307 cadastros (id_app 1) excluídos, backup em `public.bkp_aplicativos_duplexplay_20261013`.
O app continua em `public.apps`. Sem varredura agora: POP Player (51 com cliente ativo), Ninja (7), Duplecast (2), resto 0–1.
