---
name: project-cortesia-telegram-notificacao
description: Cortesia de indicação notifica via Telegram (botão wa.me) em vez de template Meta não aprovado; bugs de mídia arquivada e timeout corrigidos
metadata: 
  node_type: memory
  type: project
  originSessionId: b5549abd-551f-4651-86aa-2251b392b81a
---

✅ 07/07/2026 — Concluído e em produção (js-painel).

`src/app/api/assinaturas/[id]/cortesia/route.ts` não tinha template Meta aprovado (`js_cortesia_indicacao`), então o envio direto pela Cloud API falhava sempre. Substituído por `notificarCortesiaTelegram`: monta mensagem elegante (negrito/itálico nativos do WhatsApp, indicados listados com `•`) e manda pro Telegram de Jonas (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID_JONAS`, mesmo bot `@jonascheibe_bot` do fluxo de ativação — ver [[project_n8n_comprovante]]) com botão inline `url` apontando pra `https://wa.me/<numero>?text=<mensagem>`. Jonas confere e envia manualmente pelo próprio WhatsApp — não exige template por ser envio manual.

**Padrão geral:** esse é o caminho a seguir sempre que faltar template Meta aprovado pra algum tipo de mensagem. Documentado em `CLAUDE.md` do js-painel.

**Restaura o texto de indicações** (nomes dos clientes indicados que geraram a cortesia), que existia na versão antiga via Evolution API e se perdeu na migração pro template Meta em jun/2026.

## Bug 1 — fallback vazando entre assinaturas (corrigido)
Ver [[feedback_fallback_dado_parcial_migrado]] — não é deste fluxo especificamente, mas do mesmo dia/sessão (layout de assinaturas em clientes/[id]).

## Bug 2 — /api/whatsapp/media tentava Meta antes de checar arquivo já no Drive
Achado ao investigar a página de rate-limit da Meta (`developers.facebook.com/apps/<id>/rate-limit-details`) — essa página mostra limite de **chamadas de API por hora** (200 × usuários do app), não o tier de mensagens a clientes únicos/24h (isso é outra métrica, fica no WhatsApp Manager). Tabela "Most Active Endpoints" mostrava `gr:get:InvalidID` com 857 chamadas/24h.

Causa: `src/app/api/whatsapp/media/route.ts` sempre tentava `graph.facebook.com/v22.0/{id}` primeiro, mesmo quando `media_drive_id` já estava preenchido no banco (ou seja, já sabia que a mídia estava arquivada — e mídia só é arquivada porque expirou na Meta). Toda visualização de mídia antiga no `/chat` gerava uma chamada garantida a falhar. Corrigido: agora checa `media_drive_id` primeiro e serve do Drive direto quando já arquivada; só tenta a Meta se ainda não arquivada ou se o Drive falhar.

**How to apply:** qualquer novo endpoint que sirva mídia com fallback Meta→Drive deve seguir esse padrão (checar arquivo local/Drive primeiro quando já se sabe que existe).

## Bug 3 — timeout em chamada de rede logo após deploy
Uma cortesia real em produção (Alberto Merlo, 07/07/2026 madrugada) travou ~120s e a tela mostrou erro, mas a mensagem chegou no Telegram minutos depois — não era falha de config (token/chat_id corretos), e sim provável cold-start de rede do container recém-reiniciado pelo deploy (primeira chamada HTTPS de saída lenta — DNS/IPv6 fallback). Adicionado `AbortSignal.timeout(20_000)` na chamada ao Telegram em `notificarCortesiaTelegram`, pra falhar rápido em vez de travar a UI por 2 minutos caso se repita.

**Why:** container recém-iniciado + primeira requisição de saída = risco de latência alta não relacionada a bug de lógica. Vale lembrar disso ao diagnosticar "demorou muito/travou" logo após um deploy.
