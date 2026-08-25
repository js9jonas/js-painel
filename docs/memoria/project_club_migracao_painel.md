---
name: project-club-migracao-painel
description: "Migração de contas do painel CLUB antigo para um painel CLUB novo (fornecedor trocado) — arquitetura, automação criada e estado do rollout"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5cd6510f-144b-4f1a-b40c-3acfeb7d3080
  modified: 2026-08-24T01:33:38.138Z
---

# Migração CLUB antigo → CLUB novo

**Why:** Jonas teve problema com o fornecedor antigo do painel CLUB e precisou adquirir outro painel CLUB (outro login/senha de revenda). Para renovar uma conta é preciso excluir do painel antigo e recriar com o mesmo usuário/senha no painel novo (usuário fica "ocupado" no antigo até ser excluído de lá).

## Arquitetura (05/08/2026)

- **`painel_servidores` já suporta múltiplas linhas do mesmo `tipo`** (cada uma com sessão/token isolado) — não precisou de nenhuma mudança de schema. Bastou cadastrar uma segunda linha `tipo='club'`.
- **id=1** — "CLUB (antigo)", usuário `2971jonas`
- **id=105** — "CLUB (novo)", usuário `jonasrevz20` (cadastrado nesta sessão)
- Resolve completamente o problema original de "não consigo manter os dois painéis abertos ao mesmo tempo" — como tudo passa pela automação (token por linha, não sessão de navegador manual), não há conflito. A "sessão única" do CLUB é *por conta*, não entre contas diferentes.

## Automação criada

- **`deletarConta()`** já existia (endpoint `listas/{id}/deletar`).
- **`criarConta()`** implementado 05/08/2026 via reverse engineering do endpoint `POST listas/nova`. Ver detalhes técnicos em [[reference_adapters_paineis_iptv]] (seção CLUB) e [[reference_endpoints_paineis_iptv]].
- **⚠️ Quirk descoberto por observação do Jonas:** a criação nunca aplica o bouquet com conteúdo adulto corretamente mesmo enviando os IDs certos — só uma edição pós-criação aplica de verdade. `criarConta()` já roda essa edição de confirmação automaticamente.
- Commit: branch `feature/club-migracao-painel`, `28a5aa6`.
- **✅ 05/08/2026 — merge na `main` (commit de merge `e8359a2`), push e deploy no Easypanel implementados.** Botões "Migrar pra outro painel" em `/clientes/[id]` e em `/alertas` estão em produção.

## Estratégia de rollout

**Decidido:** migrar sob demanda, no momento da renovação (não em lote/big-bang) — sem prazo definido, sem pressa. Quando uma conta do CLUB antigo vence e tem `venc_contrato` à frente (cliente vai continuar), ela é candidata: excluir do antigo + `criarConta()` no novo com mesmo usuário/senha/telas/bouquet + atualizar `contas.id_painel_servidor` pro novo painel.

**Query de candidatas** (mesmo filtro usado em `/alertas`):
```sql
SELECT c.id_conta, c.usuario, c.rotulo, a.venc_contrato
FROM public.contas c
JOIN public.assinaturas a ON a.id_assinatura = c.id_assinatura
WHERE c.id_painel_servidor = 1 AND c.removido_em IS NULL
  AND c.vencimento_real_painel <= CURRENT_DATE
  AND a.venc_contrato > CURRENT_DATE
```

## Estado do rollout

- **05/08/2026:** 5 contas migradas manualmente via script/browser (prova de conceito + já resolvendo renovações reais do dia): JS Contas (jsclub88), Felipe Rodrigues (felipelf), Derli Amorim Elsenbach (solanggs), Claudinei M Silva (claudnm02), Vinicius Camargo (viniccam). Todas 1 mês, mesmo bouquet/adulto/telas do original, rótulo = nome do cliente na coluna Notas do painel (pedido do Jonas).
- **208 contas** ainda no painel antigo (id=1) em 05/08/2026.
- **Pendente:** botão/ação "Migrar conta" dentro do js-painel (rota + UI), integrado no fluxo de "Renovar via API" — hoje a migração ainda é feita via script avulso/manual, não pelo painel. Ver [[reference_adapters_paineis_iptv]] pra status dos adapters.

