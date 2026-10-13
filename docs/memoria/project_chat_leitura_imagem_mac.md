---
name: project_chat_leitura_imagem_mac
description: 29/09/2026 — /chat lê MAC/chave de imagem sob demanda (Claude), cruza com catálogo e cadastros e cadastra o app com o modal preenchido; substitui o processamento automático do n8n
metadata:
  type: project
---

Pedido do Jonas em 29/09/2026. Cada imagem enviada pelo cliente no `/chat` tem um ícone (ScanText) acima do botão de ações. Ao clicar, `POST /api/whatsapp/ler-imagem` → `src/lib/ler-imagem-app.ts`:
- **Download:** baixa a imagem (disco local → Meta → Drive, via `src/lib/midia-whatsapp.ts`, compartilhado com a transcrição de áudio).
- **Leitura:** manda pro `claude-opus-5-5` (esforço baixo, saída JSON estruturada, `fallbacks: "default"` passado fora da tipagem do SDK 0.78) com o catálogo `public.apps`.
- **Retorno:** app (do catálogo), MAC, chave, validade, outros dados e observação.
- **Cruzamento:** procura em `public.aplicativos` o mesmo MAC em qualquer app e marca se o registro é do cliente da conversa (telefone da mensagem → `contatos`).
- **Cartão:** temporário (some ao trocar de conversa, nada é gravado). Mostra "Já cadastrado" (verde se deste cliente, vermelho se de outro ou órfão) e o botão "Cadastrar aplicativo" (abre o `AplicativoModal` com a prop `inicial`) só se o app bateu com o catálogo, o MAC é válido e não há cadastro desse MAC nesse app.

**Clouddy:** o campo `mac` guarda o e-mail de login e a `chave` guarda a senha; a leitura segue isso (o cartão mostra "E-mail (login)"/"Senha").

**Why:** o n8n processava toda imagem recebida e mandava pro Telegram; a ideia é ler só quando o Jonas pede, no contexto da conversa.

**How to apply:** ✅ 29/09 o nó "Telegram — Ativação" do workflow n8n "WhatsApp JS API Oficial" (`81byRJISvt0l7X6X`) foi **desativado** (não apagado). A análise de imagem do n8n ("Analisar com Claude") **continua ligada** porque o ramo de comprovante de Pix depende dela; só o envio da ativação pro Telegram parou. Pra voltar, é só reativar o nó. Custo estimado de US$0,01–0,02 por leitura (só roda no clique). O `msgId` chega como string do /chat (bigint) — a rota converte.

**Reação 🔄 pelo celular (29/09/2026):** reagir com 🔄 numa imagem de cliente no WhatsApp do celular (eco `smb_message_echoes`) dispara a mesma leitura e manda o resultado pro Telegram do Jonas (`src/lib/leitura-por-reacao.ts`): MAC/chave em `<code>`, botões `copy_text` pra copiar, cadastros existentes e link pro cliente. Só dispara se a reação anterior não era 🔄, então reenvio da Meta não duplica; pra refazer, é só tirar a reação e reagir de novo. 🔄 em outra mensagem é só uma reação comum. Substitui o envio automático que o n8n fazia.

## 03/10/2026 — leitura permanente + coluna direita recolhível (commit abaixo)

- **Tabela `public.whatsapp_leituras_imagem`** (`sql/013`, já aplicada em produção): 1 linha por imagem (`id_mensagem` PK → `whatsapp_mensagens.id` ON DELETE CASCADE, `dados` jsonb, `modelo`, `lido_em`). Guarda **só o extraído** pela IA; `cadastros`/`pode_cadastrar`/`id_cliente_conversa` são recalculados por `vincularCadastros()` a cada exibição. Separada de `whatsapp_mensagens` de propósito (UPDATE lá dispara o gatilho do resumo — incidente 29/09).
- `lerImagemApp(msgId, { forcar })`: sem `forcar`, devolve a leitura salva sem chamar a IA (vale também pra reação 🔄 pelo celular — reagir de novo **não relê**; pra reler, botão "Ler de novo" ↻ no cartão do /chat, que manda `forcar: true`).
- `GET /api/whatsapp/ler-imagem?telefone=` → `leiturasDaConversa()`; o /chat chama 1x ao abrir a conversa (fora do polling de 5 s). Cartões ficam **sempre abertos**; o ✕ só esconde nesta tela (volta ao reabrir a conversa).
- Coluna direita do /chat (assinaturas, aplicativos…) recolhível: botão no canto superior esquerdo do painel; recolhida vira faixa de 40 px com botão de abrir. Preferência em `localStorage` (`chat:painelDireitoRecolhido`), por navegador.
- Testado local (jobs desligados, envios bloqueados) com a imagem 99389 (Quelin Scheibe): 1ª leitura gravou; reabrir trouxe o cartão só com o GET; ↻ releu (~10 s) e atualizou `lido_em`; recolher/reabrir e persistência após reload ok.

## 12/10/2026 — cadastro completo a partir da leitura (`521943f`, ⚠️ deploy manual pelo Jonas, não testado na tela ainda)

