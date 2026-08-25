---
name: project-meta-app-review
description: "App Review Meta/Facebook para jswhats (ID 1060517628167041) — permissões WhatsApp Business API, status, requisitos e histórico de bloqueio"
metadata: 
  node_type: memory
  type: project
  originSessionId: d15d4ede-b463-471e-8fee-99d14f894c14
---

App Review submetido em 2026-04-27 para o app **jswhats** (ID: 1060517628167041).

**Why:** Necessário para usar a WhatsApp Cloud API em produção com envio de mensagens automáticas para os ~1.100 clientes IPTV. Também é pré-requisito para ativar CoEx e futuramente Tech Provider.

**How to apply:** Ao falar de integração WhatsApp, Cloud API, CoEx ou permissões Meta, referenciar este contexto.

## Credenciais Cloud API

- **WABA ID:** 934451958993756
- **Phone Number ID:** 1074696465724497
- **App ID:** 1060517628167041 (jswhats)
- **Business ID:** 1017814805598204

## Permissões solicitadas

- `whatsapp_business_messaging` — envio de notificações (vencimento, renovação, suporte)
- `whatsapp_business_management` — gerenciamento de ativos do Business (templates, QR codes, webhooks)

Ambas exigem **vídeo demonstrativo de uso** (já enviado em abr/2026).

## Status (jun/2026)

- App Review: ✅ **aprovado em 06/06/2026**
  - `whatsapp_business_messaging` → Approved
  - `whatsapp_business_management` → Approved
  - `public_profile` e `email` → Renewed
- Empresa verificada no Meta BM: ✅ desde 01/04/2026
- Nome do portfólio corrigido em 28/05/2026: "Test Business" → "JS Sistemas"

## Páginas públicas publicadas

- Política de privacidade: `https://painel.jssistemas.online/privacidade`
- Página institucional: `https://painel.jssistemas.online/sobre`
- Ambas liberadas em `src/proxy.ts` sem autenticação

## Templates ativos (28/05/2026)

| Nome | Categoria | Status |
|---|---|---|
| validade_plano | Utilidade | Ativo |
| vencido_plano | Utilidade | Ativo |
| lembrete_vencimento | Utilidade | Ativo |
| hello_world | Utilidade | Ativo |
| identificacao | Marketing | Submetido para análise |

Nenhum template original menciona "Jonas" ou "JS Sistemas" — o template `identificacao` foi criado exatamente para essa identificação em caso de número novo.

## Histórico de bloqueio (27/05/2026)

Número principal (+55 51 8468-3468) foi bloqueado temporariamente e restaurado no mesmo dia. WaSeller desativado permanentemente.

**Causa mais provável (análise 30/05/2026):** uso da **Evolution API** (baseada em Baileys), que substituiu a Z-API no envio da maioria das mensagens programadas. Motivos:
- Baileys tem fingerprint detectável pela Meta — alvo crescente de banimentos desde 2024
- Mudança brusca de padrão de envio (alto volume migrado para Evolution de uma vez)
- Evolution não tem os anos de calibragem anti-detecção da Z-API
- Z-API e WaSeller **não são parceiros oficiais Meta** — também são unofficial, mas com evasão mais refinada
- WaSeller (browser extension) pode ter contribuído, mas Evolution foi o trigger principal

**Regra derivada:** nunca usar Baileys/Evolution no mesmo número que usa Cloud API oficial. Ferramentas unofficial só em números isolados, se necessário.

## WABA é independente do App Review

O número (+55 51 3840-1560) vinculado à WABA pode ser usado normalmente enquanto o App Review está pendente. São camadas separadas:
- **App Review:** formaliza permissões avançadas para uso em escala/público
- **WABA ativa:** envia e recebe via API normalmente (tier atual)
- **Token de sistema:** continua válido independente do review

## Comportamento conservador durante o review (a partir de 30/05/2026)

- Usar apenas a Cloud API oficial no número +55 51 3840-1560 — zero ferramentas unofficial
- Templates Marketing evitar em volume; focar em Utility (vencimento, renovação)
- Não forçar o limite de tier diário — crescer organicamente
- Monitorar quality rating: business.facebook.com/wa/manage/phone-numbers/
- Manter Business Manager completo e sem ativos com restrição

## Responsável declarado na Meta

Jonas Eduardo Scheibe — JS Sistemas — Brazil
