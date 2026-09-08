---
name: project-chat-ia-aprendizado-historico
description: "08/09/2026 — agente de atendimento do /chat: Fase 0, 1 e 2 implementadas e Fase 0+1 validadas em produção; Fase 3 (painel de revisão) e mineração de histórico ainda pendentes"
metadata:
  node_type: memory
  type: project
  originSessionId: 01RW5BRa9bp84cx8kPsaZqy6
  modified: 2026-09-08
---

## Status (08/09/2026)

Retomado e replanejado com Jonas — plano completo (4 pilares: caixa de conversa, captura de feedback, aprendizado incremental, escada de autonomia) apresentado e ele escolheu começar por **Fase 0 + 1**, testou e validou em produção, depois pediu pra seguir direto pra **Fase 2** na mesma sessão.

- **Fase 0 — fix de instrumentação** ✅ (implementada e validada em produção): `whatsapp_mensagens.sugestao_ia` agora é sempre gravado quando uma sugestão foi gerada pra aquela resposta (antes só gravava se usada sem edição — o bug descrito abaixo). Nova coluna `status_sugestao` (`sql/010_whatsapp_mensagens_status_sugestao.sql`) com tri-state `aceita_sem_edicao` / `editada` / `descartada`, calculado em `chat/page.tsx::enviar()` via `sugestaoGeradaRef`/`sugestaoDescartadaRef`. `foi_aceita` (boolean) mantido como estava — ainda alimenta o badge "✦ IA" nas mensagens enviadas.
- **Fase 1 — caixa de conversa com o agente** ✅ (implementada e validada em produção): `src/components/chat/AgenteAtendimentoPanel.tsx` (painel novo, reaproveitando o padrão visual do resto do `/chat`) + `src/app/api/ia/sugestao-chat/conversar/route.ts` (Sonnet, mantém o histórico da conversa *com o agente* — diferente do histórico da conversa com o cliente). Dois pontos de entrada em `chat/page.tsx`: botão "💬" na barra de composição (abre o painel vazio, antes de gerar) e botão "💬 Ajustar" na bolha da sugestão já gerada (abre pré-carregado com ela). Cada resposta do agente no painel é uma sugestão pronta com botão "Usar".
- **Fase 2 — aprendizado incremental** ✅ implementada e deployada em produção (08/09/2026) — Jonas decidiu usar por alguns dias no dia a dia real antes de partir pra Fase 3, pra deixar aprendizados reais se acumularem e avaliar a qualidade da extração antes de construir a tela de revisão em cima disso. **Ainda sem validação de qualidade das extrações** — só confirmado que subiu sem erro, não que os aprendizados salvos fazem sentido. `src/lib/chat-ia-learning.ts` — motor compartilhado com 3 funções: `loadChatLearnings()` (injeta os aprendizados `status='ativo'` no system prompt), `extractLearningFromEdicao()` e `extractLearningFromContexto()` (Haiku, fire-and-forget, pedem "null" quando não há nada generalizável — evita salvar fato pontual de um cliente como se fosse regra geral). Tabela nova `lab.chat_ia_aprendizados` (`sql/011_lab_chat_ia_aprendizados.sql`, aplicada e conferida em produção) com `status` (`ativo`/`pendente_duvida`/`descartado`, não booleano — decisão já tomada no planejamento original de 11/08) e `origem_tipo` (`edicao`/`contexto_painel`) pra rastrear proveniência.
  - Gatilho 1 (`api/whatsapp/enviar/route.ts`): quando `status_sugestao === 'editada'`, busca as últimas 10 mensagens da conversa pra dar contexto e extrai o aprendizado do diff sugestão-original × texto-enviado.
  - Gatilho 2 (`api/ia/sugestao-chat/conversar/route.ts`): a cada resposta do painel, extrai da última instrução de Jonas + sugestão gerada.
  - Injeção: tanto `sugestao-chat/route.ts` (Haiku, geração inicial) quanto `conversar/route.ts` (Sonnet) carregam `loadChatLearnings()` no system prompt.
- Achado incidental corrigido (Fase 1): `api/ia/sugestao-chat/route.ts` não tinha checagem de `auth()` — endpoint aberto sem sessão. Adicionado ali e no endpoint novo.
- **Sem painel de revisão ainda (Fase 3 não iniciada)**: aprendizados extraídos entram direto com `status='ativo'` e já afetam sugestões futuras, sem nenhuma revisão humana antes — mesmo padrão de "auto-injeta, refina depois" já aceito pro `/agente`. Diferença de risco aceitável aqui: nunca chega direto no cliente, sempre passa pelo Jonas revisar/editar antes de enviar — um aprendizado ruim só gera uma sugestão estranha que ele corrige de novo (o que é, por sua vez, sinal de correção pro próprio sistema). Se algo ruim aparecer antes da Fase 3 existir, remover é só `UPDATE lab.chat_ia_aprendizados SET status='descartado' WHERE id=...` direto no banco.
- **Pendente**: Fase 3 (painel "Aprendizados" reaproveitando/generalizando a UI do `/agente` — sem ele não dá pra ver/revisar o que foi aprendido a não ser direto no banco), Fase 4 (mineração de histórico, escopo já detalhado abaixo) e Fase 5 (escada de autonomia, só desenho). **Ao retomar**, antes de construir a Fase 3, checar `SELECT categoria, conteudo, origem_tipo, criado_em FROM lab.chat_ia_aprendizados ORDER BY criado_em DESC` pra ver se as extrações dos últimos dias fazem sentido — se a qualidade estiver ruim, ajustar os prompts de `chat-ia-learning.ts` antes de construir a UI em cima.

