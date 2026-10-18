# Infraestrutura do js-painel — o que existe e como migrar

Documento de referência pra trocar de estrutura sem surpresa: contratar um **banco separado** (Postgres
gerenciado), **mudar de VPS** ou separar o **portal do cliente** num serviço próprio. Atualizado em
18/10/2026. O repositório é público: aqui só há **nomes** de variáveis e **onde** cada segredo está
guardado, nunca valores.

**Regra:** toda mudança de infraestrutura (domínio, variável, volume, usuário de banco, webhook
cadastrado em terceiro, job) atualiza este arquivo no mesmo commit.

---

## 1. Visão geral

```
                 Internet
                    │
      ┌─────────────┴──────────────┐
      │  VPS Hostinger 168.231.98.162 (Docker Swarm + Easypanel)
      │                                                            
      │  Traefik (HTTPS Let's Encrypt, automático pelo Easypanel)  
      │     ├── painel.jssistemas.online ──┐                      
      │     ├── cliente.jssistemas.online ─┼─► serviço js_painel (Next.js, porta interna 80)
      │     └── js-painel.l1fcxz.easypanel.host ┘      │  1 instância
      │                                                 │
      │                                   ┌─────────────┴──────────────┐
      │                                   │ pool do painel (postgres)   │ até 10 conexões
      │                                   │ pool do portal (app_portal_cliente) │ até 3 conexões
      │                                   └─────────────┬──────────────┘
      │                                   serviço js_bdjs: PostgreSQL 17, banco `js` (~2,5 GB)
      │                                   compartilhado com lab, financeiro, comunidade, oficina, gestor
      └────────────────────────────────────────────────────────────
```

- **Código → produção:** push na `main` do GitHub; o deploy é disparado à mão pelo Jonas no Easypanel
  (botão Implantar). Não há CI.
- **Uma instância só.** Duas coisas dependem disso (ver seção 7): o limite de requisições por IP fica
  em memória e os jobs em segundo plano rodam dentro do processo.

## 2. Domínios e DNS

| Endereço | O que serve | Observação |
|---|---|---|
| `painel.jssistemas.online` | Painel de gestão (login Google), webhooks, rotas internas | Endereço principal |
| `cliente.jssistemas.online` | **Só** `/pagar/*` e `/api/pagar/*`; o resto é 404 | Origem separada do painel (src/proxy.ts) |
| `js-painel.l1fcxz.easypanel.host` | Mesmo serviço (domínio padrão do Easypanel) | Usado em `src/lib/leitura-por-reacao.ts` |

- **DNS:** `jssistemas.online` está no registrador com nameservers `registrar-servers.com` (Namecheap).
  Há um registro **curinga** `*.jssistemas.online → 168.231.98.162`: subdomínio novo já resolve, só falta
  cadastrar no Easypanel (aba Domínios do serviço, porta 80, HTTPS ligado).
- **Endereços fixos no código** (trocar se o domínio mudar):
  - `src/lib/enderecos.ts` — `URL_PAINEL`, `HOST_CLIENTE` (links de pagamento, webhook do Inter, botões do Telegram)
  - `src/app/api/whatsapp/enviar/route.ts` — `baseUrl` do painel
  - `src/lib/leitura-por-reacao.ts` — `PAINEL_URL` (domínio do Easypanel)
  - `src/app/api/whatsapp/webhook/route.ts` — URL do n8n (`js-n8n.l1fcxz.easypanel.host`)
  - `robo-navegador/extensao/config.js` e `manifest.json` — `JS_PAINEL_URL` e permissão de host

## 3. Variáveis de ambiente (Easypanel → serviço painel → Ambiente)

A **fonte** dos valores é a aba Ambiente do Easypanel. O `.env.local` do PC é cópia pra desenvolvimento
(tem CRLF: nunca dar `source`, ver memória `feedback_env_local_crlf`).

