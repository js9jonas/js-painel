---
name: incident-fast-unitv-paginacao-listarcontas
description: "listarContas() do FAST e UNITV só buscava a 1ª página (limit/pageSize 500) sem paginar — contas além da 500ª sumiam do sync sem erro; corrigido em 08/09/2026"
metadata:
  node_type: memory
  type: project
  originSessionId: 01RW5BRa9bp84cx8kPsaZqy6
  modified: 2026-09-08
---

## O que aconteceu

Jonas notou que, ao sincronizar o painel FAST com mais de 500 usuários, algumas contas "se perdiam" — não apareciam no js-painel depois do sync. Como paliativo, ele vinha excluindo contas antigas no FAST pra manter o total abaixo de 500.

## Causa raiz

`listarContas()` em `src/lib/painel-adapters/fast.ts` chamava `POST /get_clients_all/{token}` com `{secret, limit: 500}` — **sem `page`** e sem nenhum loop. Pegava só a primeira página e parava, sem erro nenhum (por isso passou despercebido). O Swagger público (`painelcliente.com/openapi.json`) documenta `page` como parâmetro opcional desse endpoint, e a própria doc interna (`reference_endpoints_paineis_iptv.md:107`) já registrava `{secret, page?, limit?}` — o parâmetro nunca foi implementado no adapter.

Ao revisar, encontrei o **mesmo padrão exato** em `src/lib/painel-adapters/unitv.ts:201-218` (`listarContas`): `POST /api/account` com `page: 1, pageSize: 500` fixo, sem loop.

## Correção aplicada (08/09/2026)

Em ambos os adapters, `listarContas()` passou a paginar num loop: incrementa `page` a cada chamada, acumula os resultados, e para quando:
- a página vier vazia, ou
- a página vier com menos itens que o `limit`/`pageSize` (fim natural da lista), ou
- nenhum item da página for novo (usuário/sn já visto) — trava de segurança contra loop infinito caso a API ignore `page` e sempre devolva a mesma primeira página.
Limite de 50 páginas (25 mil contas) como segunda trava.

**Pendência não resolvida:** a indexação de `page` (0-based ou 1-based) não está documentada em nenhum dos dois Swaggers/specs, e nenhuma das duas respostas expõe metadados de paginação (`total`, `last_page`) que dessem certeza — assumi 1-based (convenção mais comum, compatível com o comportamento anterior de "sem `page` = primeiros 500"). **Validar comparando o total sincronizado com o total real no painel (FAST e UNITV) depois do próximo sync de cada um** — se bater, confirmado; se faltar algo no meio da lista (não só no fim), é sinal de off-by-one na indexação.

**Achado relacionado, não corrigido:** em `unitv.ts` há ~7 outros pontos (`renovar`, `editarConta`, `gerarTeste`, etc., por volta das linhas 242-385) que buscam uma conta específica via `.find(u => u.sn === X)` sobre uma chamada `page:1` isolada — se a base do UNITV passar de 500, essas operações também podem falhar em achar uma conta que esteja além da primeira página. Não mexido porque envolve renovação/edição/exclusão (maior risco), não só leitura — avaliar separadamente se acontecer.

## Se acontecer de novo

- Sintoma: contas presentes no painel real mas ausentes no js-painel depois do sync, sem erro visível.
- Primeiro suspeito: algum adapter em `src/lib/painel-adapters/*.ts` com `limit`/`pageSize` fixo sem loop de paginação. Checar `listarContas()` do painel em questão.
- Ver [[reference_adapters_paineis_iptv]] e [[reference_endpoints_paineis_iptv]] para os endpoints documentados de cada painel.
