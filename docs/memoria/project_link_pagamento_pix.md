---
name: project-link-pagamento-pix
description: "Link de pagamento por Pix com txid (Inter) — fase 1 escrita e testada local em 18/10/2026; tabelas aplicadas no banco; credencial nova do Inter pronta e testada; falta Easypanel, commit, deploy e 1º Pix real"
metadata:
  type: project
---

## O que é

Link fixo por cliente: `https://painel.jssistemas.online/pagar/<token>` (tabela `pix_links`). O cliente escolhe as assinaturas (`ativo`/`pendente`/`atrasado`, plano com valor > 0; pré-marca as que vencem em até 10 dias). Só aí o painel cria uma **cobrança imediata (`cob`) no Inter**, válida por 24 h, com valor fixo, e mostra o QR e o copia-e-cola. O Pix pago é confirmado pelo `txid`, sem depender do nome de quem pagou (que era o problema de [[project_conciliacao_pix_mapeamento]]).

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
- Arquivos (crt, key, clientId/secret, bloco pro Easypanel) em `~/.config/js-painel-inter/js-painel-pix-link_2026-10-18/` (pasta 700, arquivos 600). 📋 Copiar pro Bitwarden: é a única cópia.
- `.env.local` atualizado (backup do anterior na mesma pasta). Login OAuth + criação e consulta de `cob` real (R$ 0,01) testados com sucesso pelo `src/lib/inter.ts`.
- A "js-painel-cobrancas" não é usada por nenhum código; pode ser cancelada no Inter. O n8n usa a js-teste-base, que não foi mexida.
- A integração nova aparece como "Novo" na lista e a mensagem fala em análise de até 30 dias úteis, mas a API já respondeu normalmente.

## Para ligar em produção

1. Easypanel → js_painel → Ambiente: colar o bloco de `easypanel_ambiente.txt` (troca `INTER_CLIENT_ID`/`SECRET`, acrescenta `INTER_CERT_BASE64`, `INTER_KEY_BASE64` e `INTER_WEBHOOK_TOKEN`).
2. Commit + deploy, depois `curl -X PUT -H "x-internal-token: …" https://painel.jssistemas.online/api/interno/pix/webhook`.
3. Teste real: Jonas paga o link de um cliente de teste e confere o card e o Telegram.
4. Conferir a tarifa de QR dinâmico do Inter Empresas.

## Próximas fases (decididas em 18/10)

- **Fase 2:** Pix confirmado e assinatura **atrasada ou vencendo hoje** → renova sozinha, igual ao botão Renovar (banco + pagamento INTER + contas vencidas no painel + WhatsApp). Senão, continua indo pro card. Exige levar pro servidor a lógica que hoje está no navegador (`RenovarAssinatura.tsx` → `renovarContasViaAPI`) e não renovar se já houver pagamento recente da assinatura.
- **Fase 3:** link na resposta "Chave PIX", atalho no /chat e botão de URL no template de vencimento (precisa de aprovação da Meta).
