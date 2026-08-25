---
name: project-iphone-dados-acesso
description: "Opção 'Enviar dados para iPhone' no balão de conta — gera screenshot do Smarters Player Lite já preenchida com usuário/senha/URL reais e envia via WhatsApp"
metadata: 
  node_type: memory
  type: project
  originSessionId: 10b491a3-2600-40b7-8a77-0f2625198fdc
  modified: 2026-07-24T18:38:27.992Z
---

Implementado e deployado em 24/07/2026 (js-painel). App-alvo: **Smarters Player Lite** (iOS), único app iPhone usado pra IPTV — `https://apps.apple.com/br/app/smarters-player-lite/id1628995509`.

**Origem:** Jonas fazia esse fluxo manualmente (11 mensagens soltas, fora de ordem, sem padrão) — analisado a partir de conversa real no chat (contato 553199362259, 02/07/2026). Padronizado em 6 mensagens, com a tela de cadastro do app **pré-preenchida com os dados reais do cliente** em vez de só uma screenshot genérica.

**Assets em `src/assets/whatsapp-iphone/`** (versionados no repo, não em `public/` — não precisam ser públicos, o envio faz upload direto pro WhatsApp):
- `enter-playlist-base.png` — screenshot "Enter Your Playlist" com o texto placeholder **já apagado** (reconstruído via amostragem de cor local do gradiente, feito uma única vez)
- `LiberationSans-Bold.ttf` (+ `.LICENSE.txt`, SIL OFL 1.1) — fonte **embutida via base64 no SVG** com nome de família exclusivo (`IPTVDataFontEmbutida`), pra não depender de nenhuma fonte instalada no container Nixpacks de produção. Validado forçando um nome que não existe em nenhum fontconfig do host — só renderiza se vier do arquivo embutido.
- `logo-app.png`, `choose-playlist-type.png`, `parental-control.png` — screenshots estáticos, iguais pra todo cliente

**`src/lib/iphone-overlay.ts`** — `gerarImagemDadosIphone({playlistName, usuario, senha, url})`: desenha os 4 campos sobre a base limpa. Coordenadas calibradas por **scan de pixel** (não visual) em `enter-playlist-base.png` (1280x591) — se a imagem-base for trocada um dia, recalibrar. `playlistName` segue a mesma convenção do "Nome" já usado em `montarMensagemXtream` (primeira palavra do rótulo/nome do painel, minúscula).

**`src/app/actions/dadosAcessoIphone.ts`** — `enviarDadosAcessoIphone(idConta, idCliente)`, sequência final (Parental Control por último, ajustado a pedido do Jonas — fica mais lógico porque no app real essa tela só aparece depois de adicionar a playlist):
1. texto intro
2. imagem logo + legenda com link da App Store
3. imagem "Choose Playlist Type" + legenda
4. texto "preencha exatamente como na imagem"
5. imagem com os dados reais + legenda "toque em ADD PLAYLIST"
6. imagem "Parental Control" + legenda sugerindo PIN `0000`

Mesma trava de janela 24h dos fluxos existentes (`buscarTelefoneJanela24h`, extraída de `dados-acesso-iptv.ts` pra reuso) — se não há mensagem do cliente nas últimas 24h, **nada é enviado**, nenhuma mensagem parcial.

**`src/lib/whatsapp-envio.ts`** — novo `enviarImagemWhatsapp()`: sempre faz **upload fresco** da imagem a cada envio (não cacheia `media_id`) pra evitar mídia expirada — mesmo princípio de robustez usado em toda a sessão.

**Testado com envio real** (não só simulação) antes do commit: conta 3089 (cliente 2573, painel Liebe) → contato 555193162326, `npx tsx --env-file=.env.local` chamando a Server Action diretamente. 6 mensagens confirmadas na ordem certa no banco (`source: dados-iphone`).

**Opção no menu:** `ContaAcoesMenu.tsx`, dentro do mesmo bloco condicional de XCIPTV/Xtream (`podeM3u` — mesma credencial Xtream por trás).

Ver [[project_painel_acesso_web]] (mesma sessão, feature irmã — "Enviar acesso web").

## ⚠️ Correção 24/07/2026 — fonte embutida via SVG falhou em produção

O risco de fonte que eu mesmo tinha sinalizado **se confirmou**: em produção, os 4 campos apareciam como caixas vazias (tofu, ▯▯▯) em vez do texto real. A "prova" que eu tinha feito antes do deploy (nome de fonte exclusivo, não existente no sistema) não testava a condição real — não desligava de fato o fontconfig do host.

**Correção:** troquei `sharp` + SVG `@font-face` por **`@napi-rs/canvas`** (`GlobalFonts.registerFromPath()`), que registra a fonte direto do arquivo sem depender de fontconfig/Pango. `src/lib/iphone-overlay.ts` reescrito pra usar Canvas 2D em vez de composição SVG.

**Validação real desta vez:** reproduzi o bug (idêntico à screenshot de produção) rodando o código antigo dentro de `docker run node:20-slim` (container limpo, zero fontes) — e confirmei que `@napi-rs/canvas` renderiza corretamente no mesmo container. Só depois disso apliquei a correção e testei de novo via envio real (`enviarDadosAcessoIphone` direto, `npx tsx --env-file=.env.local`).

Ver [[feedback_testar_ambiente_deploy_docker]] — lição geral daqui: pra qualquer dependência de SO/container (fontes, binários, libs nativas), reproduzir o ambiente de deploy via Docker antes de declarar validado, não simular com variável de ambiente no host de dev.

## ⚠️ Segunda correção 24/07/2026 — build do Turbopack quebrou (serverExternalPackages)

Depois da troca pra `@napi-rs/canvas`, o deploy falhou de novo — dessa vez no build (`npm run build`), não em runtime: Turbopack não conseguia empacotar o binding nativo `.node` do pacote ("non-ecmascript placeable asset"). `js-painel` já tinha exatamente essa regra pro `impit` (outro módulo NAPI/Rust) em `next.config.js` → `serverExternalPackages`; faltou adicionar `@napi-rs/canvas` na mesma lista. Corrigido, e **validado rodando `npm run build` local antes de subir** (só tinha rodado `tsc`/`lint` no commit anterior, que não pegam erro de bundling).

**✅ Confirmado em produção 24/07/2026** — Jonas testou e a imagem com dados reais renderiza corretamente (texto legível, sem tofu).
