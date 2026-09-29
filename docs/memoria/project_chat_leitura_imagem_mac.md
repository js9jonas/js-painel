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

**How to apply:** 📋 pendente desligar o processamento de imagem do n8n (workflow do webhook do WhatsApp) depois de validado em produção. Pedir um token temporário da API do n8n e mostrar os nós antes de desativar. Custo estimado de US$0,01–0,02 por leitura (só roda no clique). O `msgId` chega como string do /chat (bigint) — a rota converte.
