---
name: project-template-lembrete-vencimento
description: "Template Meta \"lembrete_vencimento\" para avisar clientes que vencem amanhã — parâmetros e status de implementação"
metadata: 
  node_type: memory
  type: project
  originSessionId: 695099b2-9582-467f-b5ec-91655c5409ed
  modified: 2026-08-01T16:00:35.199Z
---

Template WhatsApp aprovado na Meta (WABA `265749013278174`) chamado `lembrete_vencimento` (UTILITY, pt_BR), corpo: "Olá, {{1}}! Seu plano *{{2}}* vence amanhã, dia {{3}}...". Outros templates aprovados na mesma WABA: `pix_cnpj`, `identificacao`, `validade_plano`, `vencido_plano`.

**Regra de montagem dos parâmetros** (decidida em 07/07/2026):
- `{{1}}` = primeiro nome do cliente (ex: "Adriana", não o nome completo)
- `{{2}}` = **quantidade de telas** da assinatura (ex: "1 tela", "2 telas") — **não** o tipo de plano (`planos.tipo`, ex: "Padrão"/"Promo"/"Especial"). Primeira tentativa usou `tipo` e foi corrigida pelo Jonas.
- `{{3}}` = data de vencimento formatada `DD/MM/AAAA`

**Status de implementação:**
- `/home/jonas/js-painel/src/app/api/whatsapp/enviar-template/route.ts` foi corrigido em 07/07/2026 para aceitar `parametros: string[]` no body e montar o `components` do payload da Cloud API (antes só suportava templates sem variáveis).
- **✅ Disparo em massa feito em 07/07/2026**: 47/47 clientes com `venc_contrato` = 08/07/2026 receberam o template com sucesso (zero falhas), via script Node avulso (chamando a Graph API direto, não pelo endpoint da aplicação que exige sessão next-auth). Não ficou nenhuma rota/script permanente no repo — foi um script de uso único, copiado pra dentro de `js-painel/` pra resolver `node_modules` (ver [[feedback_acesso_banco]]) e apagado depois. Se for repetir esse disparo periodicamente, vale criar uma rota/cron de verdade.

**⚠️ Critério de data — SEMPRE `venc_contrato`, nunca `venc_contas`** (correção de 07/07/2026): a primeira versão da query usou `venc_contas` (data sincronizada do painel/servidor, ver [[reference_venc_contas_trigger]]) e isso causou envio de mensagem errada pra Adriana Hort Cardoso — ela recebeu "vence amanhã, dia 08/07/2026" mas seu `venc_contrato` real é 06/09/2026. Em 07/07/2026 havia **58 assinaturas** com `venc_contas` e `venc_contrato` divergentes. `venc_contrato` é a data contratual acordada com o cliente e é o único campo correto para qualquer comunicação/cobrança direcionada ao cliente. Query correta para achar quem vence exatamente amanhã: `assinaturas a JOIN clientes c JOIN planos p LEFT JOIN LATERAL (contatos mais antigo) WHERE a.venc_contrato::date = CURRENT_DATE + INTERVAL '1 day' AND a.status NOT IN ('inativo')`.

**Como aplicar:** ao construir o script/rota de disparo em massa, montar `{{2}}` a partir de `planos.telas` (não `planos.tipo`), filtrar por `venc_contrato` (não `venc_contas`), e reusar o endpoint `enviar-template` já corrigido.

## Auto-resposta ao botão "Falar com suporte" (implementado em 07/07/2026)

Os templates `lembrete_vencimento` e `vencido_plano` têm um botão quick-reply "Falar com suporte". Ao clicar, o cliente agora recebe resposta automática — implementado em `src/lib/auto-resposta-suporte.ts`, chamado fire-and-forget de dentro do bloco `interactive` do webhook (`src/app/api/whatsapp/webhook/route.ts`).

