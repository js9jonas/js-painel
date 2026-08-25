---
name: project-chat-stickers-gifs
description: "Implementação de stickers e GIFs no chat WhatsApp do js-painel — arquitetura, arquivos, bugs corrigidos e pendências"
metadata: 
  node_type: memory
  type: project
  originSessionId: efaaa14a-1ab1-4958-ae8b-352b925b99ec
---

## Estado atual (13/06/2026) — implementado e no ar

### Arquivos criados/modificados
- `src/components/chat/StickerPicker.tsx` — componente picker (abas por pack, ⭐ favoritos, GIF com busca Tenor + infinite scroll)
- `src/app/api/whatsapp/stickers/route.ts` — GET packs (lê `public/stickers/`) + POST toggle favorito
- `src/app/api/whatsapp/stickers/salvar/route.ts` — POST: baixa sticker recebido via Meta API e salva em `public/stickers/{pack}/`
- `src/app/api/tenor/route.ts` — proxy para Tenor API (busca + featured)
- `src/app/api/whatsapp/enviar/route.ts` — suporte a `tipo: sticker` (link público) e `tipo: gif` (video mp4)
- `src/app/api/whatsapp/webhook/route.ts` — sticker recebido de cliente e echo agora salvam `msg.sticker.id` em `conteudo`
- `src/app/(protected)/chat/page.tsx` — botão 😊 abre StickerPicker; renderiza `tipo=sticker` e `tipo=gif`; botão ⬇ Salvar em stickers recebidos
- `src/proxy.ts` — `/stickers/` adicionado às rotas públicas (crítico: sem isso WA e browser recebem redirect de login)

### Banco de dados
- Tabela criada: `public.whatsapp_sticker_favoritos (id, url TEXT UNIQUE, criado_em)`

### Estrutura de packs em disco
```
public/stickers/
  {nome-do-pack}/
    pack.json   ← { "nome": "...", "emoji": "🎉" }
    *.webp
  recebidos/    ← criado automaticamente ao salvar sticker recebido
    pack.json
    sticker_TIMESTAMP.webp
```

### Variável de ambiente necessária
- `GIPHY_API_KEY` — migrado do Tenor (encerrado 30/06/2026) para Giphy em 18/06/2026
  - Chave em `/home/jonas/js-painel/.env.local`
  - ✅ Adicionado no Easypanel em 18/06/2026

### Como stickers são enviados
- Tipo `sticker`: `POST /api/whatsapp/enviar` com `{ tipo: 'sticker', url: '/stickers/pack/file.webp' }`
- A rota monta URL absoluta `https://painel.jssistemas.online/stickers/...` e envia via Meta API como `type: sticker, sticker: { link }`
- URL pública garantida porque `/stickers/` está no whitelist do middleware

### Como stickers recebidos são exibidos
- `conteudo` = media_id do WhatsApp → renderiza com `src=/api/whatsapp/media?id=`
- Stickers enviados pelo painel têm `conteudo` = URL local → renderiza direto

### Pendências / possíveis ajustes
1. **Persistência dos arquivos salvos**: arquivos em `public/stickers/recebidos/` ficam no container Docker. Um redeploy no Easypanel apaga tudo. Solução futura: salvar no banco (base64) ou montar volume persistente no Easypanel apontando para esse diretório.
2. **Tenor API Key**: ainda não configurada no Easypanel — GIFs retornam erro 500 até adicionar.
3. **Stickers antigos com JSON no conteudo**: mensagens de sticker recebidas ANTES do fix (webhook) têm `conteudo = JSON.stringify(msg.sticker)`. Podem ser corrigidas com: `UPDATE public.whatsapp_mensagens SET conteudo = conteudo::json->>'id' WHERE tipo = 'sticker' AND conteudo LIKE '{%'`
4. **Requisitos Meta para sticker via link**: deve ser WebP 512×512px, ≤100KB estático ou ≤500KB animado. Se a Meta rejeitar, alternativa é fazer upload via `/media` endpoint para obter media_id permanente.
5. **GIF enviado como video**: o destinatário vê como vídeo MP4, não como GIF em loop. WhatsApp não tem tipo nativo GIF — é comportamento esperado da API.

**Why:** Jonas pediu continuação em outra sessão; gravar estado completo para retomar sem perda de contexto.
**How to apply:** Ao retomar, consultar esta memória antes de qualquer alteração nos arquivos acima.
