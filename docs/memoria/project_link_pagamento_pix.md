---
name: project-link-pagamento-pix
description: "Link de pagamento por Pix com txid (Inter) — fase 1 escrita e testada local em 18/10/2026; tabelas aplicadas no banco; credencial nova do Inter pronta e testada; falta Easypanel, commit, deploy e 1º Pix real"
metadata:
  type: project
---

## O que é

Link fixo por cliente: `https://cliente.jssistemas.online/pagar/<token>` (até 18/10 era no endereço do painel; o painel redireciona os links antigos) (tabela `pix_links`). O cliente escolhe as assinaturas (`ativo`/`pendente`/`atrasado`, plano com valor > 0; pré-marca as que vencem em até 10 dias). Só aí o painel cria uma **cobrança imediata (`cob`) no Inter**, válida por 24 h, com valor fixo, e mostra o QR e o copia-e-cola. O Pix pago é confirmado pelo `txid`, sem depender do nome de quem pagou (que era o problema de [[project_conciliacao_pix_mapeamento]]).

**Por que não `cobv`:** a spec do Bacen exige CPF/CNPJ do devedor na cobrança com vencimento, e não temos o CPF dos clientes.

## Fase 1 (18/10/2026): só cai em /alertas, nada renova sozinho

- **Card "💸 Pix recebido pelo link — renovar"** no topo de /alertas (só aparece se houver item). Um item por assinatura paga. **Some sozinho** quando a assinatura recebe um pagamento registrado depois do Pix (`pagamentos.atualizado_em >= pago_em`, o que o botão Renovar grava). Mostra o último pagamento da assinatura, pra notar quem pagou em dobro (link + comprovante), e tem o botão **Dispensar** (audit_log `pix_link`).
- **Aviso no Telegram** do Jonas a cada Pix confirmado ("Falta renovar").
- **3 caminhos de confirmação**, todos chamando a mesma `confirmarCobranca(txid)` (idempotente: `pago_em IS NULL` na gravação). Nenhum deles confia no aviso: sempre reconsultam `GET /pix/v2/cob/{txid}`.
  1. webhook do Inter: `/api/inter/webhook/<INTER_WEBHOOK_TOKEN>` (e `/pix`, porque não está confirmado se o Inter acrescenta o sufixo);
  2. a tela do cliente pergunta a cada 5 s por até 20 min (no máximo 1 consulta ao Inter a cada 4 s por cobrança);
  3. job a cada 5 min (`iniciarConferenciaPix` no instrumentation), até 10 cobranças por rodada, enquanto não passar 1 h da validade.
- **Botão "💸 Link Pix"** no cabeçalho de /clientes/[id]: copia o link e cria o token na 1ª vez.

## Limites (avisar se mexer)

- `MAX_COBRANCAS_DIA = 20` cobranças novas por cliente em 24 h. Reabrir com a mesma seleção reaproveita a cobrança, que precisa ter ainda ≥ 30 min de validade.
- `MAX_CONFERENCIAS_POR_VEZ = 10` no job: o limite de chamadas da API Pix do Inter não está documentado (o extrato aceita 10/min).

## Código

`src/lib/inter.ts` (OAuth + mTLS via undici; `cob`, webhook) · `src/lib/pix-link.ts` (regra) · `src/lib/pix-webhook.ts` · `src/app/pagar/[token]/` · `src/app/api/pagar/[token]/` · `src/app/api/inter/webhook/[segredo]/` · `src/app/api/interno/pix/webhook` (PUT cadastra a URL no Inter, GET consulta; `x-internal-token`) · `sql/024_pix_cobrancas.sql`. FKs sem CASCADE pra cliente/assinatura (registro de dinheiro); `deleteAssinatura` recusa com mensagem se houver cobrança.

## Testado local (18/10/2026)

Com cliente de teste próprio, criado e apagado no fim: página, link inválido, seleção vazia ou de outro cliente (400), falha do Inter sem certificado (502 com mensagem simples), status pago/aberto, txid com outro token (404), webhook com segredo errado (401) e certo (txid desconhecido e falha do Inter → 200), card aparece e some após o pagamento. Contra o Inter de verdade: ver a seção da credencial abaixo.

## Credencial do Inter (18/10/2026)

O certificado da antiga "js-painel-cobrancas" (23/06) se perdeu, e o Inter só deixa baixar uma vez. Foi criada a integração **"js-painel-pix-link"**, só com estas permissões da API Pix: criar/consultar webhook, consultar Pix recebidos, emitir/consultar cobrança imediata. Nada de pagamento, TED, saldo ou devolução. Certificado válido até **18/10/2027** (renovar antes).
- Arquivos (crt, key, zip original, credenciais.json) em `~/.config/js-painel-inter/js-painel-pix-link_2026-10-18/` (pasta 700, arquivos 600). ✅ Guardado no Bitwarden em 18/10 (Nota Segura "Inter API — js-painel-pix-link", anexos: o .zip com crt+key e o credenciais.json).
- `.env.local` atualizado (backup do anterior apagado em 18/10 a pedido do Jonas). Login OAuth + criação e consulta de `cob` real (R$ 0,01) testados com sucesso pelo `src/lib/inter.ts`.
- A "js-painel-cobrancas" não é usada por nenhum código; pode ser cancelada no Inter. O n8n usa a js-teste-base, que não foi mexida.
- A integração nova aparece como "Novo" na lista e a mensagem fala em análise de até 30 dias úteis, mas a API já respondeu normalmente.