## Ideia original (11/08/2026, pré-replanejamento)

Tornar o botão "Gerar mensagem com IA" do `/chat` (js-painel, [[project_chat_page]]) um agente com aprendizado constante, igual ao padrão já usado no `/agente` (`lab.agente_dados_aprendizados` + extração em background + discussão com o Sonnet) — ver `src/app/api/agent/chat/route.ts` e `src/app/api/agent/learnings/[id]/discuss/route.ts`.

**Por que via histórico, não via feedback do botão:** o sinal direto (sugestão aceita/editada/rejeitada) é raríssimo — só 8 registros com `sugestao_ia` no banco em 11/08/2026, todas aceitas sem edição (`foi_aceita=true`, nenhuma editada/rejeitada capturada). Além disso há um bug de instrumentação: `chat/page.tsx::enviar()` só grava `sugestao_ia` no banco quando `usouSugestao` é true (`sugestao_ia: usouSugestao ? sugestao : null`) — toda vez que a sugestão é editada ou ignorada, o texto sugerido original é descartado e nunca chega no banco. **Fix rápido e independente** (não feito ainda): trocar pra sempre gravar `sugestao_ia` quando uma sugestão foi gerada pra aquela resposta, e usar 3 estados em vez de booleano (aceita/editada/descartada) — ~30-45min, vale fazer mesmo sem o resto do projeto, pra parar de perder esse sinal daqui pra frente.

**Achado que valida a ideia:** 78% das respostas reais do Jonas (`origem='jonas'`) nunca passam pelo `/chat` — vêm de `source='phone'` (20.320 de 25.995 mensagens em 11/08/2026), ou seja, digitadas no app do WhatsApp Business no celular e sincronizadas de volta via Coexistência (CoEx). Só ~606 vieram do `/chat` (`source LIKE 'chat:%'`). O resto (~5.045) é automação (n8n, lembretes, auto-resposta) e deve ser **excluído** da mineração — não representa julgamento do Jonas.

## Arquitetura proposta

1. **Pareamento de turnos** (script, sem IA): por telefone, ordenar cronologicamente, quebrar em sessões por gap de tempo, casar "mensagem(ns) do cliente → resposta do Jonas" seguinte. Filtrar `source IN ('phone', 'chat:%')` do lado do Jonas, descartar turnos sem texto útil (mídia sem transcrição).
2. **Mineração em lote via Haiku**: agrupar vários turnos por chamada (não 1-por-1 — ~20.900 turnos elegíveis seria caro/lento). Pedir extração de regras/padrões reaproveitáveis **e**, separado, uma lista de pontos ambíguos como pergunta pro Jonas.
3. **Nova tabela `lab.chat_ia_aprendizados`**: mesma estrutura de `lab.agente_dados_aprendizados` (`categoria, conteudo, pergunta_origem, ativo, criado_em`) + coluna `status` (`ativo` / `pendente_duvida` / `descartado`) em vez de só booleano.
4. **Tela de esclarecimento — reaproveitar, não criar do zero**: `AgentChat.tsx` (`(dashboard)/agente/`) já tem aba "learnings" com lista + modal "Discutir aprendizado" que conversa com Sonnet e sugere reformulação. Copiar/adaptar esse componente é o maior acelerador do projeto — Jonas explicitamente quer esse formato ("questionar e tirar dúvidas de pontos que não ficam logicamente claros").
5. Injetar aprendizados `ativo` no system prompt de `api/ia/sugestao-chat/route.ts` (igual `loadLearnings()` do `/agente`).

## Esforço estimado (11/08/2026)

~12-18h pra uma v1 completa (maior que uma simples correção de instrumentação porque envolve ETL de histórico + tela nova):
- Script de pareamento + validação: 2-4h
- Pipeline de mineração em lote (prompt + filtro de fontes automatizadas + orquestração): 4-6h
- Schema (nova tabela + status): ~30min
- Tela de revisão/esclarecimento (adaptando `AgentChat.tsx`): 2-3h
- Injeção no prompt de sugestão: ~30min
- Ajuste de qualidade pós primeira rodada: 2-4h

## Plano de piloto combinado (antes de ir pro histórico completo)

Jonas escolheu começar pequeno em vez de minerar os 8+ anos de uma vez (risco de aprender regra/preço desatualizado):
- Janela: **últimos 90 dias**, só `source` phone + chat:*
- Rodar pareamento + mineração em lote, gravar em `lab.chat_ia_aprendizados`
- Mostrar pro Jonas os aprendizados/dúvidas brutos gerados **antes** de construir a tela de revisão ou expandir a janela — validar qualidade do prompt de extração primeiro

**How to apply:** quando Jonas pedir pra retomar isso, começar pelo piloto de 90 dias acima, não pelo histórico completo. Se o fix de instrumentação (`enviar()` sempre gravar `sugestao_ia`) ainda não tiver sido feito, oferecer fazer separado antes/durante, é rápido e não depende do resto.

Ver [[project_chat_page]] (contexto geral do /chat) e [[project_n8n_comprovante]] / [[reference_n8n_api]] não relacionados diretamente, mas mesmo padrão de "aprendizado em lab.*" já usado em outros lugares do projeto.
