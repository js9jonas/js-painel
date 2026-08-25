---
name: Design — venc_contas e vencimento_real_painel
description: Decisão de design sobre como datas de vencimento do painel devem alimentar o controle de renovações
type: project
originSessionId: c03bb7d4-8102-408d-ab4b-d30d01757768
---
## Regra de negócio — datas de vencimento IPTV

`contas.vencimento_real_painel` = data legítima vinda do painel externo.
- Capturada durante: sincronização, renovação, criação de conta/teste.
- É a fonte de verdade — o que o painel realmente mostra.
- **Já implementado:** adapters CLUB, CENTRAL, FAST, UNIPLAY gravam esta coluna ao renovar.

`assinaturas.venc_contas` = data de controle usada para acionar renovações.
- **Deve ser o `MIN(vencimento_real_painel)` de todas as contas vinculadas ao cliente.**
- Motivo: cliente pode ter múltiplas telas (contas) com vencimentos distintos; o que importa é o vencimento mais próximo.
- **Status atual (jun/2026): trigger `trg_sync_venc_contas` implementado** — atualiza `venc_contas = MIN(vencimento_real_painel)` automaticamente ao salvar contas. Ver [[reference_venc_contas_trigger]].

**Why:** Garantir que a automação de renovação seja acionada com a data correta, e não uma data desatualizada ou fora de sincronia com o painel.

**How to apply:**
- Ao implementar qualquer lógica de renovação automática ou lembrete, usar `vencimento_real_painel` como referência, não `venc_contas` direto.
- Futuramente, quando o cruzamento conta↔assinatura estiver completo, criar trigger/job que atualiza `venc_contas = MIN(vencimento_real_painel)` das contas vinculadas.
- Não sobrescrever `venc_contas` automaticamente enquanto o cruzamento estiver manual.
