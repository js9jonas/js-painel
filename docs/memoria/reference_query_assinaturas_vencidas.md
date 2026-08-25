---
name: query-assinaturas-vencidas
description: "Padrão de consulta SQL para listar assinaturas vencidas numa data — campos, joins e observações sobre contatos múltiplos"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 06238e41-30e5-41b7-ba0c-ff3ec6ed69f2
  modified: 2026-08-24T01:28:44.030Z
---

## Query base

```sql
SELECT
  cl.nome AS cliente,
  a.status,
  a.venc_contas,
  ct.telefone
FROM public.assinaturas a
JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
LEFT JOIN public.contatos ct ON ct.id_cliente = a.id_cliente
WHERE a.venc_contrato = 'YYYY-MM-DD'
ORDER BY cl.nome
```

Para ontem: `WHERE a.venc_contrato = CURRENT_DATE - INTERVAL '1 day'`
Para amanhã: `WHERE a.venc_contrato = CURRENT_DATE + INTERVAL '1 day'`

## Observações

- **Campo correto é `venc_contrato`**, não `venc_contas`. Jonas confirmou que a lista deve considerar a data do contrato.
- `contatos` tem cardinalidade 1:N com `clientes` — um cliente pode ter múltiplos telefones, gerando linhas duplicadas na lista. Normal.
- Campos adicionais disponíveis se necessário: `a.id_assinatura`, `a.venc_contas`, `a.identificacao`, `ct.whatsapp_lid`, `a.id_pacote` (JOIN `public.pacote pc ON pc.id_pacote = a.id_pacote` → `pc.contrato` para nome do pacote).
- Filtro por status: `AND a.status = 'vencido'` (valores conhecidos: `ativo`, `atrasado`, `vencido`, `inativo`, `cancelado`, `pendente`).
- ⚠️ `status = 'inativo'` é estado manual e terminal — nunca reverter por critério de data em queries/automações. Ver [[feedback_status_assinatura_terminal]].

## Como executar

```bash
cd /home/jonas/js-financeiro
node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:<SENHA_ATUAL>@localhost:5433/js' }); // via dbtunnel, ver [[feedback-acesso-banco]]
client.connect()
  .then(() => client.query(\`<query aqui>\`))
  .then(r => { console.log(JSON.stringify(r.rows, null, 2)); client.end(); })
  .catch(e => { console.error(e.message); client.end(); });
"
```

Ver também: [[feedback-acesso-banco]], [[Schema tabelas public — js-painel]]
