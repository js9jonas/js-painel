
## 13/10/2026 — limite de login no site do cliente (`106e45f`)
O site do cliente (Fun/Lazer/Core) recusa logins seguidos do mesmo aparelho: o 2º `login_by_mac` em ~1,5 s volta
**429 com corpo "404"**, e o bloqueio passou de 2 min (liberou antes de 8 min). O olho fazia 1 login por ação
(abrir/apagar/reabrir) e mostrava "não aceitou MAC + chave". Agora `entrarComoAparelho` guarda o token 10 min em
memória (o token não tem `exp`) e o 429 vira "muitas tentativas seguidas". Mesmo commit: o "+" de lista em
/clientes/[id] oferece as contas do cliente (preenche nome do painel + M3U).
