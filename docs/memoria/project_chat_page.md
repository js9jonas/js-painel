---
name: js-painel-p-gina-chat
description: "Estado atual da página de chat WhatsApp (clientes IPTV): arquitetura, features implementadas, componentes compartilhados e APIs"
metadata: 
  node_type: memory
  type: project
  originSessionId: 79feddc8-0dc5-4fd0-bdc6-d7f23f22c2df
---

## Localização
`src/app/(protected)/chat/page.tsx` — Client Component (`'use client'`), sem layout wrapper (só `app/layout.tsx` raiz).

## Features implementadas (até 11/06/2026)

### UI / UX
- Tema claro estilo WhatsApp Web (inline styles, sem Tailwind)
- Scroll instantâneo ao abrir conversa, suave ao chegar mensagem nova
- Modo de seleção múltipla para apagar mensagens (barra inferior com Cancelar/contador/Apagar)
- **Fix crítico**: div de mensagens precisa de `minHeight: 0` para a barra inferior não ser cortada pelo `overflow: hidden` do container pai — ver [[feedback_flex_minheight_zero]]

### Mensagens
- Reprodução de áudio, imagem (com lightbox), vídeo, documentos (thumbnail por extensão)
- **Reações**: QuickEmojiStrip vertical (6 emojis rápidos + botão ＋) aparece ao hoverar o ▾; clicar ＋ expande para grade 8×4 com 32 emojis (MORE_EMOJIS); clicar ▾ abre MsgMenu (Responder/Encaminhar/Apagar); badge de reação posicionado na base do balão (`position: absolute, bottom: -10`)
- **Quote de resposta**: balão mostra prévia da mensagem citada com borda verde; tanto enviadas pelo chat quanto recebidas do cliente
- Encaminhar mensagem para outro contato
- Sugestão de resposta via IA (haiku)

### UX de hover — QuickEmojiStrip
- `hoverMenuMsg` controla visibilidade do strip no hover do wrapper de ação
- `emojiLibMsg` controla quando a biblioteca expandida está aberta (persiste mesmo se mouse sair do wrapper)
- **Debounce de 200ms** no `onMouseLeave` dos wrappers (`hoverLeaveTimer` ref) — evita fechamento ao cruzar o gap de 4px entre strip e botão
- Overlay (`zIndex: 49`) fecha `emojiLibMsg` ao clicar fora
- `reagir()` e `fecharMenus()` limpam `emojiLibMsg` além dos demais estados

### Sidebar direita — informações do cliente
- Avatar colorido determinístico (djb2 hash)
- ⚙️ ao lado do nome → `EditClienteModal` (nome, observações, contatos)
- "+ Cadastrar" quando contato sem cliente vinculado → `NovoClienteModal` pré-preenchido com nome/telefone do contato
- Observação do cliente como subline abaixo das estrelas de fidelidade
- Seção "Assinatura": grid 2×2 (Plano, Valor, Status, Venc. contrato) + badge do pacote + ⚙️ → `EditAssinaturaModal`
- Observação da assinatura como subline abaixo do header da seção
- Balões de contas via `ContasCards` (componente compartilhado)

## Componentes compartilhados criados
- `src/components/clientes/ContasCards.tsx` — balões de contas usados em `/chat` e `clientes/[id]`; aceita `contaAction` e `emptyAction` como slots opcionais para botões

## APIs criadas/modificadas
- `GET /api/clientes/[id]/contas` — retorna `ContaPainelVinculada[]` para o id do cliente
- `GET /api/assinaturas/opcoes` — retorna `{planos, pacotes}` para alimentar modais
- `GET /api/whatsapp/mensagens` — retorna `reply_to_*`, `id_plano`, `id_pacote`, `identificacao`, `assinatura_observacao`, `pacote`
- `POST /api/whatsapp/reagir` — salva reação no banco após envio à Meta API
- `POST /api/whatsapp/enviar` — aceita `reply_msg_id`, `reply_conteudo`, `reply_origem`

