---
name: project-funplay-licencas-livres
description: "Relatório periódico de licenças FunPlay livres e inativos — metodologia, critérios e como reproduzir"
metadata: 
  node_type: memory
  type: project
  originSessionId: d87346c5-50b4-4899-9589-2e0923f0080e
  modified: 2026-08-21T14:57:38.818Z
---

# FunPlay — Relatório de Licenças Livres e Inativos

Relatório executado periodicamente para identificar oportunidades de reuso de licenças FunPlay.

**Why:** Licenças FunPlay custam 1 crédito/ano. Clientes que cancelaram a assinatura IPTV mas ainda têm licença FunPlay válida representam crédito "preso". Identificar esses casos permite realocar o device (se o novo cliente nunca teve licença paga) ou simplesmente monitorar.

**Esclarecimento do uso real (27/07/2026):** o que Jonas reaproveita é o **device físico já ativado** (o aparelho/app do cliente que não renovou), reconfigurando-o (playlist/M3U) para um cliente diferente que **já tem assinatura ativa** — não é uma "transferência de licença" dentro da plataforma FunPlay (isso [[reference-funplays-licenca-transferencia]] confirma que não é possível entre devices já pagos). É reuso físico do hardware/MAC já licenciado, evitando o custo de 1 crédito de ativação nova. Por isso a lista precisa cruzar "device com licença válida parada" × "cliente pagante que precisa de app".

**How to apply:** Rodar o script quando o Jonas pedir "lista atualizada FunPlay", "licenças livres", "fun plays disponíveis pra usar a licença" ou o equivalente pedindo SmartOne. Entregar só via chat/artifact — **não gerar CSV em disco** (ver [[feedback_sem_csv_redundante]], pedido 21/08/2026).

## Critérios

### Licença Livre
- `activation_expired >= hoje` (licença FunPlay válida)
- Cliente encontrado no banco por nome (cruzamento fuzzy normalizado)
- `MAX(venc_contrato) < hoje` **para todas as assinaturas do cliente** (nenhuma ativa)
- `MAX(vencimento_real_painel) < hoje` (conta IPTV também vencida ou sem conta vinculada)

### Inativos (`payed=false`)
- Campo `payed: false` na API FunPlay
- São devices nunca ativados com licença paga (trial expirado ou cancelado)

## Como reproduzir

1. **JWT FunPlay:** navegar em `https://reseller.funplays.app` via Playwright → `localStorage.getItem('JWT')`. Sessão dura 1h.

2. **API:** `GET https://api.funplays.app/reseller/devices?limit=100&page=N` com header `authorization: {JWT}` (sem Bearer). Resposta em `message.rows[]`. Campos: `activation_expired`, `payed`, `device_note.comment` (nome), `mac`.

3. **Banco:** query agrupada por `id_cliente` com `HAVING MAX(venc_contrato) < CURRENT_DATE` para garantir que NENHUMA assinatura esteja ativa.

4. **Cruzamento:** normalizar nomes (lowercase + remover acentos + trim) dos dois lados.

## Resultados em 2026-06-20

- **Licenças livres:** 93 devices
- **Inativos (payed=false):** 14 devices
- Atenção: Lia Portz vencia nesse dia (0 dias); Onesio Luis Thesing (4d); Darciane Souza (15d)

## Resultados em 2026-07-20 — nova consulta direto no banco (sem API) + segundo critério

Jonas pediu a lista sem consultar o painel FunPlay (só banco). Descoberto que `public.aplicativos` já tem `id_cliente` vinculado direto (não precisa mais fuzzy match por nome) — usar `id_app = 3` (FunPlays), `removido_em IS NULL`. Colunas relevantes: `mac`, `validade`, `status` ('ativa'/'inativa'/'pendente'), `id_cliente`.

**Critério A (licença livre, igual ao original):** `validade > CURRENT_DATE` + cliente com ≥1 assinatura em `public.assinaturas` mas nenhuma com `venc_contrato > CURRENT_DATE`. Resultado: **145 devices**.

