---
name: project-pwa-instalavel
description: js-painel instalável como app no celular (manifest + ícones do logo), commit 5ae1a89 de 15/10/2026
metadata:
  type: project
  modified: 2026-10-15
---

Commit `5ae1a89` (15/10/2026): `src/app/manifest.ts` (nome "JS Painel", standalone, start_url `/dashboard`, atalhos Chat e Alertas, theme `#0a3fd8`), ícones em `public/icons/` gerados do logo JS Sistemas Streaming (quadrado azul com play; `icon-192/512` com cantos, `maskable-512` e `apple-touch-icon` com fundo cheio), título "JS Painel" no layout.

`src/proxy.ts` libera `manifest.webmanifest` e `/icons/` sem login — o Chrome lê o manifest antes do login. Sem service worker (não precisa pra instalar; sem tela offline).

**How to apply:** ícone novo → substituir os 4 PNGs em `public/icons/` mantendo nomes e tamanhos; maskable precisa do desenho dentro dos 80% centrais.

📋 Deploy manual e 1ª instalação no celular pelo Jonas (Chrome → ⋮ → Instalar app). Ideias futuras: tela offline, notificação push de comprovante no /chat.
