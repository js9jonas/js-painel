#!/usr/bin/env python3
"""
Proxy HTTP para UNITV — usa curl_cffi (TLS Chrome120) para passar Cloudflare.
Chamado pelo adapter unitv.ts via child_process.

Stdin: JSON { action, token, cfClearance, body }
Stdout: JSON { ok, data } | { ok: false, error }
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
        print(json.dumps({"ok": False, "error": "curl_cffi não instalado. Execute: pip3 install curl-cffi"}))
        sys.exit(1)

    token = req["token"]
    cf_clearance = req["cfClearance"]
    action = req["action"]  # "account" | "account/renew"
    body = req["body"]      # hex string já criptografado

    url = f"https://panel-web.starhome.vip/api/{action}"
    headers = {
        "content-type": "application/json;charset=UTF-8",
        "authorization": token,
        "token": token,
        "version": "1.0.2",
        "content": "h5_dealer",
        "Cookie": f"cf_clearance={cf_clearance}",
        "Origin": "https://panel-web.starhome.vip",
        "Referer": "https://panel-web.starhome.vip/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    try:
        resp = cffi_req.post(url, headers=headers, data=body, impersonate="chrome120", timeout=30)
        if resp.status_code != 200:
            print(json.dumps({"ok": False, "error": f"HTTP {resp.status_code}", "body": resp.text[:200]}))
            sys.exit(1)
        result = resp.json()
        print(json.dumps({"ok": True, "data": result.get("data", ""), "returnCode": result.get("returnCode", -1)}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
