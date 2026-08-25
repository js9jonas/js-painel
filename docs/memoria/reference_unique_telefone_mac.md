---
name: reference-unique-telefone-mac
description: "10/08/2026 — constraints unique aplicadas em contatos.telefone (global) e aplicativos.mac (por id_app), pra bloquear duplicatas de cliente/device na raiz"
metadata:
  node_type: memory
  type: reference
  originSessionId: a645fbb3-2e21-41b1-b1e3-75422bf81af9
  modified: 2026-08-10T19:34:51.969Z
---

## Contexto

Depois de um levantamento geral de pendências (10/08/2026), Jonas pediu pra fechar de vez a brecha que já causou duplicatas de cliente por telefone repetidas vezes (Neuzely/Mauro 02/08, Valdemar/Mauro 10/08 — ver [[reference_merge_clientes]]) e o mesmo tipo de proteção pro MAC de aplicativos.

## `contatos.telefone` — único global

`ux_contatos_telefone_global ON contatos(telefone) WHERE telefone IS NOT NULL AND telefone <> '0000000000'`. Telefone identifica uma **pessoa/família**, então faz sentido ser único em toda a base — só o placeholder `0000000000` (~16 clientes sem telefone real) fica de fora.

Antes de aplicar, achada e resolvida 1 duplicata real: Valdemar Primaz (2117, assinatura inativa desde 2024) mesclado em Mauro Zimmer (2776, assinatura ativa), mesmo telefone — procedimento padrão de merge, ver [[reference_merge_clientes]].

## `aplicativos.mac` — único por `(mac, id_app)`, não global

`ux_aplicativos_mac_app ON aplicativos(mac, id_app) WHERE mac IS NOT NULL AND removido_em IS NULL`.

**Por que não é global feito o telefone:** um MAC identifica um **device físico**, e é normal o mesmo device ter 2+ apps instalados (ex: FunPlay + LazerPlay no mesmo box Android) — cada app vira uma linha própria em `aplicativos` com o mesmo MAC. Travar por MAC sozinho quebraria esse caso legítimo (13 dos 16 MACs duplicados encontrados eram exatamente isso). Escopo por `id_app` resolve: mesmo MAC só não pode repetir **dentro do mesmo app**.

**Por que exclui `removido_em`:** o app recria a linha em renovação em vez de editar a existente (ver `sync-aplicativos/route.ts`) — sem essa exclusão, toda renovação normal quebraria a constraint.

**3 conflitos reais encontrados e resolvidos antes de aplicar:** sempre o mesmo padrão — 1 linha **sem `id_cliente`** (órfã de sincronização automática, nunca reclamada por ninguém) colidindo com 1 linha de cliente real no mesmo MAC+app. Resolvido com soft-delete (`removido_em = NOW()`) nas 3 órfãs, confirmado antes com Jonas (recomendação aceita). Um dos 3 casos tinha evidência forte (mesma `chave`/licença + uma observação antiga do próprio Jonas notando estranheza no código do device); os outros 2 tinham `chave` diferente mas mesmo padrão estrutural (órfã vs. cliente real), tratados igual por recomendação.

## Código alterado (ambas constraints, mesmo padrão)

- Pré-check antes do INSERT/UPDATE (não só depender do erro cru 23505): `buscarDonoDoTelefone()`/`erroTelefoneDuplicado()` em `src/lib/contatos.ts`; `buscarDonoDoMac()`/`erroMacDuplicado()` em `src/lib/aplicativos.ts`. Mensagem nomeia o cliente dono (ou avisa que é registro órfão sem cliente, no caso do MAC).
- **Lição que se repetiu nos dois casos:** vários componentes React tinham `catch { setError("mensagem genérica") }` **sem capturar o `err`** — a mensagem específica do pré-check nunca chegava na tela, mesmo com a Server Action lançando o erro certo. Corrigido em `ContatosManager.tsx`, `EditClienteModal.tsx`, `AplicativoModal.tsx`, `BuscaMacClient.tsx` (2 modais) — trocar `catch { ... }` por `catch (err: any) { setError(err?.message ?? "...") }`. **Ao adicionar qualquer nova validação server-side que lança erro custom, sempre conferir se o componente que chama a Server Action realmente repassa `err.message` pro usuário — não presumir que o `catch` existente já faz isso.**
- Pontos de escrita que ficam de fora **de propósito** (reatribuição intencional de dono, não duplicata): `contatos.ts::vincularContatoNoChat`. `sync-aplicativos/route.ts` não precisou de mudança nenhuma — já fazia find-then-branch (SELECT antes de decidir INSERT/UPDATE), imune por desenho.

## Se a constraint disparar no futuro

Não é bug — é o comportamento pretendido. Confirmar com Jonas se é duplicata real (mesma pessoa/device) antes de qualquer ação:
- Telefone: seguir o procedimento de merge de cliente ([[reference_merge_clientes]]).
- MAC: se um dos dois for órfão (`id_cliente IS NULL`), provavelmente pode só soft-deletar a órfã: mas não presumir, confirmar (viu diferença de `chave` em 2 dos 3 casos aqui, sem 100% de certeza de que era o mesmo device físico).

Ver também [[project_merge_telefones_duplicados]] (marcado resolvido a partir desta constraint).
