---
name: incident-settings-local-json-malformado
description: ".claude/settings.local.json do js-painel estava com JSON invalido (faltava virgula) — as regras de permissao pra git merge/push na main nunca foram aplicadas, causando bloqueio do classificador sem motivo aparente"
metadata:
  node_type: memory
  type: project
  modified: 2026-08-26T17:30:00.000Z
---

# `.claude/settings.local.json` malformado bloqueava merge/push na `main`

Em 26/08/2026, tentei mergear uma feature branch na `main` e dar push, e o classificador de auto-mode do Claude Code bloqueou a ação (mensagem "Permission for this action was denied by the Claude Code auto mode classifier").

**Causa raiz:** `.claude/settings.local.json` já tinha as regras certas —

```json
{
  "permissions": {
    "allow": [
    "Bash(git merge --ff-only *)",
    "Bash(git push origin main)"
    "Bash(node -e *)"
    ]
  }
}
```

— mas faltava vírgula entre `"Bash(git push origin main)"` e `"Bash(node -e *)"`. JSON inválido = arquivo inteiro ignorado silenciosamente = nenhuma das 3 regras era aplicada, incluindo as que já existiam há tempo (não é algo que "mudou de repente"). O classificador caiu no comportamento padrão (bloquear escrita direta na branch default) por falta de override, não porque uma regra nova tenha sido negada.

**Fix:** adicionar a vírgula faltante. `python3 -c "import json; json.load(open(...))"` confirma se o arquivo é válido antes de assumir que uma regra "não pegou".

**Why importa:** o próprio Claude Code não avisa quando um `settings.local.json` está malformado — ele só silenciosamente não aplica nenhuma regra do arquivo. Sintoma enganoso: parece que a permissão nunca foi concedida, quando na verdade já tinha sido, só que quebrada.

**How to apply:** se uma ação de Bash for bloqueada pelo classificador mesmo parecendo "razoável" pra estar liberada, antes de assumir que precisa adicionar regra nova, **conferir se já existe uma regra pra isso em `.claude/settings.local.json`/`settings.json`** (local do projeto e global `~/.claude/settings.json`) e validar o JSON com `python3 -c "import json; json.load(open('caminho'))"` — pode já estar lá, só quebrado.