**Fluxo:**
1. "Falar com suporte" (só dispara se a mensagem respondida for `tipo='template'` com nome `lembrete_vencimento`/`vencido_plano`) → busca cliente por telefone→contatos→clientes→assinatura ativa (mais recente por `venc_contrato`)→plano, calcula valor mensal (`valor/meses`, não o valor bruto do período contratado), envia mensagem com nome+valor e 2 botões: "Chave PIX" e "Automático mensal".
2. "Chave PIX" → mensagem única, só `40827286000106` (sem pontuação, sem mais nada — pra funcionar o "selecionar tudo e copiar" em qualquer aparelho). Mesmo texto é reusado no fluxo abaixo.
3. "Automático mensal" → 2 mensagens: (a) aviso (com quebras de linha) que o interesse foi anotado, que a funcionalidade ainda não existe, e que por enquanto a renovação deve ser feita enviando o comprovante do PIX pela chave abaixo; (b) a mesma chave PIX de novo. **Não existe tabela de rastreio de interesse** — o clique já fica registrado em `whatsapp_mensagens` (`tipo='interactive_reply'`, `conteudo='Automático mensal'`) e isso é a fonte da verdade pra quando a feature Pix Automático estiver pronta.

**Idempotência:** antes de responder, checa `SELECT 1 FROM whatsapp_mensagens WHERE reply_to_wa_msg_id = <msgId do clique> AND source='auto-resposta-suporte'` — evita duplicar resposta em reentrega de webhook da Meta. Testado e confirmado funcionando.

**Pix Automático do Inter (botão "Automático mensal") — não é só um link**: API do Inter (`developers.inter.co/references/pix-automatico`) exige criar uma "solicitação de recorrência" via `POST /pix/v2/solicrec` com a chave PIX/CPF do pagador; o banco do próprio cliente manda push pra ele aprovar. Não existe integração com API do Inter em nenhum projeto (`js-painel`/`js-financeiro`) ainda — seria projeto novo com mTLS. Ver credenciais em [[reference_inter_api]].

**Teste ponta a ponta feito em 07/07/2026**: rodando `npm run dev` local e simulando payloads de webhook da Meta (assinados com HMAC via `WHATSAPP_APP_SECRET`) contra `localhost:3000/api/whatsapp/webhook` — assim valida a lógica nova sem precisar dar deploy (lembrar [[feedback_deploy_manual]]). Cliente de teste usado: "JS Contas" (id_cliente 2573, conta interna só com planos Cortesia/R$0,00) — o telefone 555194515880 foi associado a ela a pedido do Jonas (esse número já tinha histórico de chat pessoal anterior).

**✅ Commitado e enviado em 07/07/2026** — commit `1963242` na branch `main` do js-painel ("feat: auto-resposta ao clique em 'Falar com suporte' nos lembretes de vencimento"). Deploy no Easypanel é manual, feito pelo Jonas (nunca acionar/verificar — ver [[feedback_deploy_manual]]).

**🐛 BUG real encontrado e corrigido em 07/07/2026 — botão de template chega como `msg.type='button'`, não `'interactive'`:** depois do primeiro disparo em massa (47 clientes), o cliente Eduardo de Souza Lemes Junior (553196100490) clicou em "Falar com suporte" e a auto-resposta **não disparou**. Causa: botões quick-reply anexados a um **template aprovado** (ex: `lembrete_vencimento`) chegam no webhook com `msg.type === 'button'` e payload `{payload, text}` — um formato **diferente** do `msg.type === 'interactive'`/`button_reply` usado pelas mensagens interativas que a própria aplicação envia (as respostas "Chave PIX"/"Automático mensal"). O código só tratava o segundo formato. Corrigido em `webhook/route.ts` normalizando `msg.type === 'button'` também para `tipo = 'interactive_reply'` (commit `378e9f8`).

**⚠️ Lição para testes futuros:** meus testes locais desta sessão (payloads HMAC simulados) usaram o formato `interactive`/`button_reply` pros 3 cliques, incluindo "Falar com suporte" — isso não reflete a realidade (esse clique específico vem como `type='button'`), por isso o teste "passou" mas o bug só apareceu em produção com um cliente real. Ao simular payload de webhook da Meta pra clique em botão, checar se o botão é de um **template** (`type='button'`) ou de uma **mensagem interativa própria** (`type='interactive'`) antes de montar o payload de teste. Ver [[feedback_simular_payload_webhook_real]].

**✅ Corrigido, deployado e confirmado funcionando em 07/07/2026** — Jonas testou de novo em produção (telefone 555193162326, clique real em "Falar com suporte" após o deploy) e a auto-resposta dispara corretamente agora. Fluxo completo (auto-resposta + PIX + Automático mensal) está em produção e validado ponta a ponta com clique real.

## 🔄 Redesign em andamento (31/07/2026) — novo template `lembrete_vencimento_v2` enviado à Meta

