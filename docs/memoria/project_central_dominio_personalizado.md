---
name: central-dominio-personalizado
description: Processo confirmado ponta a ponta para adicionar um domínio personalizado (comprado no Namecheap) ao painel CENTRAL (painel.fun) — Cloudflare por trás
metadata: 
  node_type: memory
  type: project
  originSessionId: d28a0cd7-f5d1-4f8d-8707-91612d8cd602
  modified: 2026-08-20T02:45:19.294Z
---

✅ Testado e confirmado ponta a ponta em 19-20/08/2026 com o domínio `conecta5.store`.

## Processo

1. **Comprar o domínio no Namecheap** normalmente (registro do nome, nada especial).
2. No painel CENTRAL (`https://painel.fun`, login com credencial salva em `public.servidores` id_servidor=2) → menu lateral **"Gerenciar Domínios"** → botão **"Novo domínio"** → digitar só o nome do domínio (ex: `conecta5.store`) → Salvar.
3. O painel usa **Cloudflare** por trás — ao salvar, atribui automaticamente **2 nameservers Cloudflare dedicados** àquele domínio (par diferente por zona, ex: `arely.ns.cloudflare.com`/`kipp.ns.cloudflare.com` para os domínios antigos, `junade.ns.cloudflare.com`/`monika.ns.cloudflare.com` para `conecta5.store`). Aparecem na própria listagem "Domínios".
4. **No Namecheap**: Domain List → o domínio → Nameservers → trocar de "Namecheap BasicDNS" para **"Custom DNS"** → colar os 2 nameservers que o painel mostrou.
5. Aguardar propagação — **nesse teste levou menos de 1h no total** (verificado: NS propagados nos resolvers públicos em minutos; HTTP puro já respondia bem rápido; HTTPS/certificado SSL Universal do Cloudflare levou um pouco mais, mas também dentro da mesma hora).
6. **Não precisa configurar mais nada** — nem registro A/CNAME manual, nem no painel nem no Namecheap. O CENTRAL provisiona o roteamento (proxy reverso) automaticamente assim que reconhece a zona.

## Como verificar o status de propagação (usado durante o teste)

```bash
dig +short NS <dominio>              # confirma NS propagados
dig +short NS <dominio> @8.8.8.8     # via Google DNS
dig +short NS <dominio> @1.1.1.1     # via Cloudflare DNS
dig +short <dominio>                 # deve resolver pra 2 IPs Cloudflare (faixa 104.21.x.x / 172.67.x.x)
curl -sI http://<dominio>            # HTTP puro — deve responder 200, Server: cloudflare, X-Powered-By: PHP/7.4.5
curl -sI https://<dominio>           # HTTPS — só funciona depois do certificado SSL Universal ativar
```

Sinal de que falta só o SSL ativar (não é erro de configuração): HTTP puro (porta 80) já responde 200 normalmente, mas HTTPS dá `TLS handshake failure`. Isso é o Cloudflare ainda emitindo o certificado Universal SSL pra zona nova — resolve sozinho, sem nenhuma ação adicional.

## Onde NÃO estava documentado

O manual oficial do CENTRAL (link em "Manual de instruções" no painel → `abrela.me/manual`, senha `5centralbraz`, PDF "Manual Revenda FIVE / CENTRAL") **não cobre esse processo** — confirmado por sumário completo (35 páginas): só tem configuração de apps/players (SmartUP, GSE, Smarters, Downloader, TVs), P2BRAZ/P2P, BrazX OTT e tutoriais em vídeo. Nada sobre domínio/DNS/Cloudflare.

Ver também [[reference-comparativo-fornecedores-iptv]] (host_stream padrão do CENTRAL é `bandeira5.info`, diferente do painel admin `painel.fun`).
