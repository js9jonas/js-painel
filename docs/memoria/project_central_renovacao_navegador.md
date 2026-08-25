---
name: project-central-renovacao-navegador
description: "Automação de renovação do CENTRAL via navegador real (Playwright+Chrome+Xvfb) rodando na VPS — infra pronta e deployada, mas travada num desafio interativo do Turnstile na tela de bloqueio de sessão (25/08/2026)"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-25T16:40:00.000Z
---

## Contexto

Continuação direta de [incident_central_sessao_nao_renderizada](incident_central_sessao_nao_renderizada.md): `POST /renew` via API pura (mesmo com `impit`, token válido, com/sem `plan_id`/`amount`) é bloqueado com `403 sessao_nao_renderizada` — confirmado ser fingerprint de transporte (TLS/HTTP2), não payload/sessão/header. API oficial negada pela controle.fit (pedido formal via master → equipe técnica: "eles não integram... resposta foi não").

Única forma confiável de renovar: reproduzir o clique real numa instância de Chrome de verdade. Decisão (25/08/2026): rodar isso na VPS (não no desktop do Jonas), aceitando o custo de infra, com fila serializada porque o uso real é em rajada (várias renovações em poucos minutos via `/alertas` à noite).

## Arquitetura implementada

- **`src/lib/central-browser-queue.ts`** — singleton em memória (ok pra single instance, Easypanel não é serverless). `chromium.launchPersistentContext` lazy, reaproveitando a mesma instância/aba entre jobs de uma fila FIFO, fechando por inatividade (~8min) pra liberar RAM. Exporta `renovarViaBrowser(usuario, senha)`.
- **`central.ts`** (`renovar()`) — busca a conta via API (leitura não é bloqueada, só falha rápido se a conta não existir), delega a escrita pra `renovarViaBrowser`.
- **Rota `/api/paineis/servidores/[id]/renovar`** — vira job+polling (mesmo padrão de `renovar-sessao/route.ts` do CLUB) quando `painel.tipo === 'central'`, porque a fila serializada numa rajada pode passar do timeout de borda (~30s) se ficar síncrona.
- **`src/lib/renovar-polling.ts`** (client) — helper compartilhado por `RenovarViaAPIButton.tsx` e `RenovarAssinatura.tsx`, trata tanto resposta síncrona (outros painéis) quanto job+polling (CENTRAL).
- **`Dockerfile`** novo — substitui o build automático via Nixpacks (que não tinha Chromium). Node 20 + Chrome real (não o Chromium do Playwright — é o binário já comprovado passando na checagem anti-bot) + Xvfb.

## Infra da VPS

- **Build do Easypanel**: trocado de Nixpacks pra Dockerfile custom (aba Fonte → Construção → Dockerfile). Feito manualmente na UI pelo Jonas (minha automação via Claude in Chrome não conseguiu clicar em "Implantar" nem nesse rádio button de forma confiável — ver nota no fim).
- **Bind mount**: `/root/js-painel-central-profile` (host) → `/app/.central-profile` (container), configurado na aba Armazenamento do Easypanel — pro profile do Chrome sobreviver a redeploys. Bootstrapado copiando `/home/jonas/.config/playwright-profile` (do desktop, já logado) via scp.
- **Swap adicionado** (4GB, `/swapfile`, persistente via `/etc/fstab`) — VPS não tinha nenhum swap, achado ao debugar o OOM do build (ver abaixo). Boa prática de resiliência independente desse projeto.

## Bugs de infra achados e corrigidos, em ordem (todos via teste real do `docker build` direto na VPS via SSH, não só confiando no log truncado da UI do Easypanel)

1. **`NO_PUBKEY` no apt do Chrome** — o `.pub` que a Google distribui é ASCII-armored, não serve direto como keyring sem `gpg --dearmor`. Fix: baixar o `.deb` direto (`dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb`) e `apt install ./pacote.deb`, mais simples que configurar o repositório deles.
2. **Heap OOM no `npm run build`** — V8 tem teto de heap padrão ~2GB independente da RAM real disponível no container. Turbopack + type-check do Next 16 estoura isso. Fix: `NODE_OPTIONS=--max-old-space-size=6144` só no comando de build (não persiste pro runtime).
3. **`DATABASE_URL não definido` no "Collecting page data"** — o Easypanel passa as env vars do app como `--build-arg` só quando o build é Dockerfile custom (Nixpacks já injetava direto como env do processo). Sem `ARG <nome>` declarado pra cada uma, o Docker descarta o valor. Fix: declarar `ARG`+`ENV` pra todas (lista extraída do container real via `docker exec ... printenv`, nunca hardcoded).
4. **`SingletonLock` stale** — container Swarm derrubado sem o Chrome fechar limpo deixa o lock apontando pro hostname do container ANTERIOR; todo container novo tem hostname diferente, então o Chrome sempre recusa abrir ("profile in use by another Chrome process on another computer"). Fix: remover `SingletonLock`/`SingletonSocket`/`SingletonCookie` antes de todo `launchPersistentContext` (seguro porque o container é sempre single-instance).

