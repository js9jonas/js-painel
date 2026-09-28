#!/usr/bin/env python3
"""Procura padrões de credencial em arquivos. Imprime só arquivo:linha:tipo (nunca o valor).
Uso: scan-segredos.py ARQ...   → exit 1 se achar algo.
Linha com o marcador `segredo-ok` é ignorada (falso positivo revisado)."""
import re, sys

PADROES = {
    "telegram-bot-token": r"\b\d{8,10}:[A-Za-z0-9_-]{35}\b",
    "github-token": r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})",
    "anthropic-key": r"sk-ant-[A-Za-z0-9_-]{20,}",
    "openai-key": r"\bsk-(proj-)?[A-Za-z0-9_-]{32,}",
    "aws-key": r"\bAKIA[0-9A-Z]{16}\b",
    "google-api-key": r"\bAIza[0-9A-Za-z_-]{35}\b",
    "google-oauth-secret": r"\bGOCSPX-[A-Za-z0-9_-]{20,}",
    "google-refresh-token": r"\b1//0[A-Za-z0-9_-]{40,}",
    "meta-token": r"\bEAA[A-Za-z0-9]{60,}",
    "slack-token": r"\bxox[abpr]-[A-Za-z0-9-]{10,}",
    "stripe-key": r"\b[sr]k_live_[A-Za-z0-9]{20,}",
    "private-key-block": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "string-hex-longa": r"['\"][a-f0-9]{32,}['\"]",
    "jwt": r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "url-com-senha": r"[a-z][a-z0-9+.-]*://[^\s:/@<>`]+:(?!\$\{|<|\*{3}|x{3}|\.\.\.)[^\s@/<>`]{6,}@",
    "atribuicao-senha": r"(?i)\b(password|passwd|senha|secret|api[_-]?key|token)\b\s*[:=]\s*['\"]?(?![<$*{])[A-Za-z0-9_\-+/=!@#%.]{16,}",
}
RX = {k: re.compile(v) for k, v in PADROES.items()}
IDENT = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$.]*[!?]?(\(|$)")

achados = 0
for caminho in sys.argv[1:]:
    try:
        linhas = open(caminho, encoding="utf-8", errors="ignore").read().splitlines()
    except (IsADirectoryError, FileNotFoundError):
        continue
    for n, linha in enumerate(linhas, 1):
        if "segredo-ok" in linha:
            continue
        for nome, rx in RX.items():
            m = rx.search(linha)
            if not m:
                continue
            if nome == "atribuicao-senha":
                # `token = process.env.X`, `senha: creds.painel_senha` etc. são código, não segredo
                resto = re.split(r"[:=]\s*", m.group(0), 1)[1]
                entre_aspas = resto[:1] in ("'", '"')
                if not entre_aspas and IDENT.match(resto) and not re.search(r"\d{4,}", resto):
                    continue
            print(f"{caminho}:{n}: {nome}")
            achados += 1
sys.exit(1 if achados else 0)
