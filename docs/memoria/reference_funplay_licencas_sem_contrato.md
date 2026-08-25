---
name: reference-funplay-licencas-sem-contrato
description: Query e contexto para listar licenças Fun Play ativas sem contrato IPTV ativo — usada para identificar licenças candidatas a transferência
metadata: 
  node_type: memory
  type: reference
  originSessionId: 39dbbb4b-c6c9-408a-949e-0a37ae4ad38e
  modified: 2026-08-24T01:28:39.118Z
---

## Finalidade

Identificar licenças Fun Play com validade ativa mas cujo cliente não possui assinatura IPTV com `venc_contrato >= hoje`. Usada para escolher **quais licenças transferir** para clientes que vão (re)ativar serviço.

**Regra de transferência Fun Play:** só é possível transferir licenças com **30+ dias de validade restante**. Licenças com menos de 30 dias ficam indisponíveis para transferência (podem permanecer na lista por referência, mas não são candidatas).

## Critério de uso

- Clientes fiéis → preferir licenças com mais tempo de vencimento
- Clientes incertos → usar licenças com menos tempo disponível
- `ultimo_venc_contrato = null` → cliente revendedor (ex.: "Guido IPTV", "Wesley IPTV") — compra licenças para os próprios clientes; **não são candidatas** a transferência para a base JS Sistemas

## Query (executar via node-pg de /home/jonas/js-financeiro)

```js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:<SENHA_ATUAL>@localhost:5433/js' }); // via dbtunnel, ver [[feedback-acesso-banco]]
pool.query(`
  SELECT DISTINCT ON (ap.mac)
    cl.nome AS cliente,
    ap.mac,
    ap.validade AS venc_licenca,
    (ap.validade - CURRENT_DATE)::int AS dias_restantes,
    (
      SELECT MAX(a2.venc_contrato)
      FROM assinaturas a2
      WHERE a2.id_cliente = ap.id_cliente
    ) AS ultimo_venc_contrato
  FROM aplicativos ap
  JOIN clientes cl ON cl.id_cliente = ap.id_cliente
  WHERE ap.id_app = 3
    AND ap.validade >= CURRENT_DATE
    AND ap.status != 'removido'
    AND NOT EXISTS (
      SELECT 1 FROM assinaturas a
      WHERE a.id_cliente = ap.id_cliente
        AND a.venc_contrato >= CURRENT_DATE
    )
  ORDER BY ap.mac, ap.validade DESC
`).then(r => { console.log('Total:', r.rows.length); console.log(JSON.stringify(r.rows, null, 2)); pool.end(); });
```

**id_app = 3** → Fun Play (tabela `apps`)  
Tabela usada: `aplicativos` (não `contas`) — campo `validade` = vencimento da licença no painel FunPlay

## Contexto adicional

- Resultado de 26/06/2026: 115 licenças encontradas
- Licenças com `dias_restantes < 30` não podem ser transferidas (restrição FunPlay)
- Clientes com null em `ultimo_venc_contrato` são revendedores — excluir manualmente ao escolher candidatas
