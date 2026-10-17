---
name: incident-central-editar-conta-corpo-incompleto-17out2026
description: Editar conta da Central dava 400 "There was a problem querying the system database." — PUT /users/{id} ia só com username + notas; agora manda o corpo completo do formulário do painel.fun
metadata:
  type: project
  modified: 2026-10-17
---

**Sintoma (17/10/2026):** modal "Editar conta" de uma conta da Central (`williamlcasa`, id interno 226859308) → `controle.fit/users/226859308 → 400: {"message":"There was a problem querying the system database.","data":{}}`.

**Causa:** `editarConta` (`src/lib/painel-adapters/central.ts`) mandava só `username` + `reseller_notes` (+ `password` se mudou). Lendo o código do próprio site (bundle do painel.fun, formulário "Editar" e mutation `edit-users`), o corpo real é `{system, username, password, full_name, macaddr?, reseller_notes, bouquet, as_number}`, com `bouquet` = `JSON.parse(conta.packages)` e `as_number` zerado se tiver menos de 5 caracteres.

**Correção:** o adapter monta esse mesmo corpo com os valores atuais da conta (vindos da listagem `users?…`, que já traz tudo isso, senha inclusive) e só troca o que foi editado. Testado com edição neutra no `williamlcasa` (mesmos valores) → `ok`, conta conferida igual depois. Doc do endpoint em `reference_endpoints_paineis_iptv.md`.

✅ Em produção e testado pela tela em 17/10/2026: Jonas fez o deploy e refez a edição — funcionou.

**Detalhe:** o rótulo no js-painel é `reseller_notes || full_name`; a edição grava em `reseller_notes` (campo "Notas" do site) e não mexe em `full_name`.

**Lição:** mesmo padrão do FAST no mesmo dia (`incident_fast_editar_conta_senha_obrigatoria_17out2026`) — painel externo passou a recusar edição parcial; o caminho mais rápido foi ler o corpo que o próprio site envia (bundle JS público) em vez de chutar campos.
