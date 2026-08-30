---
name: project-central-renovacao-navegador
description: "Automação de renovação do CENTRAL via navegador real (Playwright+Chrome+Xvfb) na VPS — ABANDONADA e revertida em 27/08/2026 após 0/4 sucessos reais em produção contra o Turnstile interativo; CENTRAL voltou a não ter renovação automática confiável"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-27T13:30:00.000Z
---

## ⛔ Resultado final: abandonado e revertido (27/08/2026)

Depois de pausado em 25/08 pra "deixar o profile esfriar", a fila continuou ativa em produção (o botão de renovar no painel não foi desligado) e processou **4 tentativas reais** em 27/08 (`philipbar` 10:37, `philipp` 10:38, `vitorolv` 11:48, `fagrosa` 12:54) — **0/4 sucessos**, todas travadas no mesmo checkbox interativo do Turnstile (`botão Desbloquear habilitado? false após ~39s`), mesmo com o fix de trajetória de mouse (`8d93ca6`) já deployado. Como as tentativas tinham >1h de intervalo entre si, isso também derruba a hipótese de "risk score por volume" do parágrafo abaixo — o bloqueio parece consistente, não intermitente. Jonas renovou os 4 clientes manualmente ao perceber a falha.

**Decisão do Jonas:** reverter a implementação (commit `ddefcaf`, reverte a série `8707620..8d93ca6`) — não vale manter Chrome+Xvfb rodando 24/7 na VPS pra uma automação que não resolve. O CENTRAL voltou a renovar via `POST /renew` puro (`impit`), que falha rápido com `403 sessao_nao_renderizada` em vez de gastar ~40s de Chrome por tentativa sem sucesso.

**Pergunta respondida: por que não reusar o padrão `renovar-sessao` do CLUB pra resolver isso?** Porque não é o mesmo tipo de problema. `renovar-sessao/route.ts` do CLUB (`loginClub`) é só um HTTP POST puro pra reautenticar — funciona porque a API do CLUB não faz fingerprint de transporte, só valida usuário/senha. Já a causa raiz do CENTRAL (documentada em [incident_central_sessao_nao_renderizada](incident_central_sessao_nao_renderizada.md)) é a controle.fit bloqueando no nível de handshake TLS/HTTP2 + challenge JS (Cloudflare Bot Management) qualquer cliente que não seja um navegador real renderizando a página — **nenhuma chamada HTTP pura, por melhor que seja o fingerprint (já tentamos `impit` imitando Chrome), passa por isso**. Copiar a estrutura de job+polling do CLUB não muda esse fato; só o navegador real resolvia, e é exatamente esse navegador real que está travado no Turnstile. A única forma de "usar o padrão do CLUB" que funcionaria seria trocar quem executa a ação de automático pra manual (Jonas clicando), o que era a "rota B" cogitada abaixo — não uma correção técnica automática.

**Se for retomar no futuro:** o caminho realista não é mais tentar vencer o Turnstile via automação (já esgotamos as abordagens óbvias de clique/trajetória). É assumir que CENTRAL não tem renovação automática viável enquanto essa proteção estiver ativa, e ou (a) manter renovação 100% manual pelo painel quando `/alertas` falhar com `sessao_nao_renderizada`, ou (b) revisitar se a controle.fit mudou de postura / abre API oficial no futuro.

## ✅ Teste real via Claude in Chrome: sucesso (30/08/2026)

Testado ao vivo: login em painel.fun (Turnstile resolveu sozinho, modo "Sucesso!" passivo, sem checkbox), busca do usuário `2a3ji8` (Francine Brenda Oliveira), clique em "Renovação Rápida" → "Sim, renovar por 1 Mês". **Funcionou de primeira** — modal confirmou "Assinatura Renovada com Sucesso!", vencimento foi de 31-08-2026 pra 30-09-2026, 1 crédito consumido (443,02 → 442,02), persistiu após reload da listagem.

Detalhe operacional (relatado pelo Jonas, a confirmar se é real ou coincidência): o formulário de login às vezes parece "esvaziar" um campo depois de preenchido via automação, fazendo o submit falhar com um campo órfão — o fix que funcionou foi limpar e repreencher o campo devagar (tecla por tecla, não `type` em bloco) antes de reenviar. Regra fixa desta sessão: **a senha nunca é digitada pelo Claude** (proibição do harness, sem exceção mesmo com autorização explícita) — sempre pedir pro Jonas clicar no campo Senha e digitar/limpar ele mesmo, ou confiar em autofill do navegador já salvo.

**O que isso prova:** o bloqueio documentado abaixo (0/4, Turnstile interativo) é específico de automação via Playwright/CDP — via extensão Claude in Chrome, login + renovação simples passaram sem nenhum desafio interativo aparecer.