## Colunas adicionadas ao banco (10/06/2026)
**`public.whatsapp_mensagens`:**
- `reply_to_wa_msg_id TEXT` — wa_msg_id da mensagem citada
- `reply_to_conteudo TEXT` — snapshot do texto citado (capturado no webhook)
- `reply_to_origem TEXT` — 'jonas' ou 'cliente'
- `reacao TEXT` — emoji de reação (atualizado via webhook tipo 'reaction' ou via /api/whatsapp/reagir)

**How:** No webhook, `msg.context?.id` captura o reply; busca a mensagem original no banco para preencher o snapshot. Na função `enviar`, o frontend passa `reply_conteudo` e `reply_origem` junto com `reply_msg_id`.

## NovoClienteModal — props adicionadas
- `initialNome`, `initialTelefone`, `initialNomeContato` — para pré-preenchimento ao abrir do chat

## Múltiplas assinaturas na sidebar direita (11/06/2026)

- `GET /api/whatsapp/mensagens` retorna `assinaturas: []` (todas as assinaturas ativas, sem LIMIT 1)
- Assinatura principal: card 2×2 completo (primeiro da lista); `ContasCards` filtra só contas do `id_assinatura` principal
- "Outras N": seção abaixo com contador + toggle ▾/▸ para recolher; cada linha clicável para expandir sub-linhas de contas
- Cada linha compacta: `● status · plano · valor · venc · badge pacote · ⚙️`
- Sub-linhas expandidas: `└ painel · usuario / senha [badge data]` por conta vinculada
- `editAssinaturaAlvo: AssinaturaResumo | null` — guarda qual assinatura está sendo editada no `EditAssinaturaModal`

## Painel de configurações — sidebar esquerda (11/06/2026)

- Ícone ⚙️ no header da sidebar esquerda; clica para alternar entre lista de conversas e painel de config
- Painel config: seção "Respostas Rápidas" com CRUD completo (criar, editar inline, deletar)
- Dados em `public.respostas_rapidas` (tabela criada por `ensureTable()` no GET)
- Seed automático na primeira chamada GET (6 respostas padrão pré-cadastradas)
- `respostasRapidas` state carregado no mount via `GET /api/whatsapp/respostas-rapidas`; constante hardcoded removida

### APIs respostas rápidas
- `GET /api/whatsapp/respostas-rapidas` — lista ordenada por `ordem ASC, id ASC`
- `POST /api/whatsapp/respostas-rapidas` — cria nova (atalho lowercased)
- `PUT /api/whatsapp/respostas-rapidas/[id]` — edita
- `DELETE /api/whatsapp/respostas-rapidas/[id]` — remove

## Arquivamento de mídias no Google Drive (24/06/2026)

### O que foi feito
- Banco: colunas `media_url TEXT`, `media_drive_id TEXT`, `media_arquivada_em TIMESTAMPTZ` adicionadas a `whatsapp_mensagens`
- Script `scripts/arquivar-midias.mjs` (não commitado): baixa mídia da Meta API → faz upload ao Drive → atualiza banco
  - Estrutura: `WhatsApp Mídias/{YYYY-MM}/{tipo}/` (tipo = imagens/audios/videos/documentos/stickers)
  - Credenciais Google OAuth2 hardcoded no script (client_id, client_secret, refresh_token)
  - Rate limit: 1,2s entre arquivamentos (~50/min)
  - Uso: `node scripts/arquivar-midias.mjs [--dry-run] [--batch N]`
- 1.181 de 3.178 mídias já arquivadas no batch de hoje; 1.997 ainda pendentes

### O que AINDA FALTA
- **Não commitado**: script + entrada `googleapis` no `package.json` ainda fora do git
- **Rota `/api/whatsapp/media`**: ainda usa somente proxy Meta — não consulta `media_drive_id` como fallback para mídias expiradas (>30 dias)
- **Webhook**: novas mídias não são arquivadas automaticamente; script precisa ser rodado periodicamente (cron) ou o webhook precisa chamar o arquivamento em fire-and-forget

