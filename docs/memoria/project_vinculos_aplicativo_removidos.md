---
name: project_vinculos_aplicativo_removidos
description: Área "Vínculos" (id_assinatura/id_conta/id_dispositivo) removida dos formulários de aplicativo; aviso "Apps vinculados a esta conta" passou a ler das playlists (28/09/2026)
metadata:
  type: project
---

**Achado (28/09/2026):** as colunas `aplicativos.id_assinatura`, `id_conta` e `id_dispositivo` estavam praticamente vazias (0, 2 e 0 de 3.164 linhas) — só eram gravadas à mão pela área "Vínculos (opcional)" do `AplicativoModal` e dos 2 formulários do `BuscaMacClient`. O vínculo real app↔conta fica em **`aplicativo_playlists.id_conta`** (sync dos painéis: 683 playlists ligam 673 apps a 610 contas).

**Consequência que existia:** o aviso amarelo "Apps vinculados a esta conta — se alterar usuário/senha, atualize também nos apps" (`EditarContaModal`) lia `aplicativos.id_conta` → só aparecia pra 2 contas.

**Feito:**
- Área "Vínculos" removida dos 3 formulários; `createAplicativo`/`updateAplicativo` não gravam mais essas colunas.
- Os 2 `id_conta` manuais (apps 2721 e 2688, sem playlist) **limpos a pedido do Jonas** ("não tem relação prática útil") → as 3 colunas ficaram 100% vazias. Colunas mantidas na tabela (sem DROP).
- `src/lib/apps-vinculados.ts` (`appsPorConta`, sem banco) monta id_conta → apps a partir das playlists; usado na página do cliente (convertido pra `Record`, Map não serializa pro client component) e no `/chat`. Testado com dados reais (ex.: cliente 1383 Bruna Goncalves Santos, 4 contas Uniplay, cada uma com seu Lazer Play).
