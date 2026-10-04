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