## Botão PIX removido (11/06/2026)
O botão "🏦 PIX" que enviava o template `pix_cnpj` foi removido do rodapé do chat. Quando o template for aprovado com botão `copy_code` (após System User token), pode ser reintroduzido.

## Transcrição de áudios via Groq (24/06/2026)

- Coluna `transcricao TEXT` adicionada a `whatsapp_mensagens`
- `src/lib/transcribe.ts`: baixa áudio da Meta API (fallback Google Drive se expirado) → Groq `whisper-large-v3` em PT → salva `transcricao` no banco
- `POST /api/whatsapp/transcrever`: recebe `{ msgId }`, autenticado, delega à lib
- `src/components/chat/TranscribeButton.tsx`: botão "🎙 Transcrever" inline no balão; `onTranscribed` callback atualiza estado local imediatamente sem esperar polling
- Renderização: transcrição aparece em itálico (`#3b4a54`) abaixo do player de áudio; botão some após transcrever
- Transcrição é **sob demanda** (clique) — não automática no webhook
- Requer `GROQ_API_KEY` no Easypanel (chave começa com `gsk_`)
- Adaptado de `js-lab/lib/transcribe.ts` (que usa Evolution API + OpenAI)

## Reset de estados ao trocar de conversa
`useEffect` em `selecionado` zera: `selectMode`, `selectedIds`, `replyTo`, `sugestao`, `activeMenu`, `hoverMenuMsg`, `hoveredMsg`, `emojiLibMsg`, `prevMsgCountRef`, `assinaturas`, `outrasRecolhidas`, `expandidasAssinaturas`.

## Automações n8n — mensagens visíveis no chat (10/06/2026)

**Problema:** n8n envia via Meta Cloud API diretamente → mensagem não salva no banco → não aparece no chat.  
**Solução:** endpoint `POST /api/whatsapp/registrar` — n8n chama após enviar, registra com `source='n8n'`.  
**Auth:** header `x-api-key: WHATSAPP_INTERNAL_KEY` (Easypanel).  
**Badge:** `source='n8n'` ou `startsWith('n8n:')` → `🤖 Automação` (sourceLabel em chat/page.tsx).  
**n8n:** workflow `81byRJISvt0l7X6X` tem nós `Registrar no chat (img)` e `Registrar no chat (PDF)` após `Enviar texto` e `Enviar texto (PDF)`.  
Ver também [[reference-internal-api-keys]].

## Botões de contato sem cliente vinculado (11/06/2026)

Quando `!cliente` (telefone sem vínculo), exibe dois círculos lado a lado:
- **Verde (+)** — `setNovoClienteOpen(true)` → `NovoClienteModal` (criar do zero), title="Cadastrar novo Cliente"
- **Azul (🔗)** — `setVincularClienteOpen(true)` → `VincularClienteModal` (vincular a existente), title="Vincular a Cliente"

**`VincularClienteModal`** (`src/components/clientes/VincularClienteModal.tsx`):
- Busca incremental de clientes (debounce 300ms) via `buscarClientes` Server Action
- Badge verde `✓ ID xxx` ao selecionar
- Campos: Nome do contato (pré-preenchido com nome WhatsApp) + Referência (opcional)
- Ao confirmar: chama `vincularContatoNoChat(telefone, idCliente, nome, referencia)`:
  - UPDATE `contatos SET id_cliente=... WHERE telefone=...` → se 0 rows → INSERT

**Server Action** `vincularContatoNoChat` em `src/app/actions/contatos.ts`.

## Segurança — correções aplicadas em 10/06/2026

**Todas as rotas WhatsApp exigem `auth()` com retorno 401:**
- `GET /api/whatsapp/conversas`
- `GET /api/whatsapp/mensagens`
- `GET /api/whatsapp/media`
- `POST /api/whatsapp/enviar`
- `POST /api/whatsapp/reagir`
- `POST /api/whatsapp/apagar`
- `GET /api/clientes/[id]/contas`
- `GET /api/assinaturas/opcoes`
- Webhook (`POST /api/whatsapp/webhook`) **não exige auth** — é chamado pela Meta, não pelo browser. Protegido por HMAC.

