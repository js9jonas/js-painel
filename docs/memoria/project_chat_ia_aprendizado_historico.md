---
name: project-chat-ia-aprendizado-historico
description: "11/08/2026 — ideia (não iniciada): agente de sugestão de mensagem do /chat aprender com histórico real de conversas, não só com sugestões aceitas/editadas"
metadata:
  node_type: memory
  type: project
  originSessionId: 8ee4daa4-21af-4846-8f81-a8e17f8ed224
  modified: 2026-08-12T01:29:52.111Z
---

## Ideia (pedida por Jonas, ainda não iniciada — "momento mais apropriado")

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
