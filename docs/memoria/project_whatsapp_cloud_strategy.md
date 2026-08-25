---
name: project-whatsapp-cloud-strategy
description: "Estratégia WhatsApp: dois números distintos, CoEx pós-aprovação, Chatwoot para atendimento mobile"
metadata: 
  node_type: memory
  type: project
  originSessionId: d15d4ede-b463-471e-8fee-99d14f894c14
---

## Dois números distintos

| Número | Uso | Canal |
|---|---|---|
| +55 51 8468-3468 | Principal — atendimento clientes IPTV | WhatsApp Business App |
| Número Cloud API | Automações, templates, js-painel | Cloud API oficial (WABA 934451958993756) |

Os dois são independentes — sem risco de conflito de sessão.

## CoEx — ✅ ATIVADO em 07/06/2026

**Número:** +55 51 8468-3468 — agora simultâneo no WA Business App e Cloud API.

**Resultado:**
```
+55 51 8468-3468
├── WhatsApp Business App → atendimento manual no celular
└── Cloud API → n8n, templates, js-painel
```

**Novo portfólio criado durante o CoEx:** "JS Sistemas - suporte"
- business_id: `1639524370653689`
- WABA ID: `265749013278174`
- Phone Number ID: `234653083067380`

**Verificação da empresa:** submetida em 07/06/2026 — em análise (~2 dias úteis). Quando aprovada, libera tiers maiores de mensagens.

**Abrir o WA Business App pelo menos 1x a cada 14 dias** para manter sincronização CoEx.

**Webhook subscriptions ativas:** `messages`, `account_alerts`, `account_update`, `phone_number_quality_update`, `message_template_status_update`

## Chatwoot para atendimento mobile

Quando precisar responder mensagens pelo celular via Cloud API oficial:
- **Chatwoot** — open source, app mobile iOS+Android, conecta nativamente na Cloud API
- Deploy via Easypanel (Docker) — requer ~2GB RAM dedicados
- Integra com n8n via webhooks
- js-painel continua para gestão de assinaturas; Chatwoot só para chat

## Status do número principal — 28/05/2026

- **+55 51 8468-3468** aparece como "Não verificado" no Gerenciador de Telefones da Cloud API
- **+55 51 3840-1560** está "Conectado", qualidade Alta — funcionando normalmente
- Ao tentar verificar o número principal, aparece modal "Número de telefone em uso" pedindo migração ou desconexão
- **Decisão tomada: não agir.** Aguardar App Review e ativar CoEx conforme plano

**Regra importante: não excluir o número do Business Manager antes do CoEx.**
O CoEx é uma migração ao vivo — requer que o número ainda esteja ativo no WhatsApp Business App. Excluir antes quebra o caminho do CoEx. Só excluir se a intenção for migração completa para Cloud API (sem CoEx), o que não é o caso.

## CoEx no número da API (+55 51 3840-1560)

Além do plano CoEx principal (migrar +55 51 8468-3468 para a API), o número atual da API (+55 51 3840-1560) também pode ser colocado em coexistência com o WhatsApp Business App — **sem depender do App Review**.

CoEx é feature oficial Meta (disponível desde 2025): mesmo número funciona simultaneamente no WB App e na Cloud API. Histórico de até 6 meses sincroniza na ativação. Grupos não sincronizam.

## Plano B — BSP se App Review não for aprovado

Se o App Review do jswhats falhar ou travar indefinidamente, usar um BSP como intermediário:

| BSP | Por quê | Onboarding |
|---|---|---|
| **360dialog** | API pura, baixo markup, integra com n8n via HTTP | 15 min–2h via Embedded Signup |
| **Wati** | Node nativo n8n, mais plug-and-play | 30 min–4h |

Com Business Manager já verificado, 360dialog pode estar operacional em menos de 2 horas — número novo registrado via Embedded Signup da Meta.

## Quality Rating — monitoramento

URL: **business.facebook.com/wa/manage/phone-numbers/**
- 🟢 Verde = saudável, pode subir tier
- 🟡 Amarelo = atenção, monitorar templates
- 🔴 Vermelho = risco de restrição, tier bloqueado

## WaSeller — desativado permanentemente

Extensão Chrome que adiciona automação ao WhatsApp Web. Desativada em 27/05/2026 após bloqueio do número. Violação dos termos Meta — nunca reativar. Automações devem ir via Cloud API + n8n.