**Webhook — verificação HMAC-SHA256:**
- Valida header `X-Hub-Signature-256` usando `WHATSAPP_APP_SECRET` (app jswhats, ID 1060517628167041)
- Se `WHATSAPP_APP_SECRET` não estiver definida (dev local), loga aviso e prossegue sem verificar
- Usa `timingSafeEqual` para evitar timing attacks

## Correções de performance (11/06/2026) — commit 34ca419

- **AbortController** em `carregarMensagens` (`mensagensAbortRef`): cancela requisição anterior — sem race condition no polling
- **try/finally** em `carregarMensagens`: `loadingMsgs` não trava se rede cair
- **`loadingMsgs`** só ativado no carregamento inicial (`ignorarVisibilidade=true`), não em cada tick
- **Rollback optimistic update** em `reagir`: restaura `reacaoAnterior` se API falhar
- **Polling pausa em background**: `visibilitychange` pausa os intervalos; retoma imediatamente ao voltar à aba

## Sidebar direita — aplicativos e pagamentos (11/06/2026) — commit 34ca419

- **Seção Aplicativos**: `GET /api/clientes/[id]/aplicativos`; recolhível; badge status colorido; validade ⚠️ se vencida
- **Seção Pagamentos**: `GET /api/clientes/[id]/pagamentos`; recolhida por padrão; último pagamento sempre visível (fundo verde)
- Ambas carregadas em paralelo com `/contas` no `useEffect([cliente?.id_cliente])`
- Componente helper `PagamentoLinha` definido antes de `ChatPage`

## Painel de configurações ⚙ (11/06/2026) — commit 34ca419

- Ícone ⚙ no header da sidebar esquerda; alterna entre lista de conversas e painel de config
- **Respostas Rápidas**: CRUD na UI; tabela `public.respostas_rapidas` criada por `ensureTable()`; seed automático com 6 respostas
- Constante hardcoded removida; substituída por estado `respostasRapidas` + fetch no mount
- Endpoints: `GET/POST /api/whatsapp/respostas-rapidas`, `PUT/DELETE /api/whatsapp/respostas-rapidas/[id]`

## Botão de áudio 🎙️ (11/06/2026) — commit 974004b

### UI
- Botão 🎙️ à direita da barra de mensagem
- Ao gravar: timer mm:ss, botão ⏸️ pause/▶️ retomar, 🗑️ cancelar, ✅ enviar
- Estado: `gravando`, `pausado`, `tempoGravacao`, `enviandoAudio`, `erroAudio`
- Refs: `mediaRecorderRef`, `audioChunksRef`, `gravarTimerRef`

### API — `POST /api/whatsapp/enviar-audio`
- Usa `ffmpeg-static` (v7.0.2, binário estático) + `fluent-ffmpeg` para conversão real de container
- Chrome grava `audio/webm;codecs=opus` — convertido para `audio/ogg` (mesmo codec Opus, container OGG aceito pela Meta)
- Conversão via arquivos temporários em `os.tmpdir()`, limpeza garantida em `finally`
- Fallback: se ffmpeg falhar, envia o original com log de erro
- **Bug corrigido (commit eb616f1)**: `require('ffmpeg-static')` falha em Next.js App Router ESM; caminho resolvido via `join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg')` — ver [[feedback-require-esm-nextjs]]
- **Bug corrigido**: `conteudo` salvo como `mediaId` string simples (igual ao webhook), NÃO `JSON.stringify({ media_id })`
  - O chat renderiza `src={/api/whatsapp/media?id=${msg.conteudo}}` — precisa da string pura

### Integração
- `pararEEnviarGravacao()` define `recorder.onstop`, chama `resume()` se pausado, depois `stop()`
- `cancelarGravacao()` define `onstop` que apenas libera a stream, depois `stop()`
- Após envio OK: chama `carregarMensagens(tel, true)` para recarregar com o novo áudio
