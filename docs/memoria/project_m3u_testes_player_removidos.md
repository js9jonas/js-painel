---
name: project_m3u_testes_player_removidos
description: Como era a funcionalidade de testes de listas M3U + Player IPTV (tela "📡 Servidores" e "▶ Player") antes de ser removida em 28/09/2026 — arquitetura, tabelas, n8n e como restaurar
metadata:
  type: project
---

**Removido em 28/09/2026 a pedido do Jonas** ("remover tudo e deixar documentado como era — quem sabe futuramente volto a trabalhar em alguma forma de teste, mas com abordagem diferente"). O código completo está no git: **último commit com tudo = `861934d`** (`git show 861934d:<caminho>` ou `git checkout 861934d -- <caminho>` pra restaurar).

Documentos anteriores, mantidos como histórico: [[project_player_iptv]] (Player, bugs e limitações) e [[project_teste_listas_relatorio_26ago]] (último teste completo dos 8 servidores + comparação Spark).

## O que existia

**Telas** (menu "📡 IPTV"):
- `/teste-listas` — "📡 Servidores" (~1.260 linhas): CRUD das listas M3U/Xtream cadastradas (`m3u_listas`), botões de teste rápido/completo por lista e "testar todas", histórico por janela de horas, busca de canal por nome, campo pra fixar o stream usado no teste (`stream_teste_id`).
- `/player` — "▶ Player" (~1.100 linhas): player web (hls.js + mpegts.js) que navegava nas listas cadastradas (categorias → canais/filmes/séries a partir do catálogo salvo em `m3u_conteudo`) ou tocava uma URL colada (M3U, Xtream API ou stream direto). Aceitava `?url=` na query.

**Rotas API:**
| Rota | Métodos | Função |
|---|---|---|
| `/api/m3u-listas` | GET, POST | lista/cadastra (o POST disparava `testarLista` no cadastro) |
| `/api/m3u-listas/[id]` | PATCH, DELETE | edita (ativo, stream de teste) / apaga |
| `/api/m3u-listas/[id]/canais` | GET | busca canal no catálogo |
| `/api/m3u-listas/[id]/conteudo` | GET | categorias/itens pro Player |
| `/api/m3u-listas/[id]/vod-info` | GET | detalhe de filme/série |
| `/api/m3u-testes` | POST | roda teste (`rapido: true/false`) |
| `/api/m3u-testes/historico` | GET | histórico por horas |
| `/api/m3u-resumo` | POST, GET | compacta a semana anterior / lê resumos |
| `/api/stream-proxy` | GET | proxy HTTP→HTTPS dos streams pro Player (mixed content) |
| `/api/proxy-test` | GET | diagnóstico do proxy ("NÃO usar em produção") |

⚠️ **Falha de segurança fechada na remoção:** `stream-proxy` e `proxy-test` estavam liberados **sem login** em `src/proxy.ts` e buscavam **qualquer URL** de `?url=` → proxy aberto/SSRF (alcançava a rede interna do Docker Swarm). Se um dia voltar um player, o proxy precisa de sessão **e** allowlist de hosts.

**Bibliotecas:**
- `src/lib/m3u-tester.ts` (~920 linhas) — UA `Lavf/58.76.100`. Mede ping/jitter/perda (5 repetições), HTTP status, TTFB, velocidade de download do M3U, tamanho da lista; contagem via API Xtream (`player_api.php` actions) quando a URL é Xtream; teste real de stream HLS (TTFB, throughput, consistência %, duração) num canal escolhido (`stream_teste_id` ou busca). Grava em `m3u_testes`, snapshot do catálogo em `m3u_snapshots` e catálogo item a item em `m3u_conteudo`. `testarListaRapido` (sem download completo/stream) × `testarLista` (completo).
- `src/lib/m3u-compactador.ts` (~380 linhas) — resumo semanal por lista (uptime, médias, maior sequência offline) + análise em texto por IA (`claude-haiku-4-5-20251001`, comparando com a semana anterior) → `m3u_resumos_semanais`.

**Automação (n8n, workflow "Automações JS" `J6sUbsVsN0yRpOk7`):** gatilhos "A cada 5 minutos" (teste rápido), "A cada hora" (teste completo) e "Toda segunda às 3h" (compactar semana) → nós HTTP com header `x-internal-token` (convertidos pra credencial `js-painel — token interno` em 28/09). **Os 3 gatilhos já estavam desconectados** antes da remoção — a automação não rodava; os testes eram disparados pela tela.

## Tabelas — MANTIDAS no banco (decisão do Jonas, 28/09)
`m3u_listas`, `m3u_testes`, `m3u_snapshots`, `m3u_conteudo`, `m3u_resumos_semanais` — código removido, dados intocados (referência histórica). Nenhum código lê/grava mais nelas; podem ser exportadas e apagadas depois se quiser.

## Avaliar lista IPTV sem essa funcionalidade
Pelo terminal, com o checklist de `feedback_avaliacao_lista_iptv_xtream` (arquivado na memória global): `curl` com UA de player no `player_api.php` (conta, conexões, validade, contagem por tipo) + `ffprobe` num canal. Baseline de fornecedores em `reference_comparativo_fornecedores_iptv.md` (memória global).
