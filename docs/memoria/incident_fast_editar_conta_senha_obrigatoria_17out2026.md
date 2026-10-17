---
name: incident-fast-editar-conta-senha-obrigatoria-17out2026
description: Editar conta FAST (rótulo) dava "informações inválidas" — a API update_client passou a exigir password em toda chamada; corrigido em 1e1d6c9 lendo a senha atual via get_client
metadata:
  type: project
  modified: 2026-10-17
---

**Sintoma (17/10/2026):** modal "Editar conta" em /clientes/[id] → Assinaturas, conta FAST `ete21786` (Marta Rodrigues), trocando só o rótulo → "informações inválidas". A mensagem vem da própria API da FAST (`mens`), não do js-painel.

**Causa:** `editarConta` (`src/lib/painel-adapters/fast.ts`) mandava `password` só quando a senha mudava. A FAST passou a exigir `password` em todo `update_client`. Testado direto na API:
- só `notes` → `informações inválidas`
- `password` + `notes` com valores iguais aos atuais → `algo ocorreu fora do esperado, COD: 1002` (= nada mudou, não é falta de campo)
- `password` + `notes` novo → sucesso; `idbouquet` é opcional (a FAST mantém os bouquets)

**Correção (`1e1d6c9`, main):** lê a conta com `get_client`, completa `password` com a senha atual quando não há senha nova, e não chama `update_client` se senha e rótulo já estão iguais (evita o 1002). Doc do endpoint atualizada em `reference_endpoints_paineis_iptv.md`.

**Efeito colateral do teste:** uma chamada com `idbouquet` regravou os bouquets da conta de texto (`["1","2",…]`) para número (`[1,2,…]`), mesmos canais 1,2,3,4,7. O rótulo "Marta Rodrigues - Eduardo" já foi gravado na FAST pelo teste.

✅ Em produção e testado pela tela em 17/10/2026: Jonas fez o deploy e salvou de novo o modal da Marta — funcionou (rótulo atualizado no banco local).

**Lição:** erro de painel externo que surge do nada em ação que já funcionava → testar o endpoint direto variando um campo por vez; a API muda as regras sem aviso.
