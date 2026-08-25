---
name: project-jspainel-roles
description: "Usuários do js-painel, roles e páginas que basico acessa mas não deveria (pendente de restrição)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 72536f4a-5593-446c-896d-bc089f992a7f
---

## Usuários cadastrados (tabela `public.users`)

| email | role |
|---|---|
| js9jonas@gmail.com | admin |
| alanadullius7@gmail.com | basico |

Adicionado em 08/06/2026.

## Como adicionar novo usuário

```sql
INSERT INTO public.users (id, email, role)
VALUES (gen_random_uuid()::text, 'email@gmail.com', 'basico');
```

## Páginas restritas hoje (apenas admin)

- `/agente` — verificação em `src/app/(dashboard)/agente/page.tsx`
- `POST /api/agent/chat` e rotas `/api/agent/learnings/*` — retornam 403

## ✅ 13/07/2026 — 4 páginas restritas a admin (commit `30ba59c`)

Padrão usado: inline `auth()` + `redirect("/dashboard")` (igual à página `/agente`), **não** o helper `requireAdmin()` de `src/lib/checkRole.ts` — esse helper *lança erro* em vez de redirecionar, o que resultaria numa página de erro feia em vez de um redirect limpo pro dashboard.

## ↩️ 13/07/2026 (mesmo dia, mais tarde) — 3 delas liberadas de novo pro básico (commit `4eec978`)

A pedido do Jonas, removida a restrição de `/conexoes`, `/conexoes/vinculacao` e `/servidores/vinculacao` — voltaram a ser acessíveis por qualquer usuário autenticado (admin ou básico), só com a camada de auth de base (`src/proxy.ts`, exige login mas não checa role).

**Estado atual (13/07/2026):**

| Página | Acesso | Arquivo |
|---|---|---|
| `/conexoes` | básico + admin | `src/app/(dashboard)/conexoes/page.tsx` |
| `/conexoes/vinculacao` | básico + admin | `src/app/(dashboard)/conexoes/vinculacao/page.tsx` |
| `/servidores/vinculacao` | básico + admin | `src/app/(dashboard)/servidores/vinculacao/page.tsx` |
| `/planos` | **só admin** (não foi revertida) | `src/app/(dashboard)/planos/page.tsx` |
| `/agente` | só admin | `src/app/(dashboard)/agente/page.tsx` |

⚠️ `/conexoes` exibe e permite editar credenciais dos painéis IPTV (usuário/senha/master) — usuário "básico" agora tem acesso a isso de novo, decisão consciente do Jonas.

## ⚠️ Pendências que ficaram de fora

1. **`/teste-listas`** (ferramenta de diagnóstico técnico) — continua sem restrição de role, nunca esteve.
2. **Nenhuma Server Action tem proteção de role** — `requireAdmin()` existe em `src/lib/checkRole.ts` mas nunca foi usado em lugar nenhum.
