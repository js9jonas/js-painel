---
name: Player IPTV web — estado e correções
description: Página /player do js-painel: arquitetura, bugs corrigidos em mai/2026 e limitações conhecidas
type: project
originSessionId: d3bb9e7c-73b6-4966-bbaf-0649dde79c88
---
## Página player (`src/app/(dashboard)/player/page.tsx`)

Player web de streams IPTV embutido no js-painel. Suporta HLS (hls.js), MPEG-TS (mpegts.js), playlist M3U e Xtream Codes API.

**Proxy de stream:** `src/app/api/stream-proxy/route.ts` — necessário porque o painel roda em HTTPS e os servidores IPTV usam HTTP (mixed content sem proxy).

**PainelListas (painel lateral direito):** carrega servidores de `m3u_listas`, navega categorias e canais via `/api/m3u-listas/[id]/conteudo`. Conteúdo vem do `player_api.php` dos servidores Xtream.

---

## Correções aplicadas em mai/2026 (commit e49a422)

### Bug 1 — Proxy reescrevia lista de canais M3U
O proxy não distinguia manifesto HLS de lista de canais M3U. Reescrevia URLs dos canais para `/api/stream-proxy?url=...`, mas `parsearM3U` só aceita `http://` → 0 canais encontrados.
**Fix:** só reescreve se o conteúdo contém `#EXT-X-` (tag exclusiva de HLS manifests). Listas M3U retornam sem modificação.

### Bug 2 — URL base errada após redirect (segmentos HLS)
Servidores como FAST (`js9f.net`) redirecionam `302` para outro IP (`152.233.19.80`). Segmentos são relativos ao IP final, mas o proxy usava o URL original como base → segmentos apontavam para o host errado.
**Fix:** usa `upstream.url` (URL final pós-redirect) em vez de `decoded`.

### Bug 3 — Formato de URL inválido no PainelListas
API construía `/${id}/index.m3u8` — testados todos os servidores: nenhum aceita esse formato.
**Fix:** usa `/${id}.m3u8`. Testados FAST, UNIPLAY, LIEBE: todos aceitam via redirect.

### Simplificação UX
Proxy CORS removido como toggle manual. Agora sempre ativo para URLs externas (`isExternal(url)`), sem o usuário precisar ativar.

---

## Formatos de URL por servidor (descobertos em mai/2026)

| Servidor | Host M3U | Formato stream real | HLS suportado? |
|---|---|---|---|
| FAST | `js9f.net` | `/{user}/{pass}/{id}.ts` | Sim, via `/{user}/{pass}/{id}.m3u8` (302→outro IP) |
| UNIPLAY | `monitor3.cfd` | `/live/{user}/{pass}/{id}.m3u8` | Sim (307) |
| LIEBE | `rteomi.xyz:80` | `/{user}/{pass}/{id}` | Sim, via `/live/{user}/{pass}/{id}.m3u8` (302) |
| NATV | `gm08.top:80` | `/{user}/{pass}/{id}` | Não (405) — usar fluxo M3U paste |
| CLUB | `bandeira1.info` | não verificado | — |
| CENTRAL | `bandeira5.info` | não verificado (servidor não respondeu) | — |

---

## Limitações conhecidas

- **NATV** não suporta HLS: PainelListas falha com `manifestLoadError`. Usar fluxo de colar URL M3U direto no player (mpegts.js via TS stream).
- **CLUB (`bandeira1.info`):** DNS com problema — servidor instável/inacessível desde mai/2026. Falhas no player provavelmente são instabilidade do servidor, não bug de código.
- **CENTRAL:** servidor não respondeu durante análise — formato de URL a verificar.
- **Séries:** PainelListas lista séries mas sem URL direta (precisaria buscar episódios via `get_series_info`).

## Pendente (mai/2026) — investigação das listas que ainda falham

Algumas listas ainda falham ao abrir. Ao retomar este assunto em qualquer sessão futura, **fazer as 4 perguntas abaixo antes de mexer em código**:

1. **Quais listas específicas falham?** Nome no PainelListas (FAST, UNIPLAY, NATV…) ou URL colado no campo.
2. **Qual erro aparece nas métricas?** Texto vermelho exato na parte de baixo do player.
3. **O stream funciona no Duplex Play?** Testar a mesma lista/credenciais no Duplex — confirma se é problema do servidor ou do player web.
4. **DevTools (F12 → Network) durante a falha:** procurar requisições vermelhas em `/api/stream-proxy`, anotar o status HTTP (404, 502, 405…) e o URL completo — é o dado mais diagnóstico.

**Why:** Player funcionava mas não conseguia reproduzir nenhuma lista por 3 bugs sobrepostos no proxy e na construção de URLs.
**How to apply:** Ao trabalhar no player ou no proxy, considerar esses formatos de URL e a distinção HLS manifest vs M3U channel list. Ao retomar investigação, pedir ao Jonas quais listas específicas falham e qual erro aparece.
