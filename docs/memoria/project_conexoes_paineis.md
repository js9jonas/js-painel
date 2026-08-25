---
name: project-conexoes-paineis
description: "Página \"Conexões\" no js-painel para gerenciar painéis IPTV via API direta — cadastro, cards com status e automações de renovação/criação de contas"
metadata: 
  node_type: memory
  type: project
  originSessionId: 585fbbab-4288-4e88-a383-df3c91934414
  modified: 2026-08-24T01:29:37.648Z
---

# Página Conexões — js-painel

## Visão geral
Implementar uma página "Conexões" no js-painel que centraliza o acesso e controle dos painéis IPTV externos via API direta (sem browser), com cadastro de credenciais e dashboard de status em tempo real.

**Why:** Permite executar ações nos painéis (renovar, criar conta, consultar status) de dentro do js-painel, como se fosse feito manualmente — mas automatizado via backend Next.js.

**How to apply:** Começar pelos painéis com API conhecida (Abordagem 1). Painéis sem API mapeada ficam para fase 2 com Playwright.

---

## Fase 1 — Painéis com API conhecida (prioridade)

| Painel | API base | Auth | Observações |
|---|---|---|---|
| FunPlays | `https://api.funplays.app` | JWT + reCAPTCHA via 2captcha | `POST /reseller/login` |
| LazerPlay | `https://api.appacesso.com` | JWT + reCAPTCHA via 2captcha | `POST /reseller/login` |
| SearchDefense | `https://gesapioffice.com` | JWT sem captcha | `POST /api/login` |
| painel.fun | `https://api.controle.fit` | JWT + Turnstile via 2captcha | `POST /api/auth/sign-in` |

## Fase 2 — Playwright headless (futuro)
RevendaWatch, Ibosol, SmartOne, PainelCliente, DashboardBZ

---

## Estrutura da página "Conexões"

### Cadastro de painel (tabela `painel_conexoes` ou similar)
Campos necessários por painel:
- `nome` — identificador amigável
- `tipo` — enum (funplays, lazerplay, searchdefense, painelfun, ...)
- `usuario` / `senha` — credenciais de acesso
- `api_url` — endpoint base
- `ativo` — boolean

### Cards de status (atualização periódica ou sob demanda)
Informações a exibir quando disponíveis:
- Créditos disponíveis
- Número de contas/devices cadastrados
- Contas ativas / online agora
- Status da conexão (autenticado / sessão expirada / erro)
- Última sincronização

### Ações por card
- Renovar assinatura (passar MAC/ID do cliente)
- Criar conta nova
- Consultar device por MAC
- Forçar re-autenticação

---

## Arquitetura backend

```
/api/conexoes/[tipo]/status     → GET — retorna créditos, totais, online
/api/conexoes/[tipo]/renovar    → POST — renova assinatura de um device
/api/conexoes/[tipo]/criar      → POST — cria nova conta
```

Cada handler:
1. Lê credenciais do banco (tabela `painel_conexoes`)
2. Autentica na API do painel (JWT cacheado no banco ou Redis)
3. Faz a chamada específica
4. Retorna resultado padronizado

### Captcha no backend
Para FunPlays/LazerPlay (reCAPTCHA) e painel.fun (Turnstile): usar 2captcha via `GM_xmlhttpRequest` → no backend usar `fetch` normal com a API key (ver [[reference-ferramentas-adquiridas]], não fica na memória).

---

## Referências
- Credenciais e endpoints já mapeados no Tampermonkey: `/home/jonas/Documentos/iptv-keepalive.user.js`
- Adapters existentes no js-painel: [[iptv_panel_adapters]]
- Vínculo assinaturas × painéis: [[project_vinculo_assinaturas_paineis]]