## Lição — hCaptcha da automação trava com re-logins repetidos na mesma conta

Login automatizado via 2captcha (`jonasrevz20`) travou completamente (múltiplas tentativas de 150s em "processing", nunca resolvendo) depois de ~6 logins seguidos na mesma conta em ~25min (alternando navegador real e API). Saldo 2captcha OK (não é falta de crédito). Hipótese: hCaptcha adaptativo escala dificuldade com padrão de re-login repetido. **Login manual via navegador continuou funcionando normalmente o tempo todo** (nunca travou) — é o fallback confiável quando a automação via 2captcha travar assim. Não insistir agressivamente tentando de novo via 2captcha na hora; ou esperar mais (risk score esfria) ou usar o navegador.

**⚠️ Login manual no navegador derruba o token da API em uso (sessão única):** ao logar manualmente em `dashboard.bz` pra investigar algo, o token cacheado em `painel_servidores.session_cookie` que o adapter estava usando (obtido via 2captcha) morre na hora — próxima chamada da API retorna "sessão expirada" e o adapter dispara `dispararLogin()` (novo 2captcha) sozinho em background. Se for só investigar/ler algo, preferir não logar manualmente enquanto o token da API está em uso; se logar mesmo assim, saber que o app vai precisar relogar via 2captcha na próxima chamada real (não é bug, é esperado).

## ⚠️ Regra — nunca gastar crédito em teste sem perguntar antes

`criarConta()` custa 1 crédito no CLUB. Jonas pediu explicitamente (05/08/2026) pra **nunca executar nada com custo em teste sem confirmar antes**. Isso inclui excluir/recriar contas de teste já pagas — se sobrar uma conta de teste (ex: `revengtest01`), a resposta certa é **reaproveitar editando** (username/senha/rótulo/bouquet), não excluir e recriar (recriar gastaria outro crédito). Ver [[feedback_falso_sucesso_adapters]] — o mesmo cuidado de nunca assumir sucesso sem confirmar vale em dobro quando a ação tem custo real.

## Migração real nº 1 — Gilberto Lourenço da Silva (05/08/2026)

Primeira migração via reaproveitamento: a conta de teste `revengtest01` (criada durante a engenharia reversa do `criarConta()`, já paga, 1 tela, 1 mês) foi **editada** (não excluída) pra virar a conta real do Gilberto — `gilberts`/`Silva2024`, telas=1 (já batia), rótulo "Gilberto Lourenço da Silva 31". Excluído do painel antigo primeiro (usuário é único **globalmente** na plataforma pdcapi.io, não só por revenda — tentar criar/editar pra um username que ainda existe em outra revenda dá erro "Esse nome de usuário já está em uso").

**Bug descoberto durante essa migração — bouquet adulto não aplicava mesmo com `editarConta()` reportando sucesso** (`{ok:true}`, "Lista editada com sucesso", mas o campo `bouquet` no `/info` nunca mudava). Investigado via Claude in Chrome: login manual + interceptor de `fetch`/`XHR` capturando o payload real do formulário. Faltavam **dois campos**: `plano_opt_edit` precisa ser `"on"` (não `"antigo"`, que só mantém o pacote atual) e existe um campo **separado** `plano_adulto=1` que é o que realmente liga o conteúdo adulto — os IDs do bouquet (215..225 vs 216..225) sozinhos nunca bastam. **Fix aplicado em `club.ts`** (commit `f0e653b`) em `editarConta()` (novo param opcional `comAdultos`) e no passo de confirmação do `criarConta()` (mesmo bug, explica o quirk antigo documentado). Ver [[reference_adapters_paineis_iptv]].

