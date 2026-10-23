---
name: project-link-pagamento-pix
description: "Link de pagamento por Pix com txid (Inter) — em produção desde 18/10/2026 (renova sozinho); 19/10: planos estendidos na página, botões Ative na hora/Chave PIX no /chat e no template de vencimento, funil de aceitação em /alertas, confirmação 'Renovado na hora'"
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
4. Conferir a tarifa de QR dinâmico do Inter Empresas. — 20/10: extratos de 18–20/10 (via execuções do n8n "Inter - extrato") **sem nenhum débito de tarifa** pelas 3 `cob` pagas (R$85) e o Pix entra integral. Fontes públicas falam em 0,9% (mín. R$0,10, máx. R$1,50) acima de cota grátis do plano — 📋 olhar o extrato no início de novembro pra ver se vem tarifa agregada no mês.

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
- ✅ Em produção 18/10 (`ab3f32f`): domínio cadastrado no Easypanel (serviço painel, porta 80 interna como o painel; HTTPS Let's Encrypt). Conferido por `curl`: no cliente só /pagar responde e todo o resto dá 404 sem cookie; o painel ficou igual e redireciona /pagar.
- **Base do portal (18/10, depois do endereço separado):** usuário de banco `app_portal_cliente` (sql/025; lê só as colunas da página e cria cobranças; 18/18 testes de permissão), fila própria de 3 conexões (`src/lib/db-portal.ts`, sem `DATABASE_URL_PORTAL` a página mostra "indisponível" e nunca cai pro superusuário), limite por IP no proxy (página 30/min, gerar Pix 10 em 10 min, "já pagou?" 40/min; `src/lib/limite-requisicoes.ts`, em memória). A confirmação do Pix (`confirmarCobranca`) continua no pool do painel. `ssl: false` saiu do código: SSL agora vem da URL. Infra documentada em `docs/INFRA.md`. ✅ Em produção 18/10 (`6488e34`): página abre pelo usuário do portal (conexões `app_portal_cliente` vistas no banco), limite da página bloqueou no 30º acesso do mesmo IP, painel e webhook do Inter normais.
- (histórico) Próximos passos da base (conversa de 18/10): usuário de banco próprio e fila de conexões pequena pras rotas públicas (o app usa `postgres` superusuário, pool padrão de 10); limite de requisições por IP; código de confirmação pelo WhatsApp antes de mostrar dado sensível (senha da conta). Ordem sugerida dos recursos: FAQ → dados da conta → indicações → pedidos de conteúdo (texto do cliente exibido no painel = maior risco de script injetado).

## Fase 2 (18/10/2026): renovação automática

Regra do Jonas (corrigida no mesmo dia, 18/10): **igual ao clique manual do botão Renovar**. O **contrato renova sempre**, em qualquer data (adiantado também); pendente vira ativa. A **conta no painel** só renova se estiver vencida ou vencendo hoje (o botão faz o mesmo depois de salvar). **Sem conta vinculada ou qualquer empecilho → ⚠️ no Telegram.** Só NÃO renova (vai pra /alertas com motivo) quando há sinal de erro no pagamento: valor pago diferente, pagamento da assinatura registrado depois de gerar o Pix (pagou em dobro?), assinatura inativa/cancelada, período desconhecido, falha ao renovar. (A 1ª versão só renovava atrasada/vencendo hoje — trocada a pedido.) Código em `src/lib/pix-renovacao.ts`.
- **Mesmas funções do botão** (refator sem mudar comportamento, conferido por diff): `src/lib/renovar-assinatura.ts` (era o corpo da rota PUT /api/assinaturas/[id]/renovar), `src/lib/renovar-conta-painel.ts` (era o corpo da rota POST /api/paineis/servidores/[id]/renovar, com as travas dos adapters e a migração de painel), `src/lib/datas-renovacao.ts` (regras de data que estavam só no navegador; o botão passou a importar daqui). As rotas viraram cascas finas.
- **Vai pra /alertas com motivo:** valor pago diferente do cobrado; já havia pagamento da assinatura registrado depois de gerar o Pix (comprovante + link = pagou em dobro?); status inativo/cancelado/vencido; sem vencimento; período desconhecido; falha ao renovar.
- **Quando roda:** logo após a confirmação do Pix (sem esperar, o aviso do Inter não fica preso) e no job de 5 min (retenta). Trava por item no banco (`processando_desde`, 15 min) — dois processos nunca pegam o mesmo item. Só Pix pago nos últimos 3 dias. Colunas em `sql/026` (aplicada): processado_em, acao (renovado/alertas), motivo, resultado (jsonb).
- **Histórico:** autor `pix-automatico` no audit_log (renovação e contas no painel). `registrarAudit` ganhou o parâmetro opcional `usuario`.
- **Telegram:** um aviso por Pix (`textoDoAviso`, testável sem enviar): contrato renovado até quando; cada conta (✅ renovada, válida até, ⚠️ erro / painel não integrado / vencimento desconhecido); ⚠️ sem conta vinculada; ⏳ NÃO renovado + motivo. Qualquer empecilho põe ⚠️ na 1ª linha. Substituiu o aviso "falta renovar" da fase 1.
- **Card em /alertas:** mostra o motivo, ou "⏳ renovando sozinho…" enquanto processa; itens renovados somem (o pagamento registrado esconde).
- **Testado 18/10 (local, contra o banco, cliente de teste apagado):** regra 11/11, datas 5/5 (inclui 31/01 + 1 mês igual ao botão), ponta a ponta com 5 cenários e dois processamentos em paralelo (cada item uma vez só), rotas do botão (normal, pendente, 404, erros da rota do painel) com sessão local. **Não testado:** renovação de conta real no painel do fornecedor (gastaria crédito) — a função é a mesma do botão.
- ✅ Em produção 18/10 (`cacba7c`; regra corrigida "igual ao botão" `f1456f9`, deploy 18/10): container novo subiu limpo, painel/cliente/webhook conferidos por `curl`. 📋 Falta o 1º Pix real renovando sozinho (de preferência com conta vencida, pra exercitar o painel do fornecedor).
- ✅ Risco de renovar 2x resolvido 19/10 (`e22758a`): o modal Renovar avisa em vermelho quando a assinatura já tem pagamento nos últimos 3 dias (o do link nasce com conferência ⚡ Automático). Ver `project_renovacao_conclusiva_extrato.md`.

## Próximas fases (decididas em 18/10)

- ~~**Fase 2**~~ ✅ feita 18/10 (seção acima). Texto original: Pix confirmado e assinatura **atrasada ou vencendo hoje** → renova sozinha, igual ao botão Renovar (banco + pagamento INTER + contas vencidas no painel + WhatsApp). Senão, continua indo pro card. Exige levar pro servidor a lógica que hoje está no navegador (`RenovarAssinatura.tsx` → `renovarContasViaAPI`) e não renovar se já houver pagamento recente da assinatura.
- ~~**Fase 3**~~ ✅ 19/10 por outro caminho (seção abaixo): sem template novo — os botões do template de vencimento e o atalho Planos do /chat levam ao "⚡ Ative na hora", que manda o link.

## 19/10/2026 — aceitação do link (tudo ✅ em produção, deploy confirmado pelo Jonas)

Commits: `d23f09d`, `1a95e70`, `a59b1e2`, `41aebf8`, `d0d7eb9`.

- **Página /pagar, planos estendidos** (`1a95e70`): cada assinatura marcada tem o link "Planos estendidos ▾", recolhido. Ao abrir, mostra os períodos do mesmo plano (tipo + telas, meses 1/3/6/12) com o valor por mês. O padrão é o período do plano atual. O valor vem sempre da tabela de planos, no servidor (`gerarCobranca(token, {id, meses}[])`; o formato antigo `string[]` continua aceito). Só reaproveita uma cobrança aberta com os mesmos períodos (`itens` = "id:meses"). A renovação já usava `pix_cobranca_itens.meses`.
- **Mensagem de planos com 2 botões** (`d23f09d`, `a59b1e2`, `41aebf8`):
  - Os botões são "⚡ Ative na hora" (manda uma mensagem cta_url "Pagar agora" com o link do cliente) e "⏳ Chave PIX" (chave + pedido de comprovante).
  - O texto apresenta o link como "✨ *Novidade:* agora a renovação é na hora!".
  - Texto e botões ficam num lugar só, `src/lib/mensagem-planos.ts` (`textoPlanos`, `BOTOES_PLANOS`). Usam esse módulo o atalho Planos do /chat e a resposta aos botões **"Pagamento mensal" / "Planos estendidos" dos templates de vencimento** (`vencido_plano_v2`/`lembrete_vencimento_v2`, que continuam iguais e UTILITY).
  - Em "Planos estendidos" entra uma linha apontando para o link na página.
  - A resposta é gravada como `source='chat-planos'` com o `id_assinatura`, para o clique seguinte ser reconhecido por `buscarOrigemTemplate`.
  - O webhook tira o emoji do título do botão antes de comparar.
- **Funil em /alertas** (`d0d7eb9`):
  - Quadro "⚡ Link de pagamento — aceitação (7 dias)", recolhido (`src/lib/pix-funil.ts`, cache de 60 s porque /alertas recarrega a cada 5 s).
  - Etapas: tocou Ative na hora (× Chave PIX) → recebeu o link → abriu a página (× planos estendidos) → gerou o Pix → pagou (× mais de 1 mês) → renovou sozinho (× foi para /alertas).
  - Abaixo, a lista de quem gerou o Pix e não pagou. O cliente de teste **JS Contas (2573)** fica de fora.
  - As aberturas vêm da tabela nova `pix_link_eventos` (sql/031, aplicada; `abriu`/`estendidos` + `celular`; o portal só tem INSERT). As prévias de link (WhatsApp, Telegram, bots) não contam. Contam só a partir do deploy de 19/10.
  - 1º caso real: Tinho da Silva (1392) gerou R$ 30 às 12:01 de 19/10 e não tinha pago até o deploy.
- **Confirmação própria quando renova pelo link** (`d0d7eb9`):
  - `notificarRenovacao(..., viaLink)`, ligado por `origem.tela === 'pix-link-automatico'`, manda "⚡ *Renovado na hora, Nome!* 🎉 … Da próxima vez é só usar o mesmo link".
  - Não manda a saudação "Recebi seu comprovante". Fonte: `notificacao-renovacao-link`.
  - Sem janela de 24 h aberta, vai para o Telegram do Jonas, como antes.
- 📋 Testes pela tela, não feitos ainda: tocar em "Pagamento mensal" no template mandado ao JS Contas; o quadro do funil em /alertas; o 1º "Renovado na hora" real.

## Meta / WhatsApp (consultado pela API em 19/10/2026)

- **Templates:**
  - A Meta **não aceita emoji em botão de template** (erro 2388060). Nas mensagens interativas comuns (janela de 24 h) pode.
  - Texto com "✨ Novidade" fez a Meta reclassificar o template como **MARKETING** (`planos_renovacao`, criado e abandonado; o `identificacao` também foi reclassificado no passado).
  - O token do painel (system user, `whatsapp_business_management`) **cria mas não apaga** templates ("Need permission on WABA"). 📋 Jonas apagar o `planos_renovacao` à mão: WhatsApp Manager → Gerenciar modelos.
- **Número +55 51 8468-3468:**
  - qualidade GREEN, conta e empresa verificadas;
  - limite **TIER_250** (250 conversas iniciadas por dia);
  - **nome de exibição nunca enviado para aprovação** (`name_status: NON_EXISTS`). A Meta diz que o limite só sobe depois disso. 📋 Jonas pedir no WhatsApp Manager → Números → Nome de exibição.

## Limitação conhecida — trocar depois de gerar o Pix (19/10/2026, Jonas: "deixe assim por enquanto")
- **Quem tem 1 assinatura não consegue voltar:** a tela do Pix só tem "Escolher outras assinaturas" com mais de uma assinatura. Quem tem uma só não troca o período depois de gerar.
- **Gerar outro não cancela o anterior:** o Pix antigo segue válido 24 h no Inter. Se o cliente pagar o antigo, renova o que estava nele; se pagar os dois, o 2º cai em /alertas como "pagou em dobro?".
- **Proposta, se voltar ao assunto:**
  - botão "Trocar plano ou assinaturas" sempre visível;
  - ao gerar o novo Pix, cancelar o anterior no Inter (PATCH cob → `REMOVIDA_PELO_USUARIO_RECEBEDOR`, pelo pool do painel, sem ampliar o `app_portal_cliente`);
  - se o anterior já estiver pago, mostrar "pagamento anterior já recebido" em vez de gerar outro.
  - Antes, testar com R$ 0,01 se a permissão "emitir cobrança" do Inter deixa cancelar.

- 📋 20/10: Jonas colou uma chave temporária da API do n8n no chat (leitura das execuções do extrato); apagada do scratchpad, expira ~26/10 — revogar antes se possível.

## 23/10/2026 — página gera o Pix sozinha (funil mostrou desistência antes de gerar)
- **Funil 19–23/10:** Ative na hora 24 → link 24 → abriu 19 → gerou 13 → pagou 13 → renovou sozinho 13 (0 em /alertas;
  mediana 42 s do Pix gerado ao pago). Chave PIX ganha de 2×1 nos botões (51 × 24). 6 abriram e não geraram: 5 abriram,
  voltaram em 10–60 s e tocaram "⏳ Chave PIX" na mensagem anterior (quase todos com 1 assinatura) — a tela "Confira sua
  assinatura" era um passo a mais. Aldenes e Junior queriam trimestral (estendidos escondidos).
- **Mudanças (`PagarCliente.tsx`):**
  - 1 assinatura e nenhum Pix aberto → gera o Pix **sozinho ao abrir**, no período atual (sempre mensal: todo plano
    nasce mensal e período maior é escolha do cliente). Só no navegador (`useEffect`, uma vez por abertura): prévias de
    link não rodam JS e não geram cobrança. Tela "Gerando seu Pix…" enquanto isso; se falhar, cai na tela de escolha com o erro.
  - Tela do Pix: valor + "assinatura · período" + **"Pagar por mais tempo (trimestral, semestral…)"** logo abaixo do
    valor → volta para a escolha com os estendidos abertos (conta no funil como `estendidos`); depois disso não gera sozinho.
  - **"Copiar código Pix" acima do QR** (o QR passou para "Pagando por outro aparelho?").
- Mensagem do link (`auto-resposta-suporte.ts`): "⚡ Toque em *Pagar agora* e copie o código Pix." (sem "confira o plano").
- Continua: trocar o período depois de gerar deixa o Pix anterior válido por 24 h (pagar os dois → /alertas "pagou em
  dobro?"). Cancelar o anterior no Inter segue como proposta (ver "Limitação conhecida" acima).
- Testado com build de produção local + navegador em tamanho de celular, geração interceptada (nenhuma cobrança no Inter):
  1 assinatura gera 1 Pix mensal ao abrir; "Pagar por mais tempo" → Trimestral gera o de 3 meses sem gerar outro sozinho;
  JS Contas (6 assinaturas) abre a escolha sem gerar nada.
- 📋 Olhar o funil de novo em ~1 semana: abriu → gerou deve subir.
