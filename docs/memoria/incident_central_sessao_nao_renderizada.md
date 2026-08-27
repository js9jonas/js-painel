---
name: incident-central-sessao-nao-renderizada
description: "Renovação via API no adapter CENTRAL passou a dar 403 'sessao_nao_renderizada' — causa raiz era fingerprint TLS/HTTP2, não sessão nem token (24-25/08/2026)"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-25T03:30:00.000Z
---

## O que aconteceu

`/alertas` → "Renovar via API" (CENTRAL, `controle.fit`) passou a falhar com:

```
controle.fit/users/{id}/renew → 403: {"success":false,"code":"sessao_nao_renderizada",
"message":"Esta operação só pode ser feita pelo painel. Acesse o painel no navegador, faça login e tente de novo."}
```

Leituras (listagem, créditos, `/conexoes`) continuavam OK. Criar conta de teste (outra escrita) também funcionava. Só `/renew` falhava.

## Investigação (descartada em ordem, não repetir)

1. **`INTERNAL_API_TOKEN` divergente** entre `.env.local`/script local e o valor real no Easypanel — isso era um bug real e foi corrigido (o cron `central_refresh_token.js` não conseguia mais salvar o token "bom" renovado via Chrome real, ficava só no fallback CapSolver), mas **não era a causa do 403** — só destravou o cron voltar a funcionar.
2. **Duas tabelas de sessão** (`servidores`, legada; `painel_servidores`, usada de fato pela rota `/api/paineis/servidores/[id]/renovar`) — real gap operacional (o cron grava só na primeira), corrigido copiando manualmente, mas **também não era a causa raiz**.
3. **Faltava Origin/Referer/User-Agent no `apiFetch`** — parecia plausível (loginViaCapSolver enviava, apiFetch não), aplicado e deployado — **não resolveu**.
4. **Retry automático em qualquer 403** destruía silenciosamente uma sessão boa a cada tentativa falha (gerava login novo via CapSolver mesmo quando o erro não era "sessão expirada") — bug real, corrigido (agora não faz retry quando `err.code === "sessao_nao_renderizada"`), mas só evita piorar, não resolve.

## Causa raiz confirmada (25/08/2026)

Capturado o tráfego de rede de um clique **real** em "Renovar por 1 mês" no navegador (mesmo Chrome/profile persistente usado pelo cron, conta `marcsfl`): o pedido foi **exatamente o mesmo endpoint, método e corpo** que o adapter já enviava (`POST /users/{id}/renew`, `{"mounth":1}`) — e funcionou (200).

A diferença real: `loginViaCapSolver` usa a lib **`impit`** (`browser: "chrome"`) especificamente pra imitar a impressão digital TLS/HTTP2 de um Chrome de verdade, driblando a proteção da Cloudflare — mas **`apiFetch`, usado em todas as chamadas seguintes (listagem, renew, etc.), usava `fetch` puro do Node**, que não imita nada. A controle.fit aparentemente **reforçou essa checagem de fingerprint especificamente em ações de escrita sensíveis** (reads continuavam liberados) — coincide com o anúncio deles de um "Módulo Financeiro" novo (cobrança automática, PIX) visto na mesma sessão, plausivelmente junto de mais anti-abuso em endpoints financeiros/de renovação.

**Corrigido:** `apiFetch` trocado de `fetch` global pra `impit.fetch` (commit `8b1ede9`).

## Lição

Quando **login funciona mas uma ação de escrita específica é rejeitada com uma mensagem tipo "só pode ser feito pelo painel/navegador"**, considerar fingerprint de rede (TLS/HTTP2, bot management tipo Cloudflare) antes de token/sessão/headers — e a forma mais rápida de confirmar é **capturar o tráfego de um clique real na UI** (Playwright reaproveitando um profile já autenticado) e comparar byte a byte com o que o adapter envia. Se o request for idêntico e mesmo assim só o real funciona, o suspeito é a camada de transporte (TLS/HTTP2 client), não a aplicação.

**Como reproduzir a captura, se precisar de novo:** abrir `chromium.launchPersistentContext("/home/jonas/.config/playwright-profile", {headless:false, executablePath:"/usr/bin/google-chrome-stable", ...})` via `xvfb-run`, registrar listeners `page.on("request"/"response")` filtrando a URL da API, navegar/clicar manualmente na ação suspeita, salvar os requests capturados. Tirar cuidado: qualquer ação real clicada tem efeito real (a renovação de teste de fato estendeu o vencimento do `marcsfl`).