## Bloqueio atual (não resolvido, pausado 25/08/2026)

A sessão do Chrome **não desloga** (nunca vai pra `/login`) mas **tranca** com uma tela de bloqueio (`/lock`) após inatividade — pede a senha de novo + resolve um Turnstile. Esse Turnstile é inconsistente:
- Às vezes resolve sozinho em modo managed ("Sucesso!" automático em ~3s) — visto no primeiro teste manual do dia.
- Às vezes escala pra um **checkbox real interativo** ("Confirme que é humano") — visto em 3 testes reais seguidos depois.

Tentativas de resolver o checkbox automaticamente, todas sem sucesso até agora:
1. `frameLocator` + seletor de checkbox dentro do iframe → não achou (provável iframe aninhado).
2. Clique por coordenada calculada a partir do bounding box do texto "Confirme que é humano" (`page.mouse.click` direto) → coordenada visualmente correta (confirmado em screenshot), mas o checkbox continuou vazio.
3. Mesma coordenada, mas com `mouse.move` em 2 etapas (ponto distante → alvo em 20 passos) + delay antes do down/up, simulando trajetória humana → **ainda não testado até o fim** (deploy feito, mas o teste seguinte deu o mesmo erro — não confirmamos ainda se essa tentativa específica rodou com o código novo ou se pegou build antigo).

**Hipótese mais forte**: a Cloudflare está escalando o rigor do desafio (managed → interativo) especificamente por causa do **volume de tentativas repetidas no mesmo profile no mesmo dia** (>5 idas à tela de lock em poucas horas, entre testes manuais e automatizados). Se for isso, a solução não é só técnica (acertar o clique) — também precisa **espaçar as tentativas** pra não alimentar esse risk score.

**Decisão do Jonas (25/08/2026): pausar e retomar mais tarde**, deixando o profile "esfriar" antes do próximo teste.

## Debug: como investigar se travar de novo

`central-browser-queue.ts` já tem instrumentação: `log()` (prefixo `[CENTRAL-browser]`, visível em `docker logs`) em cada etapa, e `salvarDiagnostico()` que salva screenshot em `${PROFILE_DIR}/debug-<tag>-<timestamp>.png` (dentro do bind mount, sobrevive a restart — puxar via `scp root@168.231.98.162:/root/js-painel-central-profile/debug-*.png`).

Tags salvas: `nao-logado`, `campo-busca-nao-encontrado`, `linha-nao-encontrada`, `clique-renovar-falhou`, `lock-inicial`, `lock-apos-senha`, `lock-ainda-travado`, `lock-turnstile-nunca-resolveu`.

## Próximos passos (quando retomar)

1. Esperar algumas horas (ou até o dia seguinte) antes de testar de novo — deixar o risk score da Cloudflare baixar.
2. Confirmar se a versão com trajetória de mouse (`fix/central-turnstile-mouse-trajectory`, já no `main`) resolve o checkbox quando ele aparecer de novo, isolado de outras tentativas no mesmo dia.
3. Se ainda falhar: considerar que resolver um Turnstile interativo de forma 100% confiável via automação pode não ser viável — nesse caso, a rota B do plano original (job+polling já pronto, só troca o "quem executa": deixar como fallback pro Jonas resolver manualmente quando a automação falhar, similar ao padrão já usado no CLUB `renovar-sessao`) é a saída pragmática.
4. Considerar também: reduzir a frequência de "trancamento" da sessão — não é algo que controlamos (é do lado do painel.fun), mas vale reavaliar se dá pra manter a sessão "viva" com alguma atividade leve periódica (ex: um `goto /users` a cada N minutos) pra nunca deixar ela ficar inativa tempo suficiente pra trancar.

## Nota operacional: Easypanel não responde a clique via Claude in Chrome

O botão "Implantar" (e o rádio "Dockerfile" na aba Fonte, na primeira tentativa) não respondeu a cliques via automação do navegador (`left_click`, `double_click`, clique por `ref`, hover+clique — todos tentados) mesmo mirando a coordenada certa (confirmado via `zoom`) — sem nenhum erro, só nada acontecia (confirmado via SSH: nenhum build novo disparava). Causa não identificada (não é problema de coordenada). Todo deploy desta sessão precisou do Jonas clicando manualmente. Ver `[[feedback_easypanel_deploy_manual]]` na memória do Claude Code se existir, ou considerar essa uma limitação conhecida da automação nesse painel específico.