**Critério B (novo, pedido por Jonas):** cliente COM assinatura ativa (`venc_contrato > CURRENT_DATE`) mas FunPlay com `status = 'inativa'` — sinaliza cliente pagante com licença que precisa reativar. Resultado (com `validade > hoje` também aplicado): **15 devices**.

**Lista completa (160 registros, grupos A+B) salva em `/home/jonas/funplay_lista_20260720.csv`** — colunas: grupo, mac, nome, validade_licenca, dias_restantes, venc_contrato_relevante, qtd_assinaturas, status_funplay.

Achado: MAC `21:a0:c5:5o:j9:ja` (cliente Antonina Silva de Almeida) tem caracteres não-hexadecimais — provável erro de cadastro, conferir antes de qualquer ação.

## Resultados em 2026-07-11 — critério ampliado

Jonas pediu critério mais amplo: status inativo OU sem nenhuma lista ativa OU assinatura vencida (não só "nenhuma ativa E conta vencida" como antes). Resultado: **214 devices / 189 clientes únicos** (176 com status inativo, 7 sem nenhuma assinatura no banco, resto só com venc_contrato no passado).

**Mudança de método por causa do firewall (ver [[incident-js-lab-cryptominer-11jul2026]]):** porta 5432 agora bloqueada externamente, então `node -e` a partir do desktop local não funciona mais para consultas ao banco `js`. Alternativas usadas:
- Terminal web da Hostinger: **não serve para payloads grandes** — comandos de ~1500+ caracteres falham silenciosamente (nem aparecem no prompt), e o xterm só mantém ~50 linhas no DOM (`browser_evaluate` mostrou `rowsCount: 50`), então também não dá pra ler outputs grandes via `cat`.
- **pgweb funciona bem**: link de acesso fica em Easypanel → `projects/js/postgres/bdjs` → botão "Abrir" ao lado de "PgWeb" (URL com `?easypanel-token=...`, token muda a cada verificação, pegar de novo se expirar). Selecionar banco "js" no dropdown (abre em "postgres" por padrão). Para colar queries grandes (milhares de caracteres, ex. `WHERE nome_norm = ANY(ARRAY[...726 nomes...])`), usar `browser_evaluate` chamando a API do Ace editor diretamente: `document.querySelector('.ace_editor').env.editor.setValue(sql, -1)` — não dá pra usar clique+`browser_type` no textarea do Ace (input não é focável do jeito esperado). Resultado da tabela: extrair via `document.querySelectorAll('table tr')` com `filename` no `browser_evaluate` (senão estoura limite de tokens da resposta).
- Consolidei como referência geral: [[feedback_acesso_banco]] precisa de nota sobre isso.

## Limpeza realizada em 2026-06-19

- **LazerPlay:** 271 devices com licença vencida >60 dias deletados do painel + 271 registros do banco (aplicativos + cascade em aplicativo_playlists)
- **SmartOne:** 60 devices com status "Expired" deletados do painel + 59 registros do banco

## Observação sobre SmartOne

SmartOne remove automaticamente devices da listagem ativa quando expiram. Para encontrar expirados, usar `/index/all/` e procurar texto "Expired" na coluna Expiration (não é uma data — o painel substitui a data pela palavra "Expired" após vencimento).

## Resultados em 2026-07-27 — critério refinado (exige assinatura já registrada)

Jonas pediu o critério ampliado (status inativo OU cliente sem assinatura ativa) **mais uma restrição nova**: o cliente precisa ter **pelo menos uma assinatura já registrada** em `assinaturas` (`EXISTS`, sem checar data). Motivo: há clientes que só compram ativações avulsas e nunca tiveram assinatura — esses não são "clientes que não renovaram", são revendedores/casos que não devem entrar na lista de reaproveitamento (mesmo tipo de exclusão manual que já existia em [[reference-funplay-licencas-sem-contrato]] via `ultimo_venc_contrato = null`, agora embutida direto na query).

