---
name: Merge de clientes duplicados — js-painel
description: Procedimento e constraints a tratar ao unificar dois id_cliente no banco js (schema public)
type: reference
originSessionId: 7e13aed4-d1f2-4f7a-ad38-7b37b42b3f3c
modified: 2026-08-10T19:22:38.327Z
---
## Tabelas que referenciam id_cliente e precisam de UPDATE

| Tabela | Coluna | Observação |
|---|---|---|
| `aplicativos` | `id_cliente` | FK, sem conflito esperado |
| `assinaturas` | `id_cliente` | FK, sem conflito esperado |
| `contatos` | `id_cliente` | FK + unique `ux_contatos_cliente_telefone` — checar duplicatas de telefone antes |
| `map_cliente_planilha` | `id_cliente` | FK, sem unique composta |
| `pagamentos` | `id_cliente` | sem FK, tem coluna texto `cliente` (nome) — pode manter ou atualizar |
| `whatsapp_mensagens` | `id_cliente` | sem FK |
| `audit_log` | `id_cliente` | FK — descoberto em 07/06/2026; migrar normalmente |
| `indicacoes` | `id_parceiro` | FK, migrar normalmente |
| `indicacoes` | `id_indicado` | FK + unique `ux_indicacoes_id_indicado` — se destino já tem registro, deletar o duplicado |

Após migrar tudo: `DELETE FROM public.clientes WHERE id_cliente = <origem>`.

## Constraints que causaram bloqueio (aprendidas em mai/2026)

- `ux_contatos_cliente_telefone` — unique em `(id_cliente, telefone)` na tabela `contatos`. Se origem e destino tiverem o mesmo telefone, deletar o contato da origem antes de migrar.
- `ux_indicacoes_id_indicado` — unique em `id_indicado` na tabela `indicacoes`. Se origem aparece como indicado e destino também, deletar a indicação da origem (duplicata).

## Ferramenta de conexão

`psql` não está instalado localmente. Usar `node -e` com `require('pg')` e a `DATABASE_URL` do `/home/jonas/js-painel/.env.local`. Sempre rodar dentro de uma transação (`BEGIN` / `COMMIT` / `ROLLBACK`).

## Ordem segura de execução

1. Resolver conflitos de `contatos` (deletar duplicatas de telefone)
2. UPDATE de todas as tabelas acima
3. Resolver conflitos de `indicacoes` (deletar indicação duplicada se necessário)
4. DELETE do cliente origem em `public.clientes`

## ✅ 23/07/2026 — aplicado com sucesso: Geni Ajardo Ferreira (1574) → Alexandra Trindade (1544)

Caso disparado por pedido explícito do Jonas (transferir assinatura 2721 + excluir cliente origem se nada mais sobrasse) — não era um merge de duplicata, mas o mesmo procedimento se aplicou 1:1. Migrado: 1 assinatura, 1 conta (via `id_assinatura`, sem UPDATE direto — segue automaticamente), 3 aplicativos, 26 pagamentos, 1 contato (sem conflito de telefone), 1 `map_cliente_planilha`, 2 `audit_log`. 0 indicações, 0 whatsapp_mensagens. Confirmado "nada sobrou" via COUNT em todas as tabelas antes do DELETE, dentro da mesma transação.

**Refinamento:** além do `id_cliente`, também atualizei o campo texto `pagamentos.cliente` (nome) para o nome do destino — a tabela original só dizia "pode manter ou atualizar"; decidido atualizar para evitar nome desatualizado aparecendo em telas/relatórios que exibem esse campo texto direto.

**Nota:** `contas` não tem `id_cliente` direto — está sempre atrelada via `id_assinatura`. Migrar a assinatura já "carrega" a conta e qualquer histórico ligado a `id_assinatura` (ex: `saldo_servidor_historico`) automaticamente, sem UPDATE adicional nessas tabelas.

