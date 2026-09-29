---
name: project_balao_conta_rotulo_complemento
description: Sub-linha do balão de conta (ContasCards) com a parte do rótulo que difere do nome do cliente + menu de ações que fecha ao copiar M3U (28/09/2026)
metadata:
  type: project
---

**Sub-linha do rótulo (28/09/2026):** o balão de conta (`src/components/clientes/ContasCards.tsx`, usado na página do cliente e no painel lateral do `/chat`) mostra embaixo do nome do servidor só o que o `contas.rotulo` tem **a mais** que `clientes.nome` — ex.: cliente "João Alves", rótulo "João Alves - quarto" → **quarto**. Hover mostra o rótulo completo.
- Regra em `src/lib/rotulo-complemento.ts` (`complementoRotulo`, pura): igual/vazio → nada; nome completo como prefixo (palavra a palavra, sem acento/caixa) → resto sem separador; senão remove palavras "do nome" (iguais, 1–2 letras de diferença, apelido que começa igual) e conectores; sem nenhuma palavra em comum → rótulo inteiro (conta de outra pessoa).
- Calculado no servidor em `getContasPainelByClienteId` (JOIN com `clientes`, campo `rotulo_complemento`) — única fonte das duas telas.
- Dados reais (1.530 contas ativas): 499 com sub-linha (392 prefixo, 84 diferença, 23 outra pessoa); 17 casos de teste ok; 18 ms pra todas.

**Menu de ações da conta (`ContaAcoesMenu`):** "Copiar M3U" agora fecha o menu; a confirmação vai pro ícone 👤 do balão (✓ verde / ✗ vermelho por 1,5 s). Antes o menu ficava aberto pra mostrar "Copiado!" e mostrava isso mesmo se o `clipboard.writeText` falhasse.

**Modal de editar conta (`EditarContaModal`, 28/09/2026):** campo **Usuário** antes de **Senha** (antes vinha invertido) — só a ordem na tela; o envio ao salvar não mudou.
