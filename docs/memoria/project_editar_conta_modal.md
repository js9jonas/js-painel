---
name: project-editar-conta-modal
description: "Modal de edição de conta em clientes/[id] — implementado 18/06/2026 — campos desabilitados por tipo de painel"
metadata: 
  node_type: memory
  type: project
  originSessionId: e60fb6e2-3ae9-4bad-8761-69389e49d32e
---

## ✅ Implementado — 18/06/2026

### Arquivos
- `src/components/clientes/EditarContaButton.tsx` — ícone lápis em cada balão, abre modal
- `src/app/api/paineis/servidores/[id]/editar-conta/route.ts` — POST: chama adapter, atualiza banco
- `src/components/clientes/ContasGroupClient.tsx` — recebe `appsVinculados` Map, renderiza botão
- `src/app/(dashboard)/clientes/[id]/page.tsx` — constrói `appsPorConta` Map e passa ao componente

### Capabilities por tipo de painel (CAPS map no EditarContaButton)

| Tipo | Usuário | Senha |
|------|---------|-------|
| club, central, liebe | ✅ | ✅ |
| fast, now | ❌ | ✅ |
| uniplay, unitv | ❌ | ❌ |
| demais (funplays, lazerplay…) | ❌ | ❌ |

Rótulo é sempre editável (campo local — nunca vai ao adapter).

### Regra de consistência da API route
- **Apenas rótulo mudou** → atualiza `contas.rotulo` diretamente, sem chamar adapter
- **Senha ou usuário mudaram** → adapter chamado PRIMEIRO; se painel rejeitar → HTTP 422, banco NÃO é alterado
- **Painel aceita** → banco atualizado com todos os campos alterados

### Alerta de apps vinculados
`appsPorConta = Map<id_conta, [{id_app_registro, nome_app}]>` construído na page a partir dos `aplicativos` do cliente. Passado ao `ContasGroupClient` → `EditarContaButton`. Exibe bloco âmbar quando `appsVinculados.length > 0`.

### Falso positivo corrigido — NOW
`now.ts editarConta`: após checar `LimparScript` (sessão ativa), verifica também `text.toLowerCase().includes("sucesso")`. Extrai mensagem `<p>` do HTML se houver erro.
