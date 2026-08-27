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

**⚠️ Revertido de volta pra 2captcha depois disso** (ver comentário no topo de `club.ts`: "CapSolver testado e não resolveu este challenge") — o código atual usa `TWOCAPTCHA_API_KEY` de novo, com até 10 tentativas. Não achamos registro exato de quando/por quê reverteu; se for investigar CapSolver de novo no futuro, checar se o challenge do CLUB mudou desde 17/06.

## 27/08/2026 — duração real da sessão corrigida (~1h, não 7 dias) + renovação preventiva (cron)

O comentário `Auth: X-ACCESS-TOKEN (~7 dias)` no topo de `club.ts` estava **errado** — Jonas confirmou por uso real que a sessão dura **~1h ou menos**. Isso não invalida a captura do `exp` real do JWT (`parseJwtExpiry()` sempre leu o valor verdadeiro devolvido pelo servidor, então `session_expiry` no banco já era preciso), só a suposição documentada estava desatualizada.

Isso explicava por que, mesmo com o auto-relogin **reativo** de 16/06 (`withRelogin`) funcionando, Jonas ainda precisava ir manualmente no card em `/conexoes` "de tempos em tempos": o relogin só dispara **depois** que uma operação real bate numa sessão morta, e falha essa primeira tentativa na hora (pede pra "aguardar e tentar de novo") — com sessão de ~1h, isso acontecia várias vezes ao longo do expediente.

**Fix aplicado:**
- `src/lib/club-keepalive.ts` + `src/instrumentation.ts`: cron interno (roda no próprio processo Next.js via `setInterval`, checagem a cada 10min) que renova a sessão CLUB preventivamente quando faltar menos de 20min pra expirar — nunca deixa a sessão morrer durante o uso.
- `dispararLoginClub()` (exportada de `club.ts`) virou o único ponto de login, compartilhado entre o cron, o botão manual "Renovar Sessão" (`renovar-sessao/route.ts`) e o relogin reativo (`withRelogin`) — dedup via `loginEmProgresso`, nunca resolve 2 hCaptchas em paralelo pro mesmo painel.
- **Bug relacionado corrigido na mesma leva**: `migrarContaPainel()` (`src/lib/migrar-painel.ts`) excluía a conta no painel de origem (CLUB) antes de confirmar que o painel de **destino** também tinha sessão ativa — se o destino estivesse com sessão morta, a criação falhava depois da exclusão já ter acontecido, deixando a conta órfã (relatado por Jonas como incidente real já ocorrido, engatilhado pela renovação automática de assinatura via `migrar_para_id`, ver [[project_club_migracao_painel]]). Agora `migrarContaPainel()` verifica sessão ativa (`session_cookie` + `session_expiry` com margem de 5min) dos dois painéis CLUB **antes** do ponto de não-retorno, abortando sem tocar em nada se qualquer um dos dois não estiver pronto.
