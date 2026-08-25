---
name: reference-funplays-api
description: "FunPlays reseller panel — endpoints, auth, estrutura de device e quirks para construção do adapter"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9efa3712-5c7a-4fe4-90b9-7e22e3f7fc21
  modified: 2026-08-24T01:32:39.628Z
---

# FunPlays — API Reseller

**Painel:** https://reseller.funplays.app  
**API base:** `https://api.funplays.app`  
**Credenciais:** ver `/home/jonas/Documentos/iptv-keepalive.user.js` ou gerenciador de senhas (não fica na memória)  
**Versão app:** Referral/Reseller v1.0.43

## Autenticação

**Login:** `POST /reseller/login`  
Body: `{ email, password, token }` — `token` é o reCAPTCHA Enterprise  
Response: `{ error: false, message: "JWT_STRING", status: 200 }` — token direto em `message`

**Header em requests autenticados:** `authorization: {JWT}` (sem "Bearer")  
**Expiração do JWT:** ~1 hora (campo `exp` no payload)  
**Quirk reCAPTCHA:** o site exibe "excedendo a cota gratuita do reCAPTCHA Enterprise" — na prática o challenge passou sem validação real. Testar login com token vazio antes de integrar CapSolver.

## Endpoints principais

| Método | Endpoint | Uso |
|--------|----------|-----|
| GET | `/reseller` | Info do reseller + créditos (`total_activations`, `registration_number`) |
| GET | `/reseller/dashboard` | Stats: `{ activated.activation_count, activation.spend_month, ... }` |
| GET | `/reseller/devices` | Lista devices paginada |
| GET | `/reseller/packages` | Lista pacotes disponíveis |
| POST | `/reseller/activate` | Ativa / renova device (novo E existente) |
| PUT | `/reseller/device/comment` | Edita comentário/nome do device |
| DELETE | `/reseller/devices` | Remove device (body: `{ id }`) |
| GET | `/reseller/activations/device` | Histórico de ativações de um device |

## GET /reseller/devices — query params

```
?limit=10&pagination=1&page=1&sort=["id","DESC"]
```

Suporta filtro por MAC (`mac`) e comment (`comment`) via parâmetros.  
Response: `{ count: 803, rows: [...], pageCount: 81, currentPage: 1, limit: 10 }`

## Estrutura de um device

```json
{
  "id": 1761722,
  "mac": "86:47:0b:94:57:22",
  "model": "android",
  "ip": "...",
  "online": false,
  "payed": true,
  "activation_expired": "2027-06-12T14:52:03.000Z",
  "package_id": 1,
  "key": "635191",
  "auth_type": "device_key",
  "country": "Brazil",
  "app_version": "1.0.47",
  "device_note": {
    "id": 17477,
    "device_id": 1761722,
    "comment": "Carlinhos Roberto Koch"
  }
}
```

- `activation_expired` = data de vencimento da assinatura
- `device_note.comment` = nome do cliente (campo editável)
- `id` = usado em PUT comment e DELETE

## POST /reseller/activate — body

```json
{ "mac": "xx:xx:xx:xx:xx:xx", "package_id": 1, "comment": "Nome opcional" }
```

- Mesmo endpoint para nova ativação e renovação de device existente
- Pacote único disponível: `id: 1`, nome "Anual", 1 crédito, duração 1 ano

## PUT /reseller/device/comment — body

```json
{ "id": 1761722, "comment": "Novo nome" }
```

## Pacotes — GET /reseller/packages

```json
{
  "id": 1,
  "name": "Anual",
  "price": 25,
  "schedule": "year",
  "activation_needed": 1,
  "for_reseller": true
}
```

## Créditos — GET /reseller

```json
{
  "reseller": {
    "total_activations": 92,
    "id": 74,
    "name": "JONAS",
    "surname": "SCHEIBE"
  }
}
```

`total_activations` = créditos disponíveis (não é histórico — é saldo atual).

## Observações para o adapter

- Token expira em 1h → implementar relogin automático com detecção de 401
- reCAPTCHA: testar token vazio primeiro; fallback = CapSolver (já adquirido)
- Busca por MAC: usar query param `?mac=xx:xx:xx:xx:xx:xx` no GET /reseller/devices
- `getCreditos()` → `GET /reseller` → `message.reseller.total_activations`
- Identificador único do device para operações: campo `id` (numérico), não o MAC