## ✅ 02/08/2026 — aplicado com sucesso: Neuzely Justino Barbosa (2798) → Mauro Ribeiro Barbosa Junior (2794)

Caso disparado por pedido do Jonas: ele tinha acabado de cadastrar Neuzely como cliente novo, mas ela usa o mesmo telefone do filho Mauro (que paga por ela) — deveria ter sido uma assinatura extra dentro do cliente do Mauro, não um cliente separado. Já havia uso real no cadastro errado (1 assinatura ativa, 1 conta IPTV, 1 aplicativo com MAC próprio, 1 pagamento, 2 audit_log) — não era um cadastro vazio.

Migrado 2798→2794: 1 assinatura (`identificacao` mantida como "Neuzely" pra diferenciar da assinatura própria do Mauro), 1 aplicativo, 1 pagamento (`pagamentos.cliente` texto também atualizado pro nome do destino, seguindo o refinamento do caso Geni→Alexandra), 2 `audit_log`. Contato duplicado de 2798 (mesmo telefone `553188544844` do 2794) excluído em vez de migrado, por causa da unique `ux_contatos_cliente_telefone`. Verificado "nada sobrou" via COUNT em todas as tabelas antes do DELETE, dentro da mesma transação. 0 indicações envolvidas.

**Padrão geral confirmado:** quando dois clientes distintos têm o mesmo telefone porque um paga pelo outro (família), a estrutura correta é 1 cliente (dono do telefone/pagador) com N assinaturas, usando `assinaturas.identificacao` pra rotular de quem é cada uma — mesmo padrão do projeto [[project_merge_telefones_duplicados]]. Ver lá a nota sobre esse caso ter reaberto a questão mesmo após o projeto de mesclagem em massa ter sido dado como concluído.

## ✅ 10/08/2026 — Valdemar Primaz (2117) → Mauro Zimmer (2776), e constraint definitiva aplicada

Achado ao preparar a constraint unique de telefone pedida pelo Jonas: Valdemar (assinatura inativa desde 05/2024) e Mauro (assinatura ativa, cliente criado em 07/2026) tinham o mesmo telefone `555197012552` — mesmo padrão família/pagador de sempre. Confirmado com Jonas antes de mesclar. Migrado 2117→2776: 1 assinatura (`identificacao`='Valdemar Primaz'), 1 `map_cliente_planilha`, 1 pagamento (`pagamentos.cliente` texto também atualizado, seguindo o refinamento mais recente — **essa é a convenção vigente**, não a decisão antiga de "não atualizar texto" do projeto de mesclagem em massa), 1 indicação (`id_indicado`, sem conflito). Contato duplicado do cliente mesclado excluído. 0 registros sobraram em `aplicativos`/`whatsapp_mensagens`/`audit_log` pra migrar. Verificado "nada sobrou" antes do DELETE, dentro da mesma transação. `tipo='merge_cliente'` usado no audit_log (tipo novo, mais específico que `edicao_cadastro`).

**Depois de zerar duplicatas** (esse caso + o placeholder `0000000000` de ~16 clientes, que não é telefone real), foi criado `ux_contatos_telefone_global` — índice único parcial em `contatos.telefone` pra **todo o banco**, não só por cliente (ver `js-painel/CLAUDE.md` pra detalhes técnicos e pontos de código alterados). Isso fecha de vez a brecha que causava essas duplicatas recorrentes (Neuzely/Mauro em 02/08, Valdemar/Mauro em 10/08) — cadastro de cliente novo agora bloqueia com mensagem amigável se o telefone já pertencer a outro cliente, nomeando o dono.

**Se a constraint disparar no futuro** (usuário tenta cadastrar cliente/contato com telefone já existente): NÃO é bug — é o comportamento pretendido. A ação correta é: confirmar com Jonas se é a mesma pessoa/família e, se for, seguir este mesmo procedimento de merge em vez de tentar contornar a constraint.