Query final (via `dbtunnel`, `aplicativos` id_app=3, `removido_em IS NULL`):
```sql
SELECT cl.id_cliente, cl.nome AS cliente, ap.mac, ap.status, ap.validade,
  (ap.validade - CURRENT_DATE)::int AS dias_restantes,
  (SELECT MAX(a2.venc_contrato) FROM assinaturas a2 WHERE a2.id_cliente = ap.id_cliente) AS ultimo_venc_contrato,
  (SELECT count(*) FROM assinaturas a3 WHERE a3.id_cliente = ap.id_cliente) AS qtd_assinaturas
FROM aplicativos ap
JOIN clientes cl ON cl.id_cliente = ap.id_cliente
WHERE ap.id_app = 3
  AND ap.removido_em IS NULL
  AND EXISTS (SELECT 1 FROM assinaturas a WHERE a.id_cliente = ap.id_cliente)
  AND (
    ap.status = 'inativa'
    OR NOT EXISTS (SELECT 1 FROM assinaturas a WHERE a.id_cliente = ap.id_cliente AND a.venc_contrato >= CURRENT_DATE)
  )
ORDER BY cl.nome, ap.mac
```

Resultado: **171 devices / 159 clientes únicos** (49 com `status='inativa'`, 122 com status `'ativa'` mas cliente com toda `assinatura` vencida). Salvo em `/home/jonas/funplay_lista_20260727.csv` (colunas: id_cliente, cliente, mac, status_funplay, validade_licenca, dias_restantes, ultimo_venc_contrato, qtd_assinaturas).

**Pendente (combinado com Jonas):** discutir uma forma mais fácil de pedir essa lista sob demanda (script pronto, endpoint no js-painel, ou comando/skill) em vez de reconstruir a query manualmente cada vez — retomar quando ele voltar a olhar o CSV.

## Extensão pra SmartOne + critério "prontos" mais estrito (13/08/2026)

Jonas pediu a mesma lista, mas para **SmartOne** (`id_app = 4`, não 3) — mesma query do bloco acima, só trocando o `WHERE ap.id_app`. Confirmado em `reference_server_ids.md`: `id_app` 2=LazerPlay, 3=FunPlays, 4=SmartOne.

Ao pedir a lista "disponível para transferir a licença" (não só "livre"), apliquei um filtro mais estrito que o critério A original: **`status = 'ativa'` E `dias_restantes >= 0`** (licença ainda dentro da validade, não só "cliente sem assinatura ativa"). Motivo: dentro do grupo A original tem casos com licença já vencida (precisaria 1 crédito novo pra reativar — não é "disponível" sem custo) e casos com `status = 'inativa'` (precisa reativar antes de poder usar). Chamei esse subconjunto de **"prontos para reuso imediato"**.

**Resultados 13/08/2026:**
- FunPlays (`id_app=3`): 183 total no critério amplo (status inativo OU sem assinatura ativa) → **140 no grupo A** (sem assinatura ativa) → **115 "prontos"** (ativa + licença válida).
- SmartOne (`id_app=4`): 102 total no critério amplo → **61 com status 'ativa'**, dos quais **38 "prontos"** (ativa + `validade` preenchida + dias_restantes≥0). ⚠️ SmartOne tem **10 devices com status 'ativa' mas `validade` NULL no banco** — não incluídos nos "prontos" por falta de dado confiável (diferente do FunPlays, onde `validade` sempre vem preenchida da API).

Tabela final enviada ao Jonas incluía coluna `ultimo_venc_contrato` (vencimento de contrato mais recente do cliente) além de MAC/validade/dias_restantes — ele pediu essa coluna extra numa mensagem de acompanhamento, então vale sempre incluir por padrão nas próximas vezes.

## Resultados em 2026-08-18 — pedido direto "prontos para transferir"

Jonas pediu a lista "que posso transferir" sem especificar o critério — apliquei direto o critério "prontos" (mais restrito, já combinado em 13/08) para FunPlays: **96 devices / 89 clientes únicos** (status='ativa' + validade≥hoje + cliente sem nenhuma assinatura ativa). 8 vencendo em <30 dias, 7 entre 30–90 dias.

Entreguei como artifact (tabela com pills coloridas por urgência) em vez de só CSV — primeira vez nesse formato para esse relatório; CSV também salvo em `/home/jonas/funplay_lista_20260818.csv` como sempre.

## Resultados em 2026-08-21 — pedido "lista atualizada"

