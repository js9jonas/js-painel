---
name: incident-telegram-token-vazado-github
description: "Token real do bot @jonascheibe_bot e chat_id pessoal do Jonas ficaram em texto puro em docs/memoria (repo publico), detectado pelo GitGuardian; rotacionado 13/09, mas node do n8n com token hardcoded na URL ficou de fora do fix ate 14/09"
metadata:
  node_type: memory
  type: project
  modified: 2026-09-14T00:00:00.000Z
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
5. ✅ Jonas atualizou a env var `TELEGRAM_BOT_TOKEN` no Easypanel (serviço `js-painel`, projeto `js`) com o token novo e disparou o redeploy (13/09/2026).

**Status: resolvido**, pendente só a confirmação de rotina — testar em produção que uma notificação real (cortesia de indicação ou ativação) chega no Telegram depois que o deploy terminar, pra confirmar que o container já está rodando com o token novo (não assumir só pelo push/redeploy — ver `feedback_confirmar_deploy_antes_teste` na memória global).

## Ponto que ficou de fora do fix original (achado e corrigido em 14/09/2026)

O fix de 13/09 atualizou `.env.local` e o Easypanel do **js-painel**, mas não cobriu o **n8n**: o workflow "WhatsApp JS API Oficial" (fluxo que lê imagem de ativação via webhook, extrai MAC/app/chave e notifica o Telegram de Jonas) tem um node `Telegram — Ativação` que é um **HTTP Request genérico com o token do bot hardcoded direto na URL** (`https://api.telegram.org/bot<TOKEN>/sendMessage`), em vez de usar a credencial nativa `jsbot` do n8n. Como esse node nunca foi tocado no fix de 13/09, ficou com o token antigo (já revogado) — resultado: 8 execuções seguidas falhando com `401 Unauthorized` / "Authorization failed" entre 12h09 e 18h28 de 14/09, e Jonas parou de receber os avisos de ativação no Telegram.

**Corrigido em 14/09/2026:** Jonas passou o token novo, a URL do node foi atualizada e republicada; testado via retry de uma execução real (`Retry of execution #955343` → sucesso, `ok:true`, `message_id` retornado pelo Telegram).

**Lição:** quando um token/credencial é rotacionado, checar também os **workflows do n8n** que usam esse mesmo serviço — não só os `.env`/Easypanel das aplicações. HTTP Request nodes com token na URL são invisíveis numa auditoria que só olha credenciais do n8n (aba Credentials), porque tecnicamente não usam nenhuma credencial cadastrada.

**Melhoria recomendada, ainda não feita:** trocar esse `Telegram — Ativação` (e checar se há outros nodes HTTP Request equivalentes no mesmo workflow ou em outros) pelo node nativo **Telegram** do n8n usando a credencial `jsbot` (`t8DYz8VVQIw623wQ`, ver `reference_n8n_api.md`) — assim uma rotação futura só exige atualizar a credencial uma vez, em vez de caçar URLs hardcoded espalhadas. Também vale checar se a própria credencial `jsbot` já está com o token novo ou se ainda está com o antigo (não foi mencionada no fix de 13/09).

## Varredura e fechamento (14/09/2026)

- **Credencial `jsbot`** confirmada com o token antigo (n8n mostrou "Couldn't connect with these settings" ao abrir) — corrigida com o token novo e testada (`Connection tested successfully`). Usada pelo workflow "Assistente Pessoal — Agenda via Telegram" (nunca tinha rodado desde a rotação, por isso o problema não tinha aparecido ainda nesse workflow).
- **Achado um segundo node com o mesmo padrão:** "Enviar Telegram" no workflow "Licitações — Monitor PNCP → Telegram" (`qwstDOdiaYrJ4Q9O`) — mesmo token antigo hardcoded na URL. Corrigido.
- **Esse segundo node foi convertido pro Telegram nativo** (+ credencial `jsbot`) em vez de só trocar o token, já que era um caso simples (botão de URL, sem recurso avançado) — testado com dado mock via API, mensagem real recebida no Telegram do Jonas.
- **"Telegram — Ativação" (o node original) ficou como HTTP Request de propósito** — usa botões do tipo "copiar texto" (`copy_text`, recurso novo da API do Telegram) que o node nativo do n8n instalado aqui (typeVersion 1.2) não suporta na interface. Converter perderia a função de copiar MAC/chave com 1 toque. Só o token foi corrigido.
- Detalhe técnico completo do processo (extração da API key via navegador, formato de conversão do node, limitação do `copy_text`) documentado em `reference_n8n_api.md` na memória global.
- **Status: totalmente resolvido.** Nenhuma ação pendente deste incidente.

**Why importa:** a regra de memória "credencial nunca em texto puro" (ver `feedback_preferences.md` da memória global, seção de manutenção do `MEMORY.md`) existe justamente pra isso — memória de projeto vira arquivo versionado no repo, e um repo público expõe qualquer valor real que passar por ali, mesmo que a intenção fosse só documentar "qual é o bot"/"qual é o chat_id" pra referência futura.

**How to apply:** ao escrever qualquer doc de memória (`docs/memoria/*.md`) que precise citar uma credencial pra dar contexto, escrever só o **nome da env var** e onde ela mora (`.env.local`/Easypanel/gerenciador de senha) — nunca colar o valor real, nem "só dessa vez pra facilitar depois". Antes de migrar/mesclar arquivos de memória entre repos (como na reorganização de 24-25/08/2026), rodar um grep por padrões de token conhecidos (`[0-9]{8,10}:[A-Za-z0-9_-]{30,}` pra Telegram, `sk-`/`AIza`/etc. pra outros) nos arquivos envolvidos antes de commitar.