## Para ligar em produção

1. ✅ Easypanel → js_painel → Ambiente (feito 18/10; o arquivo com o bloco foi apagado — recriar com `base64 -w0` do .crt/.key se preciso): troca `INTER_CLIENT_ID`/`SECRET`, acrescenta `INTER_CERT_BASE64`, `INTER_KEY_BASE64` e `INTER_WEBHOOK_TOKEN`).
2. Commit + deploy, depois `curl -X PUT -H "x-internal-token: …" https://painel.jssistemas.online/api/interno/pix/webhook`.
3. Teste real: Jonas paga o link de um cliente de teste e confere o card e o Telegram.
4. Conferir a tarifa de QR dinâmico do Inter Empresas.

## Produção (18/10/2026)

- Deploy de `ac79f2e` feito pelo Jonas. `curl` sem sessão ok: /pagar inválido, webhook com segredo errado (401), rotas logadas → login.
- **Webhook cadastrado no Inter** às 16:37 (`PUT /api/interno/pix/webhook`); a consulta devolve a URL com o segredo na chave CNPJ.
- Pegadinha: rota que responde **502/503** vira a página "Service is not reachable" do Easypanel, sem log. As rotas do link Pix passaram a usar 500 (commit seguinte ao `ac79f2e`).
- ✅ **1º Pix real 18/10 16:45** (JS Contas, R$ 20, assinatura 2999): cobrança criada 16:45:22, paga e confirmada **pelo webhook do Inter** às 16:45:50 (`[pix-webhook] …: paga`), audit_log gravado. Sufixo da URL usado pelo Inter não identificado (as duas rotas respondem). 📋 Jonas conferir tela/Telegram/card e renovar pra ver o item sumir.

## Endereço separado do cliente (18/10/2026)

Pedido do Jonas, preocupado com o painel, antes de ampliar a página do cliente (dados da conta, pedidos de conteúdo, FAQ, indicações).
- `cliente.jssistemas.online` = só `/pagar/*` e `/api/pagar/*`. Todo o resto dá 404 em texto puro (login, `/api/auth`, manifesto, ícones, webhooks, `/api/interno`), sem passar pelo next-auth e sem gravar cookie. Cabeçalhos: X-Frame-Options DENY, nosniff, Referrer-Policy no-referrer, X-Robots-Tag noindex.
- Por quê: origem separada. Os cookies de login do painel (`__Host-`/`__Secure-`) são presos ao endereço exato, então um script numa página pública não age com a sessão do Jonas; e o cliente não vê o endereço do painel.
- O painel redireciona `/pagar/*` (308) pro endereço novo; `/api/pagar` no painel agora pede login. O webhook do Inter continua no endereço do painel (servidor→servidor), sem recadastrar.
- A página `/pagar` sobrescreve os metadados do layout raiz (sem manifesto, título de app nem descrição do "JS Painel").
- Host lido do cabeçalho `Host`, não de `req.nextUrl` (com AUTH_URL, o next-auth pode reescrever a origem). Constantes em `src/lib/enderecos.ts`.
- DNS: `*.jssistemas.online` é wildcard pra VPS; falta só o domínio no Easypanel (serviço painel).
- 📋 Próximos passos da base (conversa de 18/10): usuário de banco próprio e fila de conexões pequena pras rotas públicas (o app usa `postgres` superusuário, pool padrão de 10); limite de requisições por IP; código de confirmação pelo WhatsApp antes de mostrar dado sensível (senha da conta). Ordem sugerida dos recursos: FAQ → dados da conta → indicações → pedidos de conteúdo (texto do cliente exibido no painel = maior risco de script injetado).

## Próximas fases (decididas em 18/10)

- **Fase 2:** Pix confirmado e assinatura **atrasada ou vencendo hoje** → renova sozinha, igual ao botão Renovar (banco + pagamento INTER + contas vencidas no painel + WhatsApp). Senão, continua indo pro card. Exige levar pro servidor a lógica que hoje está no navegador (`RenovarAssinatura.tsx` → `renovarContasViaAPI`) e não renovar se já houver pagamento recente da assinatura.
- **Fase 3:** link na resposta "Chave PIX", atalho no /chat e botão de URL no template de vencimento (precisa de aprovação da Meta).
