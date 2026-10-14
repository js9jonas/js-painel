# Registro de tokens de painel (`painel_sessao_log`) — 14/10/2026

**Por quê:** a IBOSOL (IBO Player) não informa a validade do token; guardamos login + 12 h (palpite) e ela derrubou
token antes disso, deixando o card de /conexoes em "Sem conexão". Jonas pediu pra registrar a hora em que o login cai,
e depois pra usar a mesma tabela pra **todos** os tokens.

**Como funciona** (`sql/022_painel_sessao_log.sql`, aplicada em 14/10):
- Gatilho `tg_painel_sessao_log` em `painel_servidores` e `servidores`: token novo gravado → linha com `login_em` e
  `expira_previsto`; token trocado → `substituido_em` na linha antiga. Pega toda rota que grava sessão (~15 lugares).
  Erro no gatilho só vira WARNING, nunca impede gravar a sessão.
- Código (`src/lib/painel-sessao-log.ts`): `ultimo_ok_em` (máx. 1x/min, trava em memória) e `recusado_em` + `chamada_recusada`
  na 1ª recusa. Só faz UPDATE (token que nunca foi pro banco não vira linha). Ligado em 14/10 em: IBOSOL, FunPlays/LazerPlay/CorePlayer
  (appacesso: 401 **ou** HTTP 200 com "jwt …" no corpo), CLUB, Central (menos `sessao_nao_renderizada`, que não é token morto),
  LIEBE, NOW (resposta HTML = login), SmartOne, UniPlay e UniTV (esses dois gravam a sessão como JSON: o md5 é do JSON).
  Fora: IBO Pro (JWT traz a validade), FAST/NATV (chave fixa, sem sessão), Clouddy e sites do cliente (sessão por aparelho).
- Testado 14/10: uso aceito registrado nos 10 painéis com sessão; recusa testada com token falso na IBOSOL e no FunPlays.
- Só o md5 do token fica gravado. Tokens que já existiam entraram sem `login_em`.

**Ler:** a queda foi entre `ultimo_ok_em` e `recusado_em`. Se `recusado_em` vem logo depois de outro `login_em` do mesmo
painel, a causa provável é sessão única (o login novo derrubou o velho), não validade.
```sql
SELECT tipo, login_em, expira_previsto, ultimo_ok_em, recusado_em, substituido_em,
       ultimo_ok_em - login_em AS durou_no_minimo, recusado_em - login_em AS durou_no_maximo
  FROM public.painel_sessao_log WHERE tipo = 'iboplayer' ORDER BY login_em DESC NULLS LAST;
```
✅ Achado no 1º dia, corrigido 14/10: SmartOne gravou 3 logins em 70 ms (06:50:49) — card, sync, listas e Alertas
chamavam `loginSmartOne` cada um por si. Agora `loginSmartOne` divide o login por e-mail (em andamento ou feito há < 1 min
→ mesmo resultado; falha não fica guardada). Testado: 4 pedidos simultâneos por 2 caminhos = 1 login.

📋 Conferir em alguns dias e ajustar as 12 h do `loginIbosol`. Pra outros painéis ganharem recusa exata, ligar o gancho no detector de 401 de cada adapter.
