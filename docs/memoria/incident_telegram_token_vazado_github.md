---
name: incident-telegram-token-vazado-github
description: "Token real do bot @jonascheibe_bot e chat_id pessoal do Jonas ficaram em texto puro em docs/memoria (repo publico), detectado pelo GitGuardian; rotacionado e removido dos arquivos"
metadata:
  node_type: memory
  type: project
  modified: 2026-09-13T00:00:00.000Z
---

# Token do Telegram exposto em texto puro num doc de memória (repo público)

Em 25/08/2026, um commit de reorganização de memória (`455b90c1`, migração de vários `docs/memoria/*.md` pra dentro do repo) levou junto um arquivo que já tinha o **valor real** do `TELEGRAM_BOT_TOKEN` (`@jonascheibe_bot`) e do `TELEGRAM_CHAT_ID_JONAS` escritos em texto puro — não só o nome da env var. Como `js9jonas/js-painel` é um **repositório público** no GitHub, o GitGuardian (programa "Good Samaritan", que varre repos públicos) detectou e avisou por e-mail no mesmo dia. O aviso ficou parado, não lido, por quase 3 semanas — só foi notado numa varredura de e-mails pedida pelo Jonas em 13/09/2026.

**Onde estava:**
- `docs/memoria/project_n8n_comprovante.md` — token completo + chat_id completo, na seção "Telegram — Ativação".
- `CLAUDE.md` (raiz do repo) — só o chat_id, entre parênteses no comentário da env var.

**Confirmado:** o token exposto era o mesmo em uso em produção (`.env.local`/Easypanel) na hora da descoberta — não era um valor antigo já trocado.

**Fix — concluído 13/09/2026 (exceto Easypanel):**
1. ✅ Valores reais removidos dos dois arquivos de doc — viraram ponteiro ("ver `TELEGRAM_BOT_TOKEN` no `.env.local`/Easypanel"), nunca mais o valor em si.
2. ✅ Confirmado que o código (`src/lib/notificar-renovacao.ts`, `src/app/api/assinaturas/[id]/cortesia/route.ts`) já lia só de `process.env.TELEGRAM_BOT_TOKEN` — nenhum valor hardcoded no código-fonte, só nos docs.
3. ✅ Jonas revogou e regerou o token via BotFather. Confirmado por `getMe`: token novo responde `ok:true` (mesmo bot `@jonascheibe_bot`); token antigo vazado responde `401 Unauthorized` — está morto, o vazamento no histórico do Git deixou de ter valor prático.
4. ✅ `.env.local` atualizado com o token novo.
5. 🔄 **Pendente**: atualizar a env var `TELEGRAM_BOT_TOKEN` no Easypanel (produção) com o token novo, e redeploy — sem isso, cortesia/notificação de ativação em produção ainda tentam usar o token antigo (morto) até o redeploy.

**Why importa:** a regra de memória "credencial nunca em texto puro" (ver `feedback_preferences.md` da memória global, seção de manutenção do `MEMORY.md`) existe justamente pra isso — memória de projeto vira arquivo versionado no repo, e um repo público expõe qualquer valor real que passar por ali, mesmo que a intenção fosse só documentar "qual é o bot"/"qual é o chat_id" pra referência futura.

**How to apply:** ao escrever qualquer doc de memória (`docs/memoria/*.md`) que precise citar uma credencial pra dar contexto, escrever só o **nome da env var** e onde ela mora (`.env.local`/Easypanel/gerenciador de senha) — nunca colar o valor real, nem "só dessa vez pra facilitar depois". Antes de migrar/mesclar arquivos de memória entre repos (como na reorganização de 24-25/08/2026), rodar um grep por padrões de token conhecidos (`[0-9]{8,10}:[A-Za-z0-9_-]{30,}` pra Telegram, `sk-`/`AIza`/etc. pra outros) nos arquivos envolvidos antes de commitar.