| Variável | Para quê | Onde há cópia do valor / como recriar |
|---|---|---|
| `DATABASE_URL` | Banco, usuário `postgres` (painel inteiro) | Easypanel; senha do postgres guardada pelo Jonas |
| `DATABASE_URL_PORTAL` | Banco, usuário `app_portal_cliente` (só páginas do cliente) | Easypanel (e `.env.local`, apontando pro túnel). Perdeu? Gerar senha nova: `ALTER ROLE app_portal_cliente PASSWORD '…'` como postgres e trocar a variável |
| `AUTH_SECRET`, `AUTH_URL` | Login (next-auth) | Easypanel. `AUTH_URL` = endereço do painel |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login Google | Google Cloud (memória `reference_google_cloud_oauth`) |
| `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERT_BASE64`, `INTER_KEY_BASE64`, `INTER_ACCOUNT_NUMBER` | API Pix do Inter (integração "js-painel-pix-link") | Bitwarden (Nota "Inter API — js-painel-pix-link") e `~/.config/js-painel-inter/`. BASE64 = `base64 -w0` do `.crt`/`.key` |
| `INTER_WEBHOOK_TOKEN` | Segredo na URL do webhook do Inter | Easypanel. Trocar = recadastrar o webhook (seção 5) |
| `INTERNAL_API_TOKEN` | Rotas `/api/interno/*` (robô, cron, cadastro do webhook) | Easypanel e `.env.local` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_INTERNAL_KEY` | WhatsApp Cloud API (Meta) + n8n | Easypanel; painel da Meta |
| `EVOLUTION_URL`, `EVOLUTION_KEY`, `EVOLUTION_INSTANCE` | Evolution API | Easypanel |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID_JONAS` | Avisos no Telegram | BotFather |
| `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GIPHY_API_KEY` | IA, transcrição, figurinhas | Painéis dos fornecedores |
| `CAPSOLVER_API_KEY`, `TWOCAPTCHA_API_KEY` | Captcha dos painéis IPTV | Painéis dos fornecedores |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY` | Google Drive | Google Cloud |
| `UNIPLAY_PROXY_URL` | Proxy da Uniplay | Easypanel |
| `PORT` (= 80) | Porta interna do Next | Fixa |
| `DEPLOY_TIMESTAMP`, `GIT_SHA` | Postas pelo Easypanel | Automáticas |

## 4. Banco de dados

- **Servidor:** PostgreSQL 17, serviço `js_bdjs`, banco `js`, ~2,5 GB, compartilhado com os outros apps.
  Porta fechada pra internet; acesso de fora só por túnel SSH (`dbtunnel` → `localhost:5433`).
- **Extensões usadas:** `pgcrypto`, `unaccent`, `pg_trgm` (+ `plpgsql`). O banco novo precisa delas.
- **Fuso:** o pool do painel faz `SET timezone = 'America/Sao_Paulo'` em cada conexão (`src/lib/db.ts`);
  o usuário do portal já tem o fuso configurado no próprio banco.
- **SSL:** vem da URL. Hoje sem SSL (mesma VPS). Banco gerenciado → acrescentar `?sslmode=require`
  (ou o que o provedor pedir) na `DATABASE_URL` e na `DATABASE_URL_PORTAL`. Não precisa mexer no código.
- **Migrações:** arquivos `sql/NNN_*.sql`, aplicados à mão, em ordem (não há ferramenta de migração).
- **Usuários do banco:**

| Usuário | Usado por | Permissões | Como recriar |
|---|---|---|---|
| `postgres` (superusuário) | Painel inteiro (`DATABASE_URL`) | Tudo | — |
| `app_portal_cliente` | Páginas do cliente (`DATABASE_URL_PORTAL`) | Lê só as colunas da página (`pix_links`, `clientes` id/nome, `assinaturas`, `planos`) e cria cobranças (`pix_cobrancas`, `pix_cobranca_itens`); limite de 5 conexões; `statement_timeout` 5 s | `sql/025_role_portal_cliente.sql` + `ALTER ROLE app_portal_cliente PASSWORD '…'` |
| `app_painel` (e `app_lab`, `app_financeiro`…) | **Ninguém ainda** — criados em 14/08/2026 pra trocar o `postgres` de cada app | Por schema | `~/.secrets/roles_postgres_least_privilege_14ago2026.sql` (memória `project_infra_least_privilege_db`) |

- **Conexões abertas pelo painel:** até 10 (pool do painel, padrão do `pg`) + até 3 (portal) por
  instância. Um banco gerenciado pequeno costuma limitar conexões: conferir que cabem todos os apps.

## 5. Quem chama o painel de fora (atualizar se o domínio mudar)

Trocar só de **VPS** mantendo os domínios não exige mexer em nada desta lista: só o DNS muda.

| Quem | Endereço chamado | Onde está cadastrado |
|---|---|---|
| Meta (WhatsApp Cloud API) | `painel…/api/whatsapp/webhook` | Painel de apps da Meta (app jswhats) |
| Inter (Pix recebido) | `painel…/api/inter/webhook/<INTER_WEBHOOK_TOKEN>` | No Inter, pela API: `curl -X PUT -H "x-internal-token: …" https://painel.jssistemas.online/api/interno/pix/webhook` (GET consulta) |
| Google (login) | `painel…/api/auth/callback/google` | Google Cloud → credencial OAuth (URIs de redirecionamento) |
| n8n | `painel…/api/whatsapp/registrar` e outras | Workflows do n8n (memória `reference_n8n_api`) |
| Typebot | `painel…/api/typebot/*` | Typebot |
| Robô de navegador (PC do Jonas) | `painel…/api/interno/robo/*` | `robo-navegador/extensao/config.js` + `manifest.json` |
| Cron local (PC do Jonas) | `painel…/api/interno/central-token` | `crontab` → `src/scripts/central_refresh_token.js` |
| Clientes | `cliente…/pagar/<token>` | Links já enviados. O painel redireciona `/pagar/*` pro endereço do cliente |

