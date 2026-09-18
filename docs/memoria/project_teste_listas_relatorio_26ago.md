---
name: project-teste-listas-relatorio-26ago
description: "Teste completo (conexão + catálogo) dos 8 servidores em m3u_listas rodado em 26/08/2026 + comparação com fornecedor Spark (xc.s-dns.org) em avaliação"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-26T19:30:00.000Z
---

# Teste de servidores IPTV — 26/08/2026

Jonas pediu "testar os servidores que tenho, teste de conexão das listas, e quantidades de conteúdo de cada servidor". A feature já existia pronta: página `/teste-listas` (`src/app/(dashboard)/teste-listas/page.tsx`) + `src/lib/m3u-tester.ts` (`testarLista`/`testarListaRapido`) + tabela `m3u_listas`. Não foi preciso construir nada — só rodar.

## Como rodei

Subi `npm run dev` local com `DATABASE_URL` apontando pro túnel (`localhost:5433`), mintei cookie de sessão NextAuth (ver [[reference-teste-nextauth-local]]) e chamei `POST /api/m3u-testes` com `{lista_id, rapido: false}` (teste completo) pra cada uma das 8 listas cadastradas, depois `GET /api/m3u-listas` pra pegar os dados consolidados (mesma API que a página usa).

## Resultado (8 servidores em `m3u_listas`)

**6 online:** FAST (66.540 itens — maior catálogo), CLUB (54.030), UNIPLAY JS (30.246, melhor ping 48ms), CENTRAL (31.784, TTFB alto 17,3s), LIEBE (26.352, download lento 24,2s), NATV (20.887, mais leve).

**2 com erro de conexão agora:** NOW (`fetch failed`) e CLIENTE PERDIDO VICTOR (`fetch failed`, 100% perda de pacotes — essa última não é servidor próprio, é a lista de um cliente específico guardada pra referência). Pra essas duas, a API retorna contagens de conteúdo do último snapshot bem-sucedido (23/04/2026), não de hoje — sinalizado como "stale" no artifact pra não confundir com dado fresco.

**Achado à parte:** o sub-teste de stream HLS (`testarStreamHLS`, busca `stream_teste_id` salvo) **falhou nos 8**, incluindo os 100% online com download de lista normal — `stream_status: "falhou"`, `stream_duracao_s: 0` na maioria (falha rápida, provavelmente já no fetch da playlist M3U8). Não investigado ainda — parece problema no teste em si, não nos servidores (que tocam conteúdo normalmente pros clientes). Pendente se Jonas quiser aprofundar.

## Comparação com fornecedor em avaliação (Spark (xc.s-dns.org))

Na sequência, Jonas perguntou por um link específico (`Spark (xc.s-dns.org)`) que não estava na lista — não está em `m3u_listas`, é um fornecedor em avaliação testado em 31/07/2026 via API Xtream direta (ver [[reference-comparativo-fornecedores-iptv]] e [[feedback-avaliacao-lista-iptv-xtream]]). Re-testei e adicionei como card comparativo no mesmo artifact (badge "em avaliação", fora das estatísticas do topo que só contam os 8 servidores próprios — metodologia diferente, não dá pra misturar ping/TTFB de M3U com tempo de resposta de API Xtream nas mesmas métricas). Detalhes do re-teste em [[reference-comparativo-fornecedores-iptv]].

## Entregável

Artifact único com os 8 servidores + o fornecedor em avaliação: https://claude.ai/code/artifact/7c459b55-6d8b-4c27-b9f2-3d1f62ef407c

**How to apply:** próxima vez que Jonas pedir "testar os servidores"/"saúde das listas"/"quantidade de conteúdo", repetir esse mesmo fluxo (subir dev local + túnel + cookie mintado + `POST /api/m3u-testes` completo em cada `m3u_listas.id` + `GET /api/m3u-listas`) em vez de reconstruir do zero. Se pedir um fornecedor específico fora de `m3u_listas`, seguir o checklist Xtream manual ([[feedback-avaliacao-lista-iptv-xtream]]).
