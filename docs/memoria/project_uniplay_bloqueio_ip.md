---
name: project-uniplay-bloqueio-ip
description: "Bloqueio de IP na API gesapioffice.com contornado com proxy residencial Webshare; 23/07 achado variante — IP do próprio pool rotativo cai no bloqueio às vezes, retry adicionado no login()"
metadata: 
  node_type: memory
  type: project
  originSessionId: b7cdcfa5-12da-4718-8449-2452c75161ca
  modified: 2026-08-24T01:32:15.082Z
---

## Situação atual (01/06/2026)

O adapter UNIPLAY foi migrado de Python/curl_cffi para **impit** (npm, Rust, TLS Chrome nativo). O código está correto e funciona localmente, mas **o IP da VPS está bloqueado** pelo servidor `gesapioffice.com`.

**Why:** gesapioffice.com bloqueia IPs de data centers. Localmente `impit` retorna 200 com token válido. Da VPS retorna 404.

**How to apply:** Antes de qualquer nova tentativa de "fazer funcionar no container", confirmar que o problema é resolvido no nível de rede (IP), não no nível de código.

## O que já foi feito e está no main

- `src/lib/painel-adapters/uniplay.ts` — usa `impit.fetch()` (TLS Chrome real)
- `nixpacks.toml` — só `nodejs_20`, sem Python
- `next.config.js` — `serverExternalPackages: ["impit"]`
- `PainelServidorCard.tsx` — botão "Renovar sessão (VPS)" removido; `TIPOS_AUTO_LOGIN = ["uniplay"]`
- Python script e rota refresh-session são código morto (podem ser deletados)

## ✅ Resolvido em 02/06/2026 — confirmado estável em 06/07/2026

Proxy residencial Webshare contratado ($3,50/mês). Endpoint com credenciais reais em [[reference-ferramentas-adquiridas]] (não fica na memória aqui).
Variável `UNIPLAY_PROXY_URL` adicionada no Easypanel. UNIPLAY aparece "Conectado" com créditos.
Jonas confirmou em 06/07/2026 que não enfrenta mais problemas — considerar encerrado, sem próximos passos pendentes.
Ver [[reference-ferramentas-adquiridas]] para credenciais completas do Webshare.

## Credenciais e IDs relevantes

- Painel ID no banco: `id = 3`, `tipo = 'uniplay'`, `usuario = 'jonasrev21'`
- API: `https://gesapioffice.com/api/login`
- Front-end do painel: `http://searchdefense.top/`

## ⚠️ 23/07/2026 — variante do bloqueio: IP do proxy rotativo também pode cair na lista

Erro visto: "UNIPLAY login falhou: 404" mesmo com `UNIPLAY_PROXY_URL` configurada certinho no Easypanel (confirmado via `eptunnel` + navegação, valor idêntico ao `.env.local`). Login testado manualmente com curl (direto e via proxy Webshare) deu 200 nas duas formas — ou seja, API, credenciais e proxy Webshare estavam OK no momento do teste. Causa: o pool Webshare é rotativo (`tqhplwpu-rotate`) e às vezes entrega um IP que também está na lista de bloqueio de datacenter do gesapioffice.com — não é falha de conexão/timeout, é uma resposta HTTP 404 normal.

**Why:** `impitFetch` (`proxy-retry.ts`) só faz retry quando `client.fetch()` lança **exceção** (502/timeout/connect) — uma resposta HTTP 404 "normal" não entra nesse retry. A função `login()` em `uniplay.ts` lançava o erro na primeira resposta ruim, sem chance do proxy rotacionar pra outro IP.

**Correção aplicada:** `login()` agora tenta de novo (até 3x, delay crescente) quando `res.status === 404`, mesmo padrão que `listarUsuarios()` já usava pra 404/401. **Confirmado commitado** (`d906cc5` "fix: retry no login UNIPLAY quando proxy rotativo cai no bloqueio de IP (404)"), com 2 commits de refinamento posteriores (timeout curto no impit via proxy, cache curto da listagem) — não é mais uma pendência.

**How to apply:** Se o erro "UNIPLAY login falhou: 404" voltar a aparecer mesmo com essa correção, provavelmente é falha real (API fora do ar, credencial mudou, ou os 3 IPs tentados caíram todos no bloqueio — raro mas possível). Testar login manual via curl (direto e via proxy) é o jeito mais rápido de isolar: 200 nos dois = intermitência do pool; 404 nos dois = API/credencial mudou; 200 direto e 404 via proxy = Webshare com problema (ver incidente `auth_circuit_breaker_open` de 03/06 em [[reference-ferramentas-adquiridas]]).
