---
name: whatsapp-token-expiry
description: Token WhatsApp Cloud API permanente (System User) gerado em 06/07/2026 — substituiu o temporário de 60 dias
metadata: 
  node_type: memory
  type: project
  originSessionId: 166ec610-a2e0-4c80-9632-0dd147f384d0
  modified: 2026-08-11T20:23:27.628Z
---

## ✅ Token permanente gerado — 06/07/2026

Token sem expiração criado via System User `js-painel` (business "JS Sistemas", business_id `1017814805598204`), escopos `whatsapp_business_messaging` + `whatsapp_business_management`, para o app `jswhats`.

**Como foi feito** (documentado porque a estrutura tinha uma pegadinha):
- A WABA de produção ("JS Sistemas - suporte", asset ID `1012927594474965`) pertence ao portfólio "JS Sistemas - suporte" (business_id `1639524370653689`), que não tem nenhum app vinculado.
- Tentar "Conectar um ID do app" nesse portfólio pediria **transferência de propriedade** do app `jswhats` — arriscado, não foi feito.
- Solução: a WABA de produção já estava compartilhada (Acesso total) com o portfólio "JS Sistemas" via parceria business-to-business existente. Bastou ir em Contas do WhatsApp → "JS Sistemas - suporte" → Atribuir pessoas → marcar o system user `js-painel` → Acesso total.
- Depois, no system user `js-painel` (que já existia, com o app `jswhats` instalado) → Gerar token → app jswhats → expiração "Nunca" → escopos whatsapp_business_messaging + whatsapp_business_management.

**Atualizado em:**
- ✅ `/home/jonas/js-painel/.env.local` — `WHATSAPP_TOKEN`
- ✅ `/home/jonas/js-lab/.env.local` — `WHATSAPP_TOKEN`
- ✅ n8n workflow `81byRJISvt0l7X6X` — Authorization dos 5 nós "Enviar" (Enviar texto, Enviar texto (PDF), Enviar EXTRAÇÃO_APP, Enviar MAC, Enviar CHAVE) via PUT na API
- 🔲 Easypanel → serviços js-painel e js-lab (variáveis de ambiente em produção) — Jonas faz manualmente

**Why:** o token temporário de 60 dias (criado 07/06/2026) expiraria ~07/08/2026. A verificação da empresa "JS Sistemas - suporte" foi aprovada (confirmado 06/07/2026), o que liberou a criação do token permanente.

**How to apply:** se precisar gerar de novo (revogação, rotação), repetir o caminho acima — não tentar "Conectar um ID do app" no portfólio "JS Sistemas - suporte", pois isso solicita transferência de propriedade do app.

## ⚠️ Incidente — atualização de julho ficou incompleta, comprovantes pararam (11/08/2026)

A atualização de 06/07/2026 trocou o token só nos **5 nós "Enviar"** do workflow `81byRJISvt0l7X6X`. Mas existem **outros 5 nós no mesmo workflow** que também usam `Authorization: Bearer <token>` hardcoded pra chamar `graph.facebook.com` (buscar URL de mídia / baixar mídia) — esses ficaram esquecidos com o **token antigo**, que expirou por volta de 07-08/08/2026:
- `Buscar base64 — Evolution` (imagem)
- `Buscar base64 — Evolution (PDF)`
- `Pedir imagem ativação`
- `Baixar mídia`
- `Baixar mídia (PDF)`

**Sintoma:** desde ~07/08, todo comprovante (imagem ou PDF) enviado por cliente quebrava logo no primeiro node com `Authorization failed - please check your credentials` — Claude nunca chegava a analisar, cliente não recebia resposta nenhuma. Diferente do bug de 26/07 ([[project_n8n_comprovante]]), esse aparecia como `status: error` real nas execuções (não "success" enganoso), mas só some percebido quando alguém checa os logs — não há alerta automático de execução falha nesse workflow.

**Fix aplicado 11/08/2026:** troquei o token antigo pelo novo (permanente) nos 5 nós faltantes, via PUT na API n8n (mesmo padrão de [[reference_n8n_api]]). Validado testando o token contra `graph.facebook.com/v18.0/me`.

**How to apply:** da próxima vez que o token do WhatsApp for rotacionado, **não confiar numa lista fixa de "nós que usam token"** — antes de dar como concluído, rodar `grep` pelo token antigo no JSON completo do workflow (`GET /api/v1/workflows/<id>`) e confirmar que zero ocorrências sobraram, em vez de atualizar só os nós "Enviar" que vêm à mente. Todo node HTTP Request que chama `graph.facebook.com` (enviar mensagem OU buscar/baixar mídia) usa o mesmo token.

## Central de Segurança — limpeza em 15/06/2026

**Business Manager:** JS Sistemas - suporte (business_id: `1639524370653689`)

- ✅ **Passkey:** habilitado no Facebook pessoal de Jonas (Android) em 15/06/2026 — alerta sumiu imediatamente
- ✅ **Conta de anúncios:** configurado Proteção padrão + Jonas Eduardo Scheibe como aprovador (conta "unknown Read-Only") — alterações salvas com confirmação da Meta, alerta pode demorar para sumir (não é bloqueante)
- ✅ **Verificação da empresa:** **APROVADA** — confirmado em 06/07/2026 na Central de Segurança do Meta BM, status "Verificada" (verificada originalmente em 26/06/2026, após resubmissão com Cartão CNPJ 40.827.286/0001-06). Caminho livre para criar o System User e gerar o token permanente (ver passo a passo acima).

Relacionado: [[project-whatsapp-cloud-strategy]]
