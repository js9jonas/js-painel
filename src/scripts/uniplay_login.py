#!/usr/bin/env python3
"""
Login no UNIPLAY (gesapioffice.com) usando curl_cffi com TLS Chrome120.

Stdin:  JSON { usuario, senha }
Stdout: JSON { ok, token, cryptPass } | { ok: false, error }

Sempre sai com código 0 — o chamador verifica o campo "ok".
"""
import sys, json, os

# Pacotes instalados localmente via pip --target (preservados no container)
_pkg_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "python_packages")
if os.path.isdir(_pkg_dir) and _pkg_dir not in sys.path:
    sys.path.insert(0, _pkg_dir)

def main():
    try:
        raw = sys.stdin.read()
        req = json.loads(raw)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"stdin parse error: {e}"}), flush=True)
        sys.exit(0)

    try:
        from curl_cffi import requests as cffi_req
    except ImportError as e:
        print(json.dumps({"ok": False, "error": f"curl_cffi não instalado: {e}"}), flush=True)
        sys.exit(0)

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
        print(json.dumps({"ok": False, "error": f"request error: {e}"}), flush=True)
        sys.exit(0)

    if resp.status_code != 200:
        print(json.dumps({"ok": False, "error": f"login falhou: {resp.status_code}", "body": resp.text[:300]}), flush=True)
        sys.exit(0)

    try:
        data = resp.json()
    except Exception:
        print(json.dumps({"ok": False, "error": "resposta não é JSON", "body": resp.text[:300]}), flush=True)
        sys.exit(0)

    token      = data.get("access_token")
    crypt_pass = data.get("crypt_pass")

    if not token:
        print(json.dumps({"ok": False, "error": "access_token ausente", "data": data}), flush=True)
        sys.exit(0)

    print(json.dumps({"ok": True, "token": token, "cryptPass": crypt_pass}), flush=True)
    sys.exit(0)

main()