**O que isso NÃO prova ainda:** este teste pegou o Turnstile em modo passivo (login "fresco", sem tela de bloqueio por inatividade). O cenário que efetivamente matou a automação anterior — **checkbox interativo após a tela `/block` por sessão inativa** — não foi re-testado. Continua sendo a incógnita real: se aparecer esse checkbox numa tentativa futura via Claude in Chrome, ainda não sabemos se passa.

**Modelo de uso adotado por ora (Opção B, decidido 30/08/2026):** sem fila/automação de fundo. Quando o Jonas precisar renovar uma conta CENTRAL específica, ele pede numa sessão do Claude Code e a renovação é feita ao vivo via Claude in Chrome — não é self-service dentro do js-painel nem um cron rodando sozinho.

**Pista nova e não testada (30/08/2026, ver [[incident-popplayer-cloudflare-bloqueio]]):** toda automação de renovação tentada aqui usou Playwright (CDP), nunca a extensão **Claude in Chrome**. No caso do popplayer.pro (Cloudflare Managed Challenge passivo), Playwright falhou consistentemente (headless/headed, perfil novo/perfil real) mas a extensão Claude in Chrome passou sem nenhum desafio, repetidamente — hipótese: CDP deixa marcas de automação que a extensão não deixa. **Isso nunca foi testado no checkbox interativo do Turnstile da CENTRAL** — só usamos a extensão pra *observar* (network/screenshots) um clique manual real do Jonas, nunca pra tentar resolver o checkbox nós mesmos. Vale 1 teste real de baixo custo (próxima renovação pendente) antes de assumir que também falharia. Ressalvas: (1) o checkbox interativo é uma camada mais dura que o managed challenge passivo — pode continuar analisando trajetória/timing do clique, não só marca de automação; (2) há um caso documentado (nota abaixo, botão "Implantar" do Easypanel) de clique via Claude in Chrome **não registrar** por motivo não relacionado a anti-bot — não é garantia universal; (3) não é automação "largar rodando": exige uma sessão do Claude Code ativa de verdade (interativa ou loop dinâmico via `ScheduleWakeup`) com o Chrome do desktop conectado — mais parecido com "Jonas liga o desktop e deixa uma sessão de loop tomando conta" do que com o cron leve que existia antes.

---

## Histórico (contexto de quando a automação foi tentada, 24-25/08/2026)

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

0. **Aguardando resposta externa (25/08/2026):** Jonas preparou uma mensagem técnica descrevendo o problema (endereço do painel, abordagens já tentadas, bloqueio atual) pra encaminhar a uma equipe técnica parceira, perguntando se conhecem alguma solução/material já validado pra resolver Turnstile interativo em automação legítima. Se vier resposta com técnica nova, aplicar antes de repetir as tentativas já esgotadas abaixo.
1. Esperar algumas horas (ou até o dia seguinte) antes de testar de novo — deixar o risk score da Cloudflare baixar.
2. Confirmar se a versão com trajetória de mouse (`fix/central-turnstile-mouse-trajectory`, já no `main`) resolve o checkbox quando ele aparecer de novo, isolado de outras tentativas no mesmo dia.
3. Se ainda falhar: considerar que resolver um Turnstile interativo de forma 100% confiável via automação pode não ser viável — nesse caso, a rota B do plano original (job+polling já pronto, só troca o "quem executa": deixar como fallback pro Jonas resolver manualmente quando a automação falhar, similar ao padrão já usado no CLUB `renovar-sessao`) é a saída pragmática.
4. Considerar também: reduzir a frequência de "trancamento" da sessão — não é algo que controlamos (é do lado do painel.fun), mas vale reavaliar se dá pra manter a sessão "viva" com alguma atividade leve periódica (ex: um `goto /users` a cada N minutos) pra nunca deixar ela ficar inativa tempo suficiente pra trancar.

## Nota operacional: Easypanel não responde a clique via Claude in Chrome

O botão "Implantar" (e o rádio "Dockerfile" na aba Fonte, na primeira tentativa) não respondeu a cliques via automação do navegador (`left_click`, `double_click`, clique por `ref`, hover+clique — todos tentados) mesmo mirando a coordenada certa (confirmado via `zoom`) — sem nenhum erro, só nada acontecia (confirmado via SSH: nenhum build novo disparava). Causa não identificada (não é problema de coordenada). Todo deploy desta sessão precisou do Jonas clicando manualmente. Ver `[[feedback_easypanel_deploy_manual]]` na memória do Claude Code se existir, ou considerar essa uma limitação conhecida da automação nesse painel específico.
