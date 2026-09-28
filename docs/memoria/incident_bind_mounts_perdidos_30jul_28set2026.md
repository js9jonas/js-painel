---
name: incident_bind_mounts_perdidos_30jul_28set2026
description: ✅ encerrado — bind mounts manuais de js_painel (mídias WhatsApp) e js_postgres-backup sumiram em deploy pela UI do Easypanel; mídias de ~30/07 a 28/09 perdidas; corrigido configurando na aba Armazenamento
metadata:
  type: project
---

**Achado em 28/09/2026** revisando pendências (o risco estava registrado desde 26/07 em [[project_drive_service_account_fix]] e em `regras.md`, mas o passo "configurar também na aba do Easypanel" nunca foi feito).

**O que aconteceu:** os bind mounts `/root/whatsapp-midias → /app/whatsapp-midias` (`js_painel`) e `/root/backups/postgres → /backups` (`js_postgres-backup`) tinham sido criados com `docker service update --mount-add`. O Easypanel regenera a spec a cada deploy pela UI e derrubou os dois:
- `js_painel`: arquivo mais recente no host era de **30/07/2026** → desde então `scripts/arquivar-midias.mjs` (cron horário do host via `docker exec`) gravava as mídias só na camada efêmera do container, e **cada deploy apagava tudo**. O banco continuava marcando `media_local_path` como arquivada (falha silenciosa). A réplica `sync-midias-drive.sh` (03:45) também não mandou nada novo pro Drive desde 30/07.
- `js_postgres-backup`: caiu só no deploy de 28/09 (18h50) — nenhum backup perdido (Drive seguia recebendo).

**Tamanho da perda:** 792 mídias dos últimos 7 dias com arquivo sumido (560 de clientes, 232 enviadas pelo Jonas; ~110/dia) → estimativa de alguns milhares de 30/07 a 21/09, irrecuperáveis (Meta só mantém mídia **recebida** por 7 dias; enviada, 30).

**Correção (28/09 ~19h40):** 9 mídias do container atual copiadas pro host (`docker cp`) antes do deploy; Jonas configurou os dois bind mounts na **aba Armazenamento** do Easypanel e reimplantou. Verificado: spec dos dois serviços com o mount, container enxerga os arquivos do host.

**Recuperação dos últimos 7 dias: descartada pelo Jonas** ("se as próximas forem salvas já está bom"). Script pronto e testado em modo contagem (zeraria `media_url`/`media_local_path`/`media_arquivada_em` das 792 pra rotina rebaixar da Meta) — não aplicado, banco intocado.

**Lição:** mount/volume em serviço do Easypanel **só pela aba Armazenamento**; `docker service update --mount-add` vale no máximo como paliativo até o próximo deploy.