- `pode_cadastrar` não exige mais app identificado: MAC válido + sem cadastro no mesmo app basta. Sem app, o botão vira "+ Cadastrar aplicativo (escolher app)" e o `AplicativoModal` abre com o select vazio. A trava de MAC repetido no app escolhido continua no `createAplicativo`/`cadastrar-painel`.
- Contato sem cliente: o cartão tem link "Cadastrar cliente" (abre o `NovoClienteModal`, que já cria a assinatura padrão).
- Depois de salvar, o cartão relê a leitura salva (POST sem `forcar`, sem custo de IA) em vez da atualização otimista, e o /chat recarrega contas e assinaturas.
- `AplicativoModal` (vale também em /clientes/[id]): com Fun/Lazer/Core "pelo painel" e **nenhuma conta com lista**, aparece "Criar teste" (servidor + descrição). `opcoesTesteCliente()` traz os painéis com `gerarTeste` (`TIPOS_COM_TESTE` agora em `src/lib/paineis-teste.ts`) e a assinatura em uso (mais recente fora de cancelado/inativo). Sem assinatura em uso, `criarContaTeste(…, null, …)` cria **1 Tela · Padrão mensal** (pacote 51, plano 1, ativo, venc_contrato hoje) **na mesma transação da conta**, só depois do teste gerado no painel (teste que falha não deixa assinatura vazia); cliente travado com `FOR UPDATE` contra duplicar. Auditoria `criacao_teste_conta` com `assinatura_criada` no `dados_depois`. A conta nova já fica selecionada como "Lista no aparelho".
- Transação validada no banco com ROLLBACK (assinatura + conta, `venc_contas` preenchido pelo gatilho). Não foi gerado teste real em painel.

## 12/10/2026 — SmartOne no cadastro com lista (`ccacf29`, ⚠️ deploy manual pelo Jonas)

- Escolher SmartOne (id_app 4) no `AplicativoModal` mostra "Cadastrar no painel do app": `cadastrar-painel` → `executarSmartOne` faz `add_playlist` (MAC + Xtream da conta, nota = nome do cliente, nome da lista "Primeiro TV") **sem gastar giftcode**; grava `aplicativos` (`id_dispositivo_painel` = smartkey) + `aplicativo_playlists` (id_conta). Chave opcional, **lista obrigatória** (SmartOne não tem aparelho sem lista; sem conta → "Criar teste"). `appTemCadastroComLista()`/`ID_APP_SMARTONE` em `apps-painel-ids.ts`; `sessaoSmartOne()`/`painelSmartOneAtivo()` em `app-painel.ts`. `TIPO_POR_ID_APP` continua só appacesso (ativar/listas-aparelho dependem disso).
- Verificado no site real (JS Contas, MAC 74:C1:7E:CA:84:83, depois apagado): o smartkey novo vai pra aba **pending** e não aparece em `index/active` (a que o sync lê); se o MAC já é ativado, herda a validade. Jonas: vira Active em minutos, quando o cliente recarrega a lista. Por isso o sync de apps **não remove registro com `atualizado_em` nas últimas 2 h**.
- Limite conhecido: o SmartOne grava porta 80 sempre (`smartone-m3u.ts`) — servidor com porta diferente no `host_stream` não funcionaria (já era assim no "Adicionar lista").

**12/10/2026 — SmartOne não tem "selecionar lista" remoto** (verificado no site, só leitura): painel de revenda por linha só tem ver (`view_smartkey`), editar (`edit_playlist`), apagar (`delete_smartkey`) e ativar (giftcode); páginas públicas (`/manage-devices` = a mesma conta, `main_generate` = só adicionar lista, `main_activate`) também não. A escolha da lista é feita na TV. Contornos possíveis (não testados numa TV): editar a lista que o aparelho já usa (troca servidor/usuário/senha no lugar) ou apagar as outras listas do MAC para sobrar só uma.

## 12/10/2026 — Renovar SmartOne por giftcode em /alertas (`3daf7cf`, ⚠️ deploy manual; renovação real ainda não feita)

- SmartOne vencendo em /alertas mostra "Renovar no painel" (`AtivarPainelButton` com `giftcode`, "Confirmar: gasta 1 giftcode") no lugar do "+1 ano" manual. `alertas.ts`: `no_painel_app` inclui smartone + campo `painel_smartone`.
- `ativar-painel/route.ts` → `renovarSmartOne()`: `buscarDispositivoPorMac()` (novo no adapter: abas active e pending, 20/página, para no 1º achado; MAC inexistente ~16 s varrendo tudo) → mesma trava de 40 dias → `ativarDispositivo()` (1 giftcode "Unused") → relê a validade no painel. Gravação/auditoria extraída em `gravar()` (compartilhada com Fun/Lazer/Core).
- Achado no site: Expiration pode ser data, "Trial, Days Left: N" (vira data), **"Expired"** (42 aparelhos, sync grava validade NULL → somem de /alertas) e "Lifetime" (1). Não alterado: decidir com o Jonas se o sync deve manter a última validade em vez de NULL.

**12/10/2026 — histórico de giftcodes do SmartOne é legível** (`/plugin/smart_one/client_codes/index/all/{p}/?sort=date_added&order=desc`, ~20 por página, abas all/used/unused/yearly/lifetime): colunas Código · MAC · Subscription · Date Added · Date Used · Expire · Group · Invoice. Em 12/10: 1.770 códigos desde 03/2022, 1.753 usados (todos Yearly), 1.029 MACs, 17 livres. Datas do site às vezes 1 dia à frente do banco (fuso). Cruzamento com `aplicativos` (685 SmartOne): 616 batem (±3 dias), 25 sem validade no banco têm vencimento real pelo giftcode (os "Expired"), 8 divergem, 19 MACs com giftcode em dia não estão cadastrados. Nada implementado ainda.