Jonas pediu remodelagem do template `lembrete_vencimento` (vence amanhã): saudação mais amigável, campo de identificação da assinatura (`assinaturas.identificacao`, varchar — preenchido quando o cliente tem mais de 1 assinatura no nome) e botões melhores que "Falar com suporte".

**Decisão de estratégia:** criar template **novo** em vez de editar o existente — `lembrete_vencimento` atual continua em produção intocado até o novo ser aprovado e o código ser trocado manualmente (zero risco, rollback trivial). Escopo desta rodada: só o `lembrete_vencimento` (vence amanhã); o `vencido_plano` fica para uma conversa futura, ainda sem texto desenhado.

**Testado antes de submeter:** mensagem de texto livre (dentro da janela de 24h) enviada pro telefone de QA 555193162326, depois reenviada como `interactive`/`button` (mesmo formato usado em `enviarBotoes` de `auto-resposta-suporte.ts`) pra visualizar os botões. Formato aprovado pelo Jonas antes do envio à Meta.

**Template submetido em 31/07/2026 — `lembrete_vencimento_v2`, id `2299901307212184`, status `PENDING`, categoria UTILITY:**
```
Oi *{{1}}*, tudo bem? 😊
Viemos lembrar sobre sua assinatura:

📺 Plano: *{{2}}*
🏷️ Identificação: *{{3}}*
📅 Vencimento: *{{4}}*

Qualquer dúvida, estamos por aqui! 📲
```
Botões (quick reply): **"Pagamento mensal"** e **"Planos estendidos"** — substituem o antigo "Falar com suporte".

**⚠️ Regra da Meta descoberta nesta sessão:** o corpo do template não pode começar nem terminar exatamente numa variável (`error_subcode 2388299`, "As variáveis não podem estar no início nem no final do modelo"). Primeira tentativa terminava em `*{{4}}*` sem texto depois e foi rejeitada; corrigido acrescentando a linha de fechamento "Qualquer dúvida, estamos por aqui! 📲" após a última variável.

**`{{3}}` (identificação) — fallback quando vazio:** decidido usar o texto **"Principal"** (sugestão aceita implicitamente, sem contestação) no lugar de deixar em branco, já que o campo só é preenchido quando há mais de uma assinatura — chamar de "Principal" a única assinatura do cliente é literalmente verdade.

**Pricing pros novos botões (levantado nesta sessão, ainda não implementado):** `public.planos` já tem todas as combinações tipo×telas×meses com valor manual (não é multiplicador calculado — cada duração tem desconto próprio definido à mão). Coluna `descricao` já vem com rótulo pronto ("Mensal"/"Trimestral"/"Semestral"/"Anual"). **Nem toda combinação tem as 4 durações** — ex: Padrão 5 e 6 telas só têm Mensal cadastrado. Tipo "Cortesia" tem valor 0,00 em tudo e deve ser excluído do fluxo desses botões.

**Pendente (não implementado ainda):**
1. Aguardar aprovação da Meta pro `lembrete_vencimento_v2`
2. Trocar a rota/script de disparo diário pra usar o novo template, montando `{{3}}` com fallback "Principal"
3. Implementar em `auto-resposta-suporte.ts` as respostas dos 2 botões novos: "Pagamento mensal" → valor da linha `meses=1` do plano atual + chave PIX; "Planos estendidos" → listar as durações disponíveis (via `planos WHERE tipo=X AND telas=Y ORDER BY meses`) + chave PIX
4. Decidir se e quando editar o antigo `lembrete_vencimento` (apagar/deprecar) depois que o v2 estiver em produção
5. Desenhar e submeter o redesign equivalente do `vencido_plano` (escopo não coberto nesta sessão)

**How to apply:** ao voltar a este tópico, checar status do template com `GET /{waba_id}/message_templates?fields=name,status` antes de qualquer coisa — se `PENDING`, só aguardar; se `REJECTED`, ver `error_user_msg` no `GET` do template pra causa.

## ✅ Botões "Pagamento mensal"/"Planos estendidos" implementados em 31/07/2026 (código pronto, não deployado)

**🐛 Bug real encontrado e corrigido antes mesmo de ir pra produção:** Jonas perguntou se cliente com 2+ assinaturas (planos/pacotes diferentes) correria risco de receber dados da assinatura errada ao clicar num botão. Confirmado com exemplo real no banco — cliente "Guilherme de Souza Seidler" (id_cliente 508) tem 3 assinaturas ativas no mesmo telefone (TV sogro/Padrão vence 01/08, Projetor/Especial vence 06/08, Quarto/Especial vence 08/08). A busca original (`ORDER BY a.venc_contrato DESC LIMIT 1` por telefone) pegaria a assinatura de vencimento **mais distante** — o oposto do que faz sentido, e sem nenhuma relação com qual assinatura motivou o lembrete que o cliente está respondendo. Esse bug já existia no fluxo antigo "Falar com suporte" (herdado, não introduzido nesta sessão).

