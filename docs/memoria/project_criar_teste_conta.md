---
name: project-criar-teste-conta
description: "Feature 'Criar teste' no modal + Conta (clientes/[id]) — usa gerarTeste() dos adapters (nunca chamado antes), com correções específicas por painel descobertas via captura de payload real"
metadata: 
  node_type: memory
  type: project
  originSessionId: 59b55bef-a116-468e-b05a-79280534a2a4
---

## ✅ Concluído em 14/07/2026 — commit `79331df`

No modal "+ Conta" (`AdicionarContaModal.tsx`), além de buscar contas livres, agora dá pra criar uma conta de teste direto na API do painel escolhido, com "Nome do cliente - descrição" como rótulo. Usa `gerarTeste()` — método que já existia em 8 dos 13 adapters (`club, central, uniplay, now, unitv, liebe, natv, fast`) mas nunca tinha sido chamado em produção até essa feature.

**Schema**: novo campo `host_stream` em `painel_servidores` (domínio de streaming entregue ao cliente final, separado de `url_painel`/`url_api`) — não relacionado a `gerarTeste`, mas da mesma sessão de trabalho (feature do menu ⚙️/👤 no balão de contas, ver commits `8d6bd0a`/`8bae6c4`/`919d750`).

## Correções por painel (achadas testando manualmente, uma por uma)

- **Central**: campo `full_name` já existia no payload de criação (`trial_users`), só ia vazio (`""`) — corrigido pra receber o rótulo de verdade.
- **Club**: criação (`listas/teste`) não aceita rótulo nenhum — nem o site oficial oferece esse campo na tela de criar teste. Aplica via chamada extra de edição (`listas/{id}/editar`, campo `notas`) logo depois de criar. **Achado de bônus**: o `editarConta` existente usava nomes de campo errados (`username_edit`/`password_edit`/`reseller_notes`/`plano_novo_edit` — nenhum existe na API real) e mandava senha em branco quando só se editava rótulo, o que provavelmente **resetava a senha real da conta** silenciosamente há um tempo. Corrigido: nomes certos + busca a senha atual via `listas/{id}/info` antes de editar.
- **Liebe**: campo `name` no mesmo `POST /customers` de criação — só faltava mandar. Também: existe pacote de teste de **24h** disponível (confirmado via API real, `is_trial=YES`, `duration=24`), então o adapter passou a preferir 24h em vez do de 6h que pegava antes (primeiro item do array).
- **NATV**: `minutes` precisa ser **string** com valor de um enum exato (`"15"|"30"|"60"|"120"|"180"|"240"|"300"|"360"`), não number — erro 422 Pydantic se mandar number. Corrigido pra sempre arredondar pro valor permitido mais próximo. `exp_date` na resposta da criação é **timestamp Unix (integer)**, diferente do formato string `"YYYY-MM-DD HH:MM:SS"` usado no endpoint de listagem (`/report/allusers`) — causava `.match is not a function`.
- **`expiracaoHorario`**: novo campo em todos os 8 adapters (só exibição, não persiste — `vencimento_real_painel` é `DATE`, sem hora).
- **`impitFetch`** (usado por Club/Liebe/UNITV/UNIPLAY): passou a repetir também em timeout puro de rede, não só erro de proxy/502/connect.

## Técnica usada pra descobrir os campos certos

Ver [[feedback-reverse-engineer-payload-real]] — captura de payload real via interceptor de `fetch`/XHR injetado na página (Claude in Chrome), já que nenhum desses paineis documenta a API publicamente (exceto NATV, que tem Swagger em `/openapi.json`).
