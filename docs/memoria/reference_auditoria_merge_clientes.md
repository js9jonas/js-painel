---
name: reference-auditoria-merge-clientes
description: Registro de auditoria de operações de merge de clientes duplicados — histórico permanente para eventual reversão ou auditoria
type: reference
---

## Merge Felipe Rodrigues — 2026-05-13

IDs 6 e 359 unificados no destino ID 1700.

**Indicação deletada:**

| campo | valor |
|---|---|
| id_indicacao | 1395 |
| id_parceiro | 1700 (Felipe Rodrigues da Silva) |
| id_indicado | 6 (Felipe Rodrigues da Silva 3) |
| bonificacao | cortesia |
| criado_em | 2026-02-24T18:31:58.042Z |

**Motivo:** após o merge, `id_indicado=6` passaria a ser 1700, criando auto-referência (cliente indicando ele mesmo). Como os três IDs eram a mesma pessoa, o registro era inválido por natureza.

**Para auditar:** se precisar reverter ou verificar a bonificação "cortesia" desse cliente, o registro original estava aqui.

Ver procedimento completo em [[Merge de clientes duplicados — js-painel]].