## 6. Arquivos persistentes (volumes)

| No container | No servidor | Observação |
|---|---|---|
| `/app/whatsapp-midias` | `/root/whatsapp-midias` (bind) | Mídias do WhatsApp. Criar **pela aba Armazenamento** do Easypanel (mount manual some no próximo deploy — incidente de 28/09/2026) e copiar a pasta na migração |

O resto do estado está no banco.

## 7. Coisas que dependem de "uma instância só"

Se um dia o painel rodar com mais de uma réplica:
- **Limite de requisições por IP** (`src/lib/limite-requisicoes.ts`) está em memória: cada réplica contaria
  sozinha. Levar pra Redis ou pro banco.
- **Jobs em segundo plano** (`src/instrumentation.ts`: sessão do CLUB, saldo dos servidores, saldo de
  captcha, conferência de Pix e renovação automática do Pix pago a cada 5 min) rodariam em todas as réplicas. A renovação automática já tem trava por item no banco (`pix_cobranca_itens.processando_desde`), então não renovaria em dobro; as outras não têm. Precisaria eleger uma só
  (trava no banco, por exemplo `pg_try_advisory_lock`) ou mover pra um serviço de jobs.

## 8. Checklists de migração

### A. Banco separado (Postgres gerenciado)
1. Confirmar no provedor: versão ≥ 17, extensões `pgcrypto`/`unaccent`/`pg_trgm`, limite de conexões
   (somar todos os apps: painel 10 + portal 3 por instância + os outros).
2. `pg_dump` do banco `js` inteiro (todos os schemas são de apps diferentes) → restaurar no novo.
3. Recriar os usuários: `sql/025_role_portal_cliente.sql` + senha; as roles `app_*` do arquivo em `~/.secrets/`.
4. Easypanel: trocar `DATABASE_URL` e `DATABASE_URL_PORTAL` (com `?sslmode=require` se o provedor pedir),
   e as URLs dos outros apps que usam o mesmo banco.
5. Deploy e testes: login, /chat, renovar, `/pagar` no endereço do cliente (se a página mostrar
   "Página indisponível", a `DATABASE_URL_PORTAL` está errada — ela **não** cai pro outro usuário).
6. Mover os backups (hoje: backup da VPS pro Google Drive via rclone — memória `project_vps_saude_backup_limpeza`).
7. Fechar o acesso ao banco antigo e atualizar o túnel `dbtunnel` (ou o acesso do provedor) na memória.

### B. Nova VPS (mesmos domínios)
1. Instalar Easypanel; recriar o serviço do painel (fonte GitHub `js-painel`, branch `main`), as
   variáveis da seção 3, o volume da seção 6 (pela aba Armazenamento) e os domínios da seção 2 (porta 80).
2. Banco: ou vai junto (dump/restore, mesma lista do checklist A), ou já para um gerenciado.
3. Copiar `/root/whatsapp-midias`.
4. DNS: trocar o curinga `*.jssistemas.online` (e os registros de outros apps) pro IP novo.
5. Nada da seção 5 muda (os endereços são os mesmos). O Inter e a Meta não filtram por IP.
6. Firewall: fechar a porta do Postgres pra internet (regra no `DOCKER-USER`), autorizar a chave SSH
   e atualizar os aliases `dbtunnel`/`eptunnel`/`hatunnel` com o IP novo (memória `reference_tuneis_ssh_vps`).

### C. Portal do cliente em serviço separado (quando crescer)
1. Novo serviço no Easypanel com o domínio `cliente.jssistemas.online` e **só** `DATABASE_URL_PORTAL`
   (+ o que o portal precisar). Nenhum segredo do painel.
2. O que o portal hoje faz no lado do painel (confirmar o Pix com o Inter e gravar no histórico, em
   `situacaoCobranca` → `confirmarCobranca`) passa a ser pedido ao painel por uma rota interna, ou o portal
   só lê o status e deixa a confirmação pro webhook + job.
3. Tirar `cliente.jssistemas.online` do serviço do painel.

## 9. Onde ficam os segredos fora do Easypanel

| O quê | Onde |
|---|---|
| Certificado, chave e credenciais da API do Inter | Bitwarden (Nota "Inter API — js-painel-pix-link") e `~/.config/js-painel-inter/js-painel-pix-link_2026-10-18/` |
| Senha do `app_portal_cliente` | Só no Easypanel e no `.env.local` (arquivo em `~/.secrets` apagado em 18/10/2026). Dá pra trocar a qualquer momento com `ALTER ROLE` |
| Senhas das roles `app_*` | `~/.secrets/roles_postgres_least_privilege_14ago2026.sql` |
| Demais credenciais de APIs | Google Drive → "JS Sistemas / Credenciais — APIs e Serviços" |
