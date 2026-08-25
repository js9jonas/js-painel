---
name: project-painel-acesso-web
description: "Campo url_acesso_web em painel_servidores + opção 'Enviar acesso web' no balão de conta (/clientes/[id] e /chat); limpeza de campos sem uso (url_api, padrao_usuario/senha)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 10b491a3-2600-40b7-8a77-0f2625198fdc
  modified: 2026-08-17T22:44:13.579Z
---

Implementado e deployado em 24/07/2026 (js-painel). Duas frentes na mesma sessão:

**1. Limpeza de `painel_servidores`:** removidos `url_api` (nunca lido por nenhum adapter, endpoints ficam hardcoded em `src/lib/painel-adapters/*`) e `padrao_usuario`/`padrao_senha` (só texto informativo no card, nunca usado na geração de conta/teste). Migrações `sql/007_painel_servidores_drop_unused_fields.sql`. Campo `url_api` de `painel_apps` (tabela separada) foi preservado — esse é usado ativamente em `PainelAppModal.tsx`.

**2. Novo campo `url_acesso_web`:** `sql/008_painel_servidores_url_acesso_web.sql`. Editável no modal "Painéis de Contas" (`PainelServidorModal.tsx`, campo "Acesso web (login pelo navegador)"). Exemplo já cadastrado: FAST → `https://vover.me`.

**3. Opção "Enviar acesso web" no balão de conta:** aparece em `ContaAcoesMenu.tsx` (condicional `podeAcessoWeb = !!conta.url_acesso_web`), ao lado de "Enviar Dados de XCIPTV"/"Xtream Codes". Reaproveita o mesmo fluxo de texto livre via WhatsApp (janela 24h, fallback "copiar modelo" se fechada). Mensagem: `montarMensagemAcessoWeb()` em `src/lib/dados-acesso-iptv-formato.ts`:
```
*Pode acessar sua conta* usando o navegador de internet 👇
Acesse: {url}

Em seguida entre com seus dados de acesso.
*Usuário*: {usuario}
*Senha*: {senha}
```
`/clientes/[id]` e `/chat` puxam da mesma `getContasPainelByClienteId` (via `/api/clientes/[id]/contas`), então a opção aparece nos dois lugares sem duplicar código.

**Deploy:** primeira tentativa falhou com `504` baixando binário do `ffmpeg-static` no build Nixpacks — falha transitória de rede, sem relação com o código (nada em `package.json` mudou). Retry no Easypanel resolveu.

**Referência:** [[project_conexoes_paineis]], [[feedback_acesso_banco]] (túnel SSH usado pra aplicar as duas migrações).

**17/08/2026 — UNITV preenchido:** Jonas pediu pra adicionar acesso web da UNITV (`http://www.uvwebs.info`) no balão de conta. Só precisou de `UPDATE public.painel_servidores SET url_acesso_web = 'http://www.uvwebs.info' WHERE id = 5` — feature já existia e Jonas tinha esquecido ("não tinha lembrado que essa função estava ativa"). **How to apply:** sempre que pedir pra adicionar link de acesso web de um painel novo, primeiro checar `SELECT id, nome, url_acesso_web FROM public.painel_servidores WHERE nome ILIKE '%<painel>%'` — se a linha existir e o campo estiver `null`, é só um UPDATE, não precisa mexer em `ContaAcoesMenu.tsx` nem fazer deploy.