**Causa raiz:** `notificacoes-vencimento/route.ts` sabe exatamente qual `id_assinatura` está avisando ao disparar o template, mas não salvava isso em `whatsapp_mensagens.conteudo` — só `{name, parametros, copyCode}`. Sem esse vínculo, o clique do botão não tinha como saber qual assinatura originou o lembrete.

**Correção aplicada:**
1. `notificacoes-vencimento/route.ts` agora grava `id_assinatura` dentro do JSON de `conteudo` ao registrar o envio do template.
2. `auto-resposta-suporte.ts`: `buscarOrigemTemplate` extrai esse `id_assinatura` da mensagem original (via `reply_to_wa_msg_id`). `buscarAssinaturaCliente(telefone, idAssinatura)` busca direto por `id_assinatura` quando disponível (preciso); só cai no fallback por telefone quando não disponível (mensagens antigas, ou template enviado manualmente pelo chat via `enviar-template/route.ts`, que não tem esse vínculo).
3. **Decisão do Jonas sobre o fallback ambíguo:** quando não há `id_assinatura` conhecido E o cliente tem mais de uma assinatura paga ativa (exclui Cortesia), **não** chutar a mais recente — em vez de silêncio, enviar mensagem tranquilizadora: "Oi, {nome}! 👋 Notei que você tem mais de uma assinatura com a gente — vou identificar qual delas antes de te passar os detalhes certinhos. Já te retorno por aqui! 🙏" (função `textoAmbiguo`). Aplica aos 3 fluxos (Falar com suporte, Pagamento mensal, Planos estendidos).

**Status:** implementado, lint e `tsc --noEmit` limpos. **Não deployado ainda** — segue [[feedback_deploy_manual]], deploy é sempre manual pelo Jonas.

**Pendente:**
- Deploy + teste ponta a ponta com clique real (local com payload simulado, ou direto em produção)
- Trocar `TEMPLATE_POR_TIPO.amanha` em `notificacoes-vencimento.ts` de `lembrete_vencimento` pra `lembrete_vencimento_v2` quando aprovado pela Meta
- `enviar-template/route.ts` (envio manual pelo chat) continua sem vínculo de `id_assinatura` — aceitável por ora, cai no fallback por telefone/ambiguidade

**How to apply:** esse padrão (gravar `id_assinatura` na mensagem de origem pra evitar ambiguidade em respostas automáticas) vale para qualquer nova automação disparada por assinatura específica que gere resposta automática por clique de botão — não assumir que "telefone do cliente" identifica uma assinatura única.

## 🔄 `lembrete_vencimento_v2` aprovado e em produção (31/07/2026)

Aprovado pela Meta, código implementado (commit `c3f7093`, branch `main`, deployado por Jonas) — `TEMPLATE_POR_TIPO.amanha` em `notificacoes-vencimento.ts` já aponta pra `lembrete_vencimento_v2`, `buscarDadosParaEnvio` busca `identificacao`, rota monta os 4 parâmetros com fallback "Principal". Fluxo completo (disparo → template → clique → resposta) em produção.

## 🔄 `vencido_plano_v2` desenhado e submetido à Meta (31/07/2026) — status PENDING

Sessão seguinte redesenhou o segundo template (`vencido_plano`, acesso já suspenso — diferente do lembrete de "vence amanhã"). Decisão de tom: manter alerta visual (**⚠️**) logo no início do corpo, com saudação curta, pensando especificamente no **preview de notificação do WhatsApp** (que corta em ~40-60 caracteres e mostra só a primeira linha antes do cliente abrir a conversa) — assim o alerta aparece na tela de bloqueio/notificação sem precisar abrir a mensagem.