Jonas pediu de novo sem especificar critério — repliquei o critério "prontos" (mesmo de 18/08) direto pra FunPlays: **93 devices** (status='ativa' + validade≥hoje + cliente sem nenhuma assinatura ativa). Distribuição por urgência: 3 críticas (≤7d: Andre Primaz 2d, Luana Cristina dos Santos 3d, Bruna Gabriely Sell 7d), 4 atenção (8–30d), 86 OK (>30d).

Entreguei como artifact (mesmo formato de 18/08: stat tiles de urgência no topo + tabela com pills coloridas) — https://claude.ai/code/artifact/2dd6e1db-0229-40c7-a235-89125ec74018. CSV salvo em `/home/jonas/funplay_lista_20260821.csv`.

**Mesmo dia, na sequência, Jonas pediu SmartOne também** (`id_app=4`, mesma query trocando o app). Resultado: **37 "prontas"** (0 críticas ≤7d, 1 atenção 8-30d, 36 OK >30d). Confirmado de novo o problema já visto em 13/08: **14 devices** com `status='ativa'` + cliente sem assinatura ativa mas `validade` NULL — ficam fora da lista "pronta" por falta de dado confiável, sinalizados à parte no artifact (callout) em vez de simplesmente omitidos sem explicação. Artifact — https://claude.ai/code/artifact/6f7ac632-9d8f-472f-b8f5-7446a8509b8d. CSV em `/home/jonas/smartone_lista_20260821.csv`.

⚠️ **Nota sobre o túnel:** na sequência do pedido do FunPlays, o túnel SSH (`dbtunnel`) já estava "zumbi" (porta escutando no `ss`, mas query pendurou até timeout) — precisou matar o processo `ssh` antigo e abrir de novo antes da query do SmartOne funcionar. Reforça [[feedback_acesso_banco]]: nunca confiar só em `ss -ltnp`, sempre validar com uma query real primeiro.

## Resultados em 2026-08-26 — pedido "lista dos fun plays disponíveis pra usar a licença"

Jonas usou uma frase nova ("fun plays disponíveis pra usar a licença") para pedir o mesmo relatório — não reconheci de imediato e perguntei contexto antes de encontrar este arquivo via grep no repo. Apliquei direto o critério "prontos" pra FunPlays: **99 devices** (status='ativa' + validade≥hoje + cliente sem assinatura ativa). Distribuição: 2 críticas (≤7d: Bruna Gabriely Sell 2d, Kawan Cristian Maia da Silva 5d), 3 atenção (8–30d), 94 OK.

Entregue como artifact — https://claude.ai/code/artifact/f0965825-56f8-4da6-84f8-c06876ddca2d. Sem CSV, conforme [[feedback_sem_csv_redundante]].

**Mesmo dia, na sequência, Jonas pediu "execute de novo pra atualizar a lista"** — reexecutei a mesma query e republiquei no mesmo link (atualizar in-place, não criar artifact novo). Resultado: **96 devices** (3 a menos: Laura Posselt Kretschmer MAC `20:15:de:06:8a:e4`, Leonardo Lopes MAC `65:19:fb:14:e9:a5`, Lunara Graziela MAC `AC:5A:F0:30:FD:FC` saíram da lista, nenhum novo entrou). Confirma que "execute de novo"/"atualizar" nesse contexto significa: reabrir túnel, rodar a mesma query, e republicar no artifact existente (não criar um novo link).

**Na sequência, Jonas pediu "agora quero pra smartone"** — mesma query trocando `id_app` pra 4, critério "prontos" idêntico. Resultado: **42 devices** (0 críticas ≤7d, 4 atenção 8-30d, 38 OK), + **18 excluídos** por `validade` NULL (mesmo problema documentado em 13/08 e 21/08 — SmartOne às vezes não grava esse campo, diferente do FunPlay). Artifact separado (link próprio, não reaproveita o do FunPlay) — https://claude.ai/code/artifact/0b7f7f4c-3ef6-42f8-95c9-f54854f62372, com callout explicando os 18 excluídos em vez de omiti-los silenciosamente.

Ver também: [[reference-funplay-licencas-sem-contrato]], [[reference-funplays-api]], [[reference-funplays-licenca-transferencia]]