Resultado final confirmado via `/info`: `gilberts` (senha em `contas` no banco, não fica na memória), 1 tela, **Canais Adultos: Sim**, rótulo certo. Banco atualizado: `contas.id_conta=263` (registro real do Gilberto) passou a apontar `id_painel_servidor=105`/`id_servidor=14`; `contas.id_conta=2877` (linha da conta de teste) marcada `removido_em` (a licença física virou a 263, não faz mais sentido como registro separado).

## ✅ Migração automática embutida no fluxo de renovar (05/08/2026)

Jonas percebeu o risco real: o fluxo de renovação (tanto o clique manual "Renovar via API" em `/alertas` quanto a renovação automática silenciosa ao salvar assinatura em `RenovarAssinatura.tsx`) simplesmente chamava `adapter.renovar()` pra qualquer conta vencida, **sem checar se era do painel antigo** — o que renovaria a conta lá em vez de migrar, contrariando a estratégia decidida.

**Solução (commit `d286d8e`):** nova coluna `painel_servidores.migrar_para_id` (auto-FK nullable) — quando setada, diz "contas deste painel, ao vencer, devem migrar pro painel referenciado em vez de renovar aqui". Configurado `id=1` (CLUB antigo) → `id=105` (CLUB novo). A rota `/api/paineis/servidores/[id]/renovar` agora checa esse campo **antes** de chamar `adapter.renovar()` — se setado, resolve `id_conta` por usuario+painel e migra (exclui da origem + `criarConta()` no destino) automaticamente, em vez de renovar. Um único ponto de checagem cobre os dois pontos de entrada (clique manual e renovação silenciosa), sem precisar duplicar a lógica.

**Decisão explícita do Jonas:** migração 100% automática nos dois fluxos, incluindo o silencioso — vai gastar 1 crédito automaticamente sempre que uma conta do painel antigo vencer, sem pedir confirmação a cada vez. Isso já era a estratégia de rollout decidida ("migrar sob demanda no momento da renovação"), agora implementada de fato em vez de depender de ação manual.

**Lógica de migração extraída** pra `src/lib/migrar-painel.ts` (`migrarContaPainel(idConta, idPainelDestino)`), compartilhada entre `/renovar` e a rota dedicada `/api/contas/[id]/migrar-painel` (escolha manual de destino, usada pelos botões "Migrar" em UI — comportamento inalterado).

**UI:** `RenovarViaAPIButton.tsx` mostra "✓ Migrado" em vez de "✓ Renovado" quando a resposta vem com `migrado:true`.

**✅ Testado ponta a ponta com 2 contas reais (a pedido do Jonas, mesmo antes do vencimento natural — `celsogrom` vence 07/08, `rubems01` idem, ambas com `venc_contrato` bem à frente):**
- `celsogrom` (id_conta=185): chamada real em `/api/paineis/servidores/1/renovar` retornou `{ok:true, migrado:true, novoVencimento:"2026-09-05"}`. **Achado aqui:** o UPDATE só trocava `id_painel_servidor`, deixando `contas.id_servidor` órfão apontando pro painel antigo (mesmo bug já corrigido manualmente antes pro Gilberto+5, não replicado na função nova). Corrigido em `migrar-painel.ts` (commit `5f5c0af`) e a conta ajustada manualmente. Confirmado via `obterDetalhes()` direto nos dois painéis: sumiu do antigo, existe no novo (senha em `contas`, 1 tela, adulto, rótulo certo).
- `rubems01` (id_conta=52): mesmo teste **depois** do fix — `id_servidor` já veio `14` certinho, sem correção manual. Confirmado nos dois painéis: sumiu do antigo, existe no novo (senha em `contas`, 1 tela, adulto, rótulo certo).

Mecanismo `migrar_para_id` validado como funcionando de ponta a ponta (banco + os dois painéis reais), incluindo o fix do `id_servidor`.

**Generalização:** esse mecanismo (`migrar_para_id`) é reutilizável pra qualquer futura troca de fornecedor de painel, não só CLUB — basta setar a coluna no painel a ser descontinuado.
