---
name: project-club-token-expiry
description: "CLUB (pdcapi.io) — auto-relogin implementado em 16/06/2026; bug do falso \"Renovado\" corrigido"
metadata: 
  node_type: memory
  type: project
  originSessionId: 67eda1e1-deeb-4b34-bb29-1002b18a8be9
---

## Status atual (16/06/2026) — resolvido

O CLUB era o único adapter sem reconexão automática: `getSession()` apenas lançava erro pedindo clique manual em "Renovar Sessão", e o token salvo tinha `session_expiry = NULL`, então o código confiava nele para sempre — mesmo com a sessão morta no servidor (`pdcapi.io` responde HTTP 200 com `{"result":false,"msg":"A sessão está expirada"}`, um falso-positivo de status HTTP).

Sintoma relatado por Jonas: card mostrava "Conectado", botão "Renovar via API" na página Alertas mostrava "Renovado", mas nada acontecia de fato no painel.

**Causa raiz dupla:**
1. `club.ts` não detectava `result:false` no corpo da resposta (só status HTTP) e não relogava automaticamente.
2. A rota `/api/paineis/servidores/[id]/renovar` ignorava `resultado.ok`/`resultado.erro` do adapter e sempre retornava sucesso genérico.

**Fix aplicado** (commit `db2e1cb`, ver [[reference_adapters_paineis_iptv]]):
- `club.ts` agora implementa o padrão `withRelogin` (mesmo já usado em `now.ts`): detecta sessão expirada pelo corpo da resposta, faz login automático via CapSolver e tenta de novo.
- Rota `renovar` agora verifica `resultado.ok` antes de reportar sucesso.

**Testado de ponta a ponta em 16/06/2026** com 3 contas reais (marcelohm, silvsmg3, letman): sessão estava morta → relogou sozinho via 2captcha (~7min) → renovou de fato. Confirmado por chamada direta e independente à API do CLUB (fora do js-painel): `exp_date` = 16/07/2026 23:59:59 BRT para os 3.

**Não é mais necessário** medir manualmente a duração do token — o sistema se autocorrige a cada chamada, independente do que o `session_expiry` do banco diz.

**17/06/2026 — migrado de 2captcha para CapSolver** (`HCaptchaTaskProxyLess`): resolução em ~3-10s vs minutos com workers humanos do 2captcha. Lógica de 10 retries removida — CapSolver usa IA e retorna `failed` direto.
