---
name: drive-service-account-fix
description: "Causa raiz do invalid_grant no Google Drive do js-painel; leitura fixada com conta de serviço; mídia nova migrada pra armazenamento local na VPS; Workspace adiado"
metadata: 
  node_type: memory
  type: project
  originSessionId: a988f9b4-da1f-4d11-8ac8-82b5c19a1536
  modified: 2026-07-26T04:23:30.430Z
---

## Causa raiz do invalid_grant (25/07/2026)

O `GOOGLE_DRIVE_REFRESH_TOKEN` do js-painel (usado para servir as ~1.181 mídias do WhatsApp já arquivadas e para o worker `scripts/arquivar-midias.mjs`) parou de funcionar permanentemente. Diagnóstico: a última mídia arquivada com sucesso foi em 24/06/2026 21:06 — exatamente o dia em que a integração foi configurada (ver [[reference-infrastructure]]). Funcionou uma vez e nunca mais — consistente com o app OAuth estar em modo **"Testing"** no Google Cloud Console, onde qualquer refresh token expira automaticamente em 7 dias, independente de uso. O token do rclone usado no backup do Postgres (`js_postgres-backup`) continua funcionando porque usa o client OAuth próprio do rclone, já publicado/verificado pelo Google — não sofre desse limite.

## Fix aplicado — conta de serviço (25-26/07/2026)

Criada service account `js-painel-drive@n8n-automations-461723.iam.gserviceaccount.com` (chave JSON baixada em `~/Downloads/n8n-automations-461723-a0311a0495fe.json`), com a pasta "WhatsApp Mídias" (raiz do Drive pessoal do Jonas, `js9jonas@gmail.com`) compartilhada como Editor.

- `src/lib/google-drive.ts`: `createDriveAuth()` trocado de `OAuth2` para `google.auth.GoogleAuth` com credentials da service account. Retorno de `getAccessToken()` mudou de `{token}` (OAuth2Client) para `string` direto (GoogleAuth) — ajustado em `src/app/api/whatsapp/media/route.ts` e `src/lib/transcribe.ts`.
- `scripts/arquivar-midias.mjs`: mesma troca de auth; `obterPastaRaiz()` também corrigida — buscava `'root' in parents`, que só funciona pra Drive da própria conta autenticada. Conta de serviço não tem root próprio (a pasta pertence ao Drive do Jonas, só compartilhada), então a busca precisou remover essa restrição e localizar por nome.
- Env var nova: `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY` (JSON da service account em base64) — substitui `GOOGLE_DRIVE_CLIENT_ID`/`_CLIENT_SECRET`/`_REFRESH_TOKEN`.

**Resolve:** leitura das 1.181 mídias já arquivadas (permanente, sem expiração — service account não usa refresh token de usuário).

## Limitação descoberta — upload de mídia NOVA (resolvido, ver abaixo)

Testado empiricamente: a service account consegue **ler** a pasta e os arquivos (confirmado via `drive.files.list`), mas **não consegue criar arquivos novos** nela — erro `Service Accounts do not have storage quota`. Contas de serviço sem Google Workspace não têm cota de armazenamento própria; escrever em pasta compartilhada de conta pessoal falha mesmo com permissão de Editor. Isso não é sobre token — é limitação estrutural.

## Fix final — mídia nova guardada localmente na VPS (26/07/2026) ✅

Jonas descartou tanto publicar o OAuth em produção quanto contratar Workspace — decidiu que guardar mídia nova localmente é "o caminho mais inteligente e profissional": elimina de vez essa categoria de problema (nenhum token, nenhuma cota de terceiro), leitura/gravação mais rápida (sem round-trip de API), reaproveitando a réplica externa que já funciona pro backup do Postgres.

**Implementação:**
- `whatsapp_mensagens.media_local_path` (coluna nova) guarda o caminho relativo (`{YYYY-MM}/{tipo}/{arquivo}`); `media_drive_id` continua servindo só as 1.181 mídias antigas já no Drive (lidas via service account).
- `scripts/arquivar-midias.mjs`: removida toda lógica de Google Drive; baixa da Meta e grava direto em `WHATSAPP_MIDIA_ROOT` (default `/app/whatsapp-midias`).
- `src/app/api/whatsapp/media/route.ts` e `src/lib/transcribe.ts`: ordem de fallback agora é local → Drive (legado) → Meta.
- VPS: bind mount `/root/whatsapp-midias` (host) → `/app/whatsapp-midias` (container) no serviço `js_painel` via `docker service update --mount-add` — **mesmo risco do postgres-backup**: já sumiu uma vez após deploy pelo Easypanel (regenerou a spec sem o mount manual), tive que readicionar. Jonas ainda precisa configurar o mount também na aba Volumes/Mounts do app no Easypanel pra não se perder de novo.
- Cron no host: `/root/scripts/arquivar-midias-cron.sh` (horário, `docker exec` no container atual, `--batch 100`) e `/root/scripts/sync-midias-drive.sh` (diário 03:45, `rclone copy` pro Drive — reusa o token do rclone do `postgres-backup`, config em `/root/.config/rclone/rclone.conf` no host).
- Testado ponta a ponta: 100/100 arquivados sem erro, 100/100 replicados no Drive (18,7 MiB, bate exato com o local).

**Incidente durante o teste:** testei o cron contra produção antes do deploy da versão local ter ido ao ar — rodou a versão antiga (service account) e marcou 45 mensagens com `media_url = 'ERRO: Service Accounts do not have storage quota...'`. Revertido (`UPDATE ... SET media_url = NULL WHERE media_url LIKE 'ERRO: Service Accounts...'`) antes de reprocessar. **Lição:** sempre confirmar que o código certo está deployado (`docker exec ... grep` no container) antes de rodar um teste que escreve no banco de produção.

**Pendências residuais (não urgentes):**
1. Client OAuth compartilhado do rclone está sendo descontinuado durante 2026 (aviso nos logs) — afeta tanto esse sync quanto o do Postgres. Resolver criando client OAuth próprio do rclone quando for conveniente.
2. Backlog de ~5.900 mídias não arquivadas (2.153 delas já devem estar expiradas na Meta, vão falhar) drenando sozinho via cron horário, ~40h pra zerar a parte recuperável (<30 dias).

## Decisão — Google Workspace adiado (26/07/2026)

Jonas decidiu **não** contratar Google Workspace agora. Cotação levantada: Business Starter ~R$32,72-40,90/usuário/mês, já inclui Shared Drives (desde set/2024), resolveria a limitação de escrita acima de vez (Shared Drive = storage da organização, não da service account) e também eliminaria o risco de token expirado em qualquer integração OAuth futura (apps "Internos" num domínio Workspace não têm o limite de 7 dias nem passam por revisão do Google).

**Why:** Jonas disse estar disposto a esse investimento (~R$33-41/mês) se/quando a necessidade justificar, mas por ora prefere resolver sem esse custo adicional.
**How to apply:** não sugerir Workspace de novo proativamente — só retomar se Jonas trouxer o assunto, ou se uma nova limitação de conta de serviço/OAuth pessoal aparecer que só o Workspace resolveria. Se ele decidir contratar futuramente, usar domínio já registrado por fora (`jssistemas.online`, não comprar domínio novo direto pelo Google) para manter a opção de trocar domínio principal depois sem bloqueio.
