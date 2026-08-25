---
name: project-painel-notificacao-vencimento
description: "Painel na página de chat (área vazia) com botões \"Notificar vencidos\"/\"Notificar vencem amanhã\", listas com checkbox, substitui script avulso de bulk send"
metadata: 
  node_type: memory
  type: project
  originSessionId: 695099b2-9582-467f-b5ec-91655c5409ed
---

Implementado e deployado em 07/07/2026: na página de chat (`src/app/(protected)/chat/page.tsx`), quando nenhuma conversa está aberta (bloco `{!selecionado ? ... }`, antes ~linha 1164), agora aparece `<NotificacoesVencimentoPanel />` com duas listas lado a lado — clientes com `venc_contrato` = ontem ("vencidos", template `vencido_plano`) e = amanhã ("vence amanhã", template `lembrete_vencimento`). Substitui o script Node avulso usado no disparo em massa de hoje mais cedo (ver [[project_template_lembrete_vencimento]]).

**Comportamento das listas:**
- Checkbox da frente (seleção pro próximo disparo): vem **pré-marcado**, exceto quem já foi notificado **hoje** (aí vem desmarcado).
- Checkbox de trás (só leitura): indica "já enviado hoje" — calculado via `EXISTS` em `whatsapp_mensagens` (`source` + `recebida_em::date = CURRENT_DATE`), não é uma coluna nova.
- Nome + telefone aparecem juntos na linha.
- Falha no envio: mostra "Falha: {erro}" inline, **não** marca como enviado.
- Lista atualiza sozinha a cada 60s (poll) — assinaturas renovadas em qualquer lugar do sistema saem da lista automaticamente na próxima atualização, já que o critério é a própria data `venc_contrato`.

**Arquivos:**
- `src/lib/whatsapp-template.ts` — `enviarTemplateWhatsapp(telefone, templateName, parametros)`, extraído e reaproveitado por `src/app/api/whatsapp/enviar-template/route.ts` (elimina 3ª cópia da mesma chamada Graph API).
- `src/lib/notificacoes-vencimento.ts` — `listarPendentes(tipo)` e `buscarDadosParaEnvio(idAssinatura)`. `source` de cada tipo: `bulk-vencido-plano` / `bulk-lembrete-vencimento` (mesmo `source` usado no disparo manual de hoje, então o histórico de hoje já aparece corretamente como "já enviado").
- `src/app/api/whatsapp/notificacoes-vencimento/route.ts` — `GET ?tipo=` lista, `POST {tipo, ids}` dispara em paralelo (`Promise.all`, erro isolado por item, nunca derruba os outros).
- `src/components/chat/NotificacoesVencimentoPanel.tsx` — client component, sem Tailwind (segue o padrão 100% inline `style={{}}` do resto do `chat/page.tsx`).

**Testado em 07/07/2026**: GET validado visualmente via Playwright/browser (8 clientes reais em "vencidos" corretamente pré-marcados, lista "vence amanhã" com todos já marcados como enviados — reflete o bulk de 47 desta manhã). POST **não foi testado com envio real** nesta sessão — o Jonas optou por confiar na lógica já validada (mesma chamada Graph API testada várias vezes hoje) em vez de forçar outro envio de teste; uma tentativa de testar via `fetch` direto contra um id real foi bloqueada pelo classificador de segurança do Claude Code (ação de disparo real sem confirmação explícita do alvo).

**Ajustes pós-teste (mesmo dia):**
- Botão "Notificar vencidos" é **laranja** (`#f57c00`); "Notificar vencem amanhã" continua verde (`#00a884`).
- Corrigido bug: o poll de 60s recalculava a seleção inteira a cada rodada, apagando desmarcação manual do usuário entre um poll e outro. Agora usa `idsConhecidos` (ref) pra só aplicar o padrão (pré-marcado se `!jaEnviado`) em itens que ainda não tinham aparecido na lista — itens já vistos preservam a escolha manual do usuário.
- **Bug decorrente do anterior**: essa correção introduziu condição de corrida (React Strict Mode em dev dispara o `useEffect` 2x, gerando 2 `carregar()` concorrentes que podiam se sobrescrever fora de ordem, zerando a seleção inteira). Corrigido com um `requestId` sequencial em ref — cada chamada só aplica seu resultado se ainda for a mais recente emitida (padrão "latest wins"). Ver [[feedback_dev_server_zumbi]].
- Badge de status por assinatura, mesma paleta/rótulos de `AssinaturaCard.tsx` (`labelStatusCard`/`corStatusCard`): ativo=verde, pendente=vermelho, atrasado=amarelo, vencido/inativo/cancelado=cinza. `status` adicionado em `ItemNotificacaoVencimento` e no SELECT de `listarPendentes`.
- Checkbox "Marcar todos"/"Desmarcar todos" acima de cada botão de disparo (`todosSelecionados`/`toggleTodos`).
- Altura máxima de cada lista aumentada 50% (420px → 630px).

**⚠️ Revertido em 07/07/2026 — bug reapareceu mesmo com o `requestId`**: o mecanismo de "preservar seleção manual entre polls" (`idsConhecidos` ref) voltou a zerar a seleção inteira ao vivo (Jonas reproduziu: 8 itens "vencidos" todos desmarcados do nada). Causa exata não confirmada (suspeita: Fast Refresh do Next.js em dev preservando ref mas resetando state de forma inconsistente entre edições). Em vez de perseguir mais, **revertido pra lógica simples**: `carregar()` sempre recalcula `selecionados` do zero (`!jaEnviado`) a cada chamada, sem tentar preservar toggle manual entre polls de 60s. Mais simples e comprovadamente robusto — o `requestId` (latest-wins) continua, só a parte de merge/preservação foi removida. Se pedirem essa preservação de novo, pensar em outra abordagem (ex: só reconciliar no clique de "atualizar" manual, não no poll automático).

**Ajustes finais de UI (mesmo dia, commits `fcde612`):**
- Indicador de "já enviado" deixou de ser checkbox/box colorido — agora é **texto colorido**: cinza "Avisar" (ainda não enviado), verde "Enviado", vermelho "Falha" (`IndicadorEnvio`). Cabeçalho de colunas (Sel./Nome/Envio) foi testado e depois removido a pedido do Jonas.
- Testado com `npm run dev` deixado propositalmente aberto em background pro Jonas validar manualmente (não matei o processo dessa vez a pedido dele).

**Feature relacionada no chat/page.tsx (mesmo dia)**: tecla **Esc fecha a conversa aberta** (`setSelecionado(null)`), desde que nenhum modal esteja na frente — checa os estados conhecidos (`editAssinaturaOpen`, `editClienteOpen`, `novoClienteOpen`, `vincularClienteOpen`, `qrOpen`, `configOpen`, `stickerPickerOpen`, `lightbox`, `forwardMsg`) e também um sniff genérico via `document.querySelector('.fixed.inset-0.z-50')` pra pegar modais locais não elevados ao state do componente pai (ex: o modal de `RenovarAssinatura.tsx`, que é local ao componente). Testado manualmente via browser: Esc fecha conversa normalmente; com modal "Renovar assinatura" aberto, Esc não fecha nada (guard funcionou).
