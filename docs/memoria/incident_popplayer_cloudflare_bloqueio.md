---
name: incident-popplayer-cloudflare-bloqueio
description: "Investigação completa de automação do POP Player (popplayer.pro) — descartada; site protegido por Cloudflare Bot Management bloqueia qualquer cliente que não seja navegador humano real, mesmo Chrome real via Playwright/CDP. Cadastrado só como app manual (sem adapter), 30/08/2026"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-30T00:00:00.000Z
---

## Resultado final: sem adapter, cadastro manual (30/08/2026)

Jonas pediu adapter completo (listar/criar/editar/excluir dispositivo) pro POP Player, no mesmo padrão de FunPlays/LazerPlay/CorePlayer/SmartOne. Mapeei o app inteiro, mas **toda automação foi descartada** depois de testes reais — ver seção de causa raiz. Decisão final: cadastrado só como entrada em `public.apps` (`id_app=32`, `exige_licenca=false`, ver `sql/009_apps_popplayer.sql`), sem `painel_servidores`/adapter. Gerenciamento de dispositivo é manual, direto em popplayer.pro/meuplayer.

## Mapeamento do app (útil se algo mudar no futuro)

Painel PHP server-rendered (não é API JSON como FunPlays/CorePlayer), plataforma tipo IBO Player rebrand — ver também [[project-popplayer-avaliacao-fornecedor]] na memória global (avaliação do fornecedor).

- `GET /meuplayer/index.php` — login (`username`, `password`, sem CSRF), fora da proteção Cloudflare
- `GET /meuplayer/logout.php` — fora da proteção
- `GET /meuplayer/users.php` — lista de dispositivos (HTML), **atrás da proteção**
- `GET /meuplayer/users_create.php` — form: `mac_address`, `client_name`, `title` (nome playlist), `url` (M3U), `expire_date`; campo hidden `key` (token fixo de conta, não rotativo) — **atrás da proteção**
- `GET/POST /meuplayer/users_update.php?update={id}` — mesmos campos + `id` — **atrás da proteção**
- `GET /meuplayer/users.php?page=1&per_page=25&delete={id}` — exclusão direta — **atrás da proteção**

**Sem licença/renovação real por dispositivo**: campo "Licença MAC" é só uma data solta (`expire_date`), sempre `2050-01-01` por padrão — confirma o que Jonas disse (plano de uso ilimitado por device, R$35/mês). Cada dispositivo criado consome 1 "crédito" do pool (~999977, praticamente ilimitado); excluir devolve o crédito. Confirmado ao vivo criando/excluindo um dispositivo de teste real.

## Causa raiz do bloqueio (testado e confirmado, não é especulação)

`users.php`/`users_create.php`/`users_update.php` respondem 403 com header `cf-mitigated: challenge` (Cloudflare Managed Challenge) pra qualquer cliente que não seja navegador real renderizando a página. **Mesma causa raiz já documentada em [[incident-central-sessao-nao-renderizada]]** — fingerprint de transporte (TLS/HTTP2 + execução JS), não payload/sessão/IP.

Testes que **falharam**, em ordem, todos a partir do mesmo IP residencial (confirmado idêntico entre navegador e Node via `api.ipify.org`, descartando IP como variável):

1. `fetch` puro em Node, headers de navegador completos (`Sec-Fetch-*`, `sec-ch-ua`, UA real) — POST de login "sucede" (200) mas nunca seta cookie de sessão; GET a `users.php` sempre 403.
2. CapSolver `AntiCloudflareTask` com proxy Webshare (`UNIPLAY_PROXY_URL`) — resolveu o challenge (retornou `cf_clearance` válido), mas o proxy é **rotativo** (cada conexão nova = IP diferente), então o cookie IP-bound morreu na hora. Autenticação com sufixo de sessão sticky (`usuario-<id>`) falhou — esse plano Webshare não suporta.
3. Chrome real (`channel:"chrome"`) via Playwright, `context.newPage()` fresco, headless e headed — **ambos desafiados** (bug na 1ª rodada de teste: a página de challenge veio em português, "Um momento…", e a checagem só procurava "Just a moment" em inglês — falso negativo corrigido antes de reportar).
4. Chrome real via Playwright com `launchPersistentContext` apontando pra uma cópia do perfil real já usado pela automação da CENTRAL (`~/.config/playwright-profile`, anos de histórico) — **ainda desafiado**, headless e headed.
5. `impit` (`browser:"chrome"`, impersona TLS/JA3) reaproveitando `cf_clearance` + `User-Agent` genuínos extraídos de um login real via Playwright, mesma IP, mesmo instante — **ainda 403**. Fecha a hipótese de "resolve uma vez com navegador, reaproveita depois com cliente leve" (técnica padrão de mercado 2026, documentada mas não funciona nesse site).

**O único método que funcionou de verdade** (confirmado com screenshots reais, várias vezes): a extensão Claude in Chrome controlando o Chrome já aberto e normal do Jonas. Hipótese mais provável pra por que Playwright falha mesmo com Chrome real: Playwright controla via Chrome DevTools Protocol (CDP), que deixa marcas detectáveis (`navigator.webdriver`, artefatos de automação) independente de headless/headed/perfil — a extensão não liga esse protocolo de automação, só simula input num Chrome comum. Bate com o material de mercado mais atual: até bibliotecas "stealth" (patchright, camoufox) que tentam mascarar isso continuam detectáveis pelo mesmo motivo.

## Por que não insistir

- Ferramentas que mascaram especificamente sinais de automação (patchright/camoufox/nodriver) são "stealth"/anti-detecção por definição — decisão consciente de não seguir por aí.
- Mesmo se funcionasse, a arquitetura resultante precisaria de navegador real e vivo em **toda** chamada (listar/criar/editar/excluir), não só um refresh periódico como a CENTRAL usa pro login — mais pesado que qualquer adapter existente.
- Não há renovação/licença real por dispositivo mesmo (ver acima) — o ganho de automatizar seria só sincronizar uma lista, não compensa o custo de manter essa infra.

## Se for retomar no futuro

Só faz sentido reabrir se a Cloudflare mudar de postura no domínio, ou se popplayer.pro abrir uma API oficial. Não repetir as 5 abordagens acima — já esgotadas e documentadas com teste real.
