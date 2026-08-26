---
name: reference-env-local-crlf
description: ".env.local do js-painel tem linhas com CRLF (\\r no fim) — quebra scripts que leem o valor via grep/cut direto do shell, mesmo funcionando normal no Next.js"
metadata:
  node_type: memory
  type: reference
  modified: 2026-08-26T17:15:00.000Z
---

# `.env.local` com CRLF — cuidado ao ler valores via shell

Pelo menos a linha `AUTH_SECRET=` do `.env.local` do js-painel termina em `\r\n` (CRLF), não só `\n`. Confirmado com `cat -A`:

```
AUTH_SECRET=a00d371d...a006a7^M$
```

**Why importa:** o Next.js (via dotenv) limpa o `\r` ao carregar a env var, então `process.env.AUTH_SECRET` dentro da aplicação está limpo — nada quebra em produção/dev normal. Mas se algum script/shell ler o valor direto do arquivo com `grep '^AUTH_SECRET=' .env.local | cut -d= -f2-`, o `\r` vai junto no valor capturado. Isso deu erro real ao [[reference-teste-nextauth-local]]: mintar um cookie de sessão com esse secret "sujo" gerava um token que o servidor (com o secret limpo) não conseguia decodificar — a resposta vinha com redirect silencioso pro `/login` e `set-cookie: authjs.session-token=; Max-Age=0`, sem nenhuma mensagem de erro óbvia.

**How to apply:** sempre que ler qualquer valor do `.env.local` (deste projeto ou outros com o mesmo padrão) via shell pra usar em outro processo/script (mintar token, montar `DATABASE_URL` manualmente, etc.), sanitizar com `tr -d '\r\n'`:

```bash
AUTH_SECRET=$(grep '^AUTH_SECRET=' .env.local | cut -d= -f2- | tr -d '\r\n')
```

Não veio a calhar tentar rodar `dos2unix .env.local` no arquivo real — é local, gitignored, e mexer nele à toa é desnecessário; a mitigação é só sanitizar na leitura. Se aparecer o mesmo sintoma (auth "falha silenciosamente", cookie sempre resetado) em outro projeto irmão (js-financeiro, js-oficina, js-comunidade, js-gestor), suspeitar do mesmo padrão primeiro.
