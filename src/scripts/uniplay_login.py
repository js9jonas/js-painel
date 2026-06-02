#!/usr/bin/env python3
"""
Login no UNIPLAY (gesapioffice.com) usando curl_cffi com TLS Chrome120.
Testa se o IP da VPS passa quando o fingerprint é de browser real.

Stdin:  JSON { usuario, senha }
Stdout: JSON { ok, token, cryptPass } | { ok: false, error }
"""
import sys, json

def main():
    try:
        req = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"stdin parse error: {e}"}))
        sys.exit(1)

    try:
        from curl_cffi import requests as cffi_req
    except ImportError:
        print(json.dumps({"ok": False, "error": "curl_cffi não instalado"}))
        sys.exit(1)

    usuario = req.get("usuario", "")
    senha   = req.get("senha", "")

    try:
        session = cffi_req.Session(impersonate="chrome120")
        resp = session.post(
            "https://gesapioffice.com/api/login",
            json={"username": usuario, "password": senha, "code": ""},
            headers={
                "Content-Type": "application/json",
                "Accept":       "application/json, text/plain, */*",
                "Origin":       "http://searchdefense.top",
                "Referer":      "http://searchdefense.top/",
            },
            timeout=15,
        )
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"request error: {e}"}))
        sys.exit(1)

    if resp.status_code != 200:
        print(json.dumps({"ok": False, "error": f"login falhou: {resp.status_code}", "body": resp.text[:300]}))
        sys.exit(1)

    try:
        data = resp.json()
    except Exception:
        print(json.dumps({"ok": False, "error": "resposta não é JSON", "body": resp.text[:300]}))
        sys.exit(1)

    token      = data.get("access_token")
    crypt_pass = data.get("crypt_pass")

    if not token:
        print(json.dumps({"ok": False, "error": "access_token ausente", "data": data}))
        sys.exit(1)

    print(json.dumps({"ok": True, "token": token, "cryptPass": crypt_pass}))

main()