**Template submetido — `vencido_plano_v2`, id `1578433000676721`, status `PENDING`, categoria UTILITY:**
```
⚠️ Oi, *{{1}}*! Seu acesso foi suspenso.

📺 Plano: *{{2}}*
🏷️ Identificação: *{{3}}*
📅 Venceu em: *{{4}}*

Para reativar, escolha uma opção abaixo. 👇
```
Botões: **os mesmos** "Pagamento mensal" e "Planos estendidos" do `lembrete_vencimento_v2` — reusados de propósito, porque `auto-resposta-suporte.ts` já trata esses botões de forma genérica (só checa se a mensagem original é de algum template em `TEMPLATES_GATILHO`, não amarrado a nome específico). **Zero código novo necessário** pra esse template funcionar, só falta:

**✅ Aprovado e ativado em 31/07/2026 (commit `e053a43`, branch `main`, push feito).** Jonas pediu pra agendar checagem em 30 min (usei `ScheduleWakeup`, não o `schedule`/cloud routine — este último não serve pra esse tipo de tarefa porque roda isolado na nuvem, sem acesso a `.env.local`/chave SSH/memória local); antes do wakeup disparar, Jonas avisou manualmente que já tinha sido aprovado, cancelei o wakeup agendado e apliquei na hora.

**Mudanças aplicadas:**
1. `TEMPLATES_GATILHO` em `auto-resposta-suporte.ts` ganhou `'vencido_plano_v2'`
2. `TEMPLATE_POR_TIPO.vencidos` em `notificacoes-vencimento.ts`: `'vencido_plano'` → `'vencido_plano_v2'`
3. `notificacoes-vencimento/route.ts`: como os dois templates (`amanha` e `vencidos`) agora têm 4 variáveis, simplificado pra montar `[primeiroNome, telasTxt, identificacaoTxt, dataTxt]` sempre, sem condicional por tipo

Lint (2 erros `any` pré-existentes, sem relação) e `tsc --noEmit` limpos antes do commit. **Não deployado ainda** — túnel do Easypanel reaberto/confirmado em `localhost:3001`, deploy manual pelo Jonas como sempre.

**Template antigo `vencido_plano` (referência histórica):** tom mais formal, sem campos — "Olá, {{1}}! 👋\n\nSeu plano *{{2}}* venceu em {{3}} e seu acesso foi suspenso.\n\nEntre em contato para regularizar sua situação.\n\n_JS Sistemas_", botão único "Falar com suporte". Fica aprovado na Meta mas sem uso pelo código a partir de agora — pode ser removido da Meta futuramente se quiser limpar a lista.

**Status final desta rodada:** `lembrete_vencimento_v2` e `vencido_plano_v2` — ambos aprovados, ativados no código, commitados e com push feito. Só falta o deploy manual do Jonas no Easypanel pra valer em produção.

## 🐛 Bug real em produção (01/08/2026) — botões "Pagamento mensal"/"Planos estendidos" nunca disparavam auto-resposta

Jonas reportou falha em operação: cliente Vitor (553184033260, assinatura 2309) clicou em "Pagamento mensal" após receber o `lembrete_vencimento_v2` e não recebeu a mensagem de valor + chave PIX — teve que enviar manualmente.

**Causa raiz:** quando os botões "Pagamento mensal"/"Planos estendidos" foram criados (31/07/2026, ver seção acima), a lógica completa foi implementada em `auto-resposta-suporte.ts` (`responderFalarComSuporte`), mas o filtro de gatilho em `src/app/api/whatsapp/webhook/route.ts` (linha ~147) **não foi atualizado junto** — continuou checando só `['Falar com suporte', 'Chave PIX', 'Automático mensal'].includes(conteudo)`, então a função nunca era chamada pros 2 botões novos. O clique era registrado normalmente no banco (`whatsapp_mensagens`, `reply_to_wa_msg_id` correto) — falha 100% silenciosa, sem log de erro, porque o código nunca era executado.

**Diagnóstico:** confirmado via query em `whatsapp_mensagens` (template enviado → `interactive_reply` "Pagamento mensal" do cliente → próxima mensagem já é o PIX manual do Jonas, sem nenhuma mensagem intermediária com `source='auto-resposta-suporte'`) e checagem de que a assinatura/plano do cliente estavam OK (não era problema de dados).

**Correção:** commit `ff3f24c` — array do filtro passou a incluir os 5 botões: `['Falar com suporte', 'Chave PIX', 'Automático mensal', 'Pagamento mensal', 'Planos estendidos']`.

**Lição — ver [[feedback_botao_whatsapp_dois_pontos_atualizar]]:** qualquer botão novo de auto-resposta nesse fluxo exige mudança em **dois lugares diferentes**, não um só.
