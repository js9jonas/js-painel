---
name: project-merge-telefones-duplicados
description: "09/07/2026 — levantamento de clientes distintos com mesmo telefone cadastrado, pra futura mesclagem (1 cliente real + assinaturas com campo identificação); backfill de pagamentos.id_assinatura já em andamento"
metadata: 
  node_type: memory
  type: project
  originSessionId: 91a46777-63fc-43d4-9cba-9b9662a0d279
  modified: 2026-08-10T19:22:49.593Z
---

## Objetivo

Jonas quer eliminar clientes "duplicados" que na verdade são a mesma pessoa/telefone pagando por múltiplas assinaturas cadastradas como clientes separados (ex: "Fulano" e "Fulano pai/mãe/sogra"). Plano: em vez de N registros em `clientes`, ter 1 cliente real (dono do telefone) com N assinaturas, usando um campo "identificação" na assinatura pra guardar o nome antigo do "cliente" que foi mesclado.

**Antes de mesclar**, backfillar `pagamentos.id_assinatura` (coluna que já existe, ver [[reference_merge_clientes]]) pros pagamentos antigos desses clientes, pra manter rastreabilidade por assinatura depois que os `id_cliente` forem unificados (hoje `id_cliente` sozinho não vai mais distinguir as assinaturas depois da mesclagem).

## Levantamento (09/07/2026)

- **130 números de telefone** compartilhados por 2+ clientes distintos (contatos.id_cliente). Um deles é placeholder (`0000000000`, 16 clientes — não é telefone real, ignorar).
- Lista completa salva em `/home/jonas/Documentos/telefones_compartilhados.csv` (293 linhas: telefone, id_cliente, nome).
- 17 grupos com 3+ clientes no mesmo telefone, 112 pares (2 clientes).
- Maioria são claramente do mesmo núcleo familiar (sufixos "mãe/pai/sogra/filho/tia/2/MG" no nome) — resultado esperado de 1 telefone por família, não erro.

## Backfill de `pagamentos.id_assinatura` (✅ feito em 09/07/2026, dentro do escopo dos 277 clientes desses grupos)

- **3.472 pagamentos** — clientes com **exatamente 1 assinatura** no histórico → vínculo direto, sem ambiguidade. UPDATE feito e commitado (transação verificada: contagem antes/depois bateu).
- **14 pagamentos** — dos 58 clientes com 2+ assinaturas totais, 14 tinham **exatamente 1 assinatura ativa** hoje → vinculado só o **último pagamento** (mais recente, `ROW_NUMBER() OVER (PARTITION BY id_cliente ORDER BY data_pgto DESC, id DESC) = 1`) a essa assinatura ativa. Os pagamentos mais antigos desses 14 clientes continuam sem vínculo (não dava pra saber com segurança se pertenciam à assinatura hoje ativa ou a uma das outras, já inativas). UPDATE feito e commitado.

## Backfill adicional por valor de plano (✅ feito em 09/07/2026)

Testei 2 critérios extras pros 971 pagamentos ainda pendentes (985 − 14 já resolvidos):
- **Painel (`pagamentos.compra` × painel da assinatura via `contas.id_servidor`→`servidores.painel_tipo`): descartado.** 0 dos 58 clientes ambíguos têm assinaturas em painéis diferentes entre si — todas no mesmo painel (majoritariamente uniplay), então esse critério não desambigua nada.
- **Valor do plano (`planos.valor` da assinatura × `pagamentos.valor`): funcionou.** Pra cada pagamento pendente, contei quantas assinaturas do cliente tinham o mesmo valor de plano — se só 1 batia, vínculo seguro (mesma lógica de candidato único já usada antes). **242 pagamentos** resolvidos assim. UPDATE feito e commitado (contagem verificada).

**Total acumulado do backfill (09/07/2026): 3.472 + 14 + 242 = 3.728 pagamentos vinculados.**

## Pendente / não resolvido

- **✅ Decisão final (09/07/2026): os 729 pagamentos restantes NÃO serão vinculados a `id_assinatura`.** Perfil verificado: período de mar/2021 a 07/06/2026 (histórico bem distribuído, não é problema recente), e só 67 dos 729 mereceriam atenção (2 com valor > R$150, 65 feitos em 2026 — praticamente sem sobreposição entre os dois filtros). Maioria é R$35 (plano padrão) e histórico antigo — baixo risco financeiro/relevância pra insistir na desambiguação.
  - Motivo técnico de não dar pra resolver: 203 sem nenhuma assinatura do cliente batendo no valor (preço do plano mudou desde o pagamento, ou é pagamento agregado tipo Kroth); 526 com 2+ assinaturas de mesmo valor (indistinguível por preço).
  - **Ao mesclar o cliente pro tutor, `pagamentos.id_cliente` desses 729 é atualizado normalmente pro tutor** (histórico de pagamento não se perde) — só fica sem o nível de detalhe "qual assinatura específica" registrado.
  - Heurística temporal (projetar ciclo de renovação ~30 dias pra trás) foi cogitada mas **descartada** — não vale o esforço pro perfil de risco baixo desses pagamentos.
- Pendências anteriores (não afetadas pelo backfill de valor):
  - **43 clientes não têm nenhuma assinatura ativa hoje** (só histórico de contas já saídas) — baixa prioridade, sem urgência de negócio.
  - **1 cliente** (Guilherme de Souza Seidler, id 508) tem **2 assinaturas ativas simultâneas** — genuinamente ambíguo, precisaria de revisão manual pra saber qual pagamento antigo é de qual. Caso confirmado como legítimo pelo Jonas (não é erro): ele tem 2 assinaturas próprias + paga a de outro cliente pelo mesmo telefone. Ver [[project_conciliacao_pix_mapeamento]].
- A mesclagem de fato (1 cliente real + campo "identificação" na assinatura) **ainda não foi implementada** — esse documento é só o levantamento e a preparação (backfill).
- Ao implementar a mesclagem de verdade, seguir o procedimento geral em [[reference_merge_clientes]] (tabelas a migrar, constraints únicas a resolver antes).

## ⚠️ Correção (09/07/2026): `assinaturas.identificacao` JÁ EXISTE

Verificado no schema real — `assinaturas.identificacao character varying` já existe na tabela (junto com `assinaturas.observacao text`). **Não precisa migração de schema pra esse campo.** (Memória anterior dizia o contrário, estava desatualizada/errada — sempre conferir schema real antes de assumir.)

## Lista de 42 tutores sugeridos (09/07/2026)

Gerada via nome do pagador extraído por IA dos comprovantes PIX (`whatsapp_mensagens.conteudo LIKE '%Nome do Pagador%'`), cruzado por similaridade de palavras (Jaccard ≥0.5) contra os nomes de cliente de cada grupo de telefone. Salva no Google Sheets: https://docs.google.com/spreadsheets/d/1mvatGA2YpE3NQSGyROsLF2-IifTchR2bvi2HOtGYAPs/edit (também local em `/home/jonas/Documentos/tutores_sugeridos.csv`).

**⚠️ Taxa de erro confirmada: 4 de 42 (~9,5%) estavam invertidos**, mesmo com score alto/perfeito — Jonas corrigiu manualmente:
- `553184724017` → tutor correto é **Guilherme Chagas Teixeira (id 1297, ativo)**, não Wilson Teixeira da Silva (id 2722).
- `553199703374` → tutor correto é **Marcio Batista Coelho MG (id 1486, ativo)**, não Marcio Batista Coelho 2 (id 2072).
- `555182149008` → tutor correto é **Alessandra Madrid Araujo (id 773, ativo)**, não Marciano Merlin (id 2487).
- `556599848240` → tutor correto é **Maria Lucia da Silva 65 (id 1031, ativo)**, não Maria Lucia da Silva 31 (id 1848).

**Padrão do erro:** nos 4 casos, o nome do pagador no comprovante bateu com o cliente **sem assinatura ativa** ou incerto, mas o tutor real é sempre quem tem a **assinatura ativa**. Sugestão pra próxima vez: usar status "ativo" como critério de desempate/prioridade sobre o nome do comprovante quando houver conflito, não confiar só na similaridade de nome.

**Não usar a lista de 42 pra UPDATE em lote sem revisão linha a linha** — a lista serve de sugestão inicial, não de fonte de verdade.

## Decisões de mesclagem (09/07/2026, confirmadas pelo Jonas)

- **`clientes.observacao`**: concatenar (tutor + mesclado), não perder nenhuma das duas.
- **`contatos`**: pode excluir a linha do cliente mesclado junto com o registro do cliente (não precisa de tratamento especial — é o mesmo telefone/perfil WhatsApp fisicamente).
- **`indicacoes.id_indicado`**: passa a ser do tutor (reassign, `UPDATE indicacoes SET id_indicado = <tutor> WHERE id_indicado = <mesclado>`). Se o tutor já tiver uma indicação como indicado (conflito com `ux_indicacoes_id_indicado`), decidir caso a caso qual mantém.
- **`pagamentos.cliente`** (texto solto, não FK): manter como está — preserva o nome real que apareceu na hora do pagamento, não precisa atualizar pro nome do tutor.

## ✅ Mesclagem executada (09/07/2026)

Script `js-painel/scripts/merge-clientes-telefone-duplicado.js` (dry-run por padrão, `--commit` executa de verdade — cada grupo em transação própria). Testado em dry-run primeiro (42/42 grupos limpos, 0 erro), depois rodado com `--commit`.

**Resultado: 42 grupos processados, 51 clientes mesclados/deletados, 0 erros.** Verificado pós-execução: 0 dos 51 `id_cliente` esperados ainda existem, 0 assinaturas órfãs, total de `clientes` caiu pra 2.685.

Por grupo: `assinaturas`/`aplicativos`/`pagamentos`/`whatsapp_mensagens`/`audit_log`.id_cliente → tutor; `assinaturas.identificacao` = nome antigo (só se estava vazio — `COALESCE`, não sobrescreve rótulo já existente, ex: caso do Guilherme id 508 que já tinha "Quarto"/"Projetor"/"TV sogro" como rótulos próprios); `clientes.observacao` concatenada; `contatos` do mesclado excluído; `indicacoes.id_parceiro` reatribuído sempre; `indicacoes.id_indicado` reatribuído só se tutor não tinha um (25 de 41 casos com indicação foram descartados por conflito, 16 reatribuídos limpo); `pagamentos.cliente` (texto) preservado como estava; `clientes` do mesclado deletado no final.

## ✅✅ PROJETO 100% CONCLUÍDO (09/07/2026)

Depois do lote de 42 (acima), mais 2 rodadas fecharam todos os grupos restantes:

**Caso avulso — Alex Branchi (id 1427) ← Alex Branchi pai (id 2388):** mesclado manualmente fora do lote (comprovante batia com "Paloma Rottoli", terceira pessoa não cadastrada — Jonas decidiu o tutor por conhecimento direto, não pelo nome do comprovante). Achado nesse caso: indicação `id_parceiro=1427, id_indicado=2388` (tutor já tinha indicado o mesclado) — descartada corretamente pela lógica de conflito de `id_indicado` único (funcionou por coincidência, não pelo fix explícito — motivou a correção simétrica no script, ver abaixo).

**Lote 2 — 86 grupos restantes:** planilha `grupos_pendentes_tutor` gerada (telefone | tem_assinatura_ativa | nome1-3 | TUTOR vazio), enviada ao Drive, Jonas preencheu a coluna TUTOR manualmente pra todas as 86 linhas. Lida de volta (`download_file_content` exportando CSV, decodificado de base64), parseada e validada: **0 problemas** (nenhum TUTOR inválido, nenhum id repetido entre grupos, nenhum id inexistente). Script `scripts/merge-clientes-telefone-duplicado-lote2.js` gerado com a mesma função corrigida (2 fixes de auto-indicação inclusos desde o início). Dry-run limpo (86/86, 0 erro) → `--commit` → **86/86 commitados, 0 erro, 96 clientes mesclados**.

**Verificação final pós-lote-2:** 0 clientes que deveriam sumir ainda existem, 0 assinaturas órfãs, 0 auto-indicações, **0 grupos de telefone duplicado restantes no banco inteiro**. Total de clientes: 2.588.

**Resumo total do projeto:** 130 grupos de telefone identificados (1 placeholder ignorado) → 42 (lote 1) + 1 (Alex Branchi) + 86 (lote 2) = **129 grupos mesclados, ~148 clientes eliminados no total**. Projeto encerrado — não é mais uma pendência.

## ⚠️ Reabertura pontual (02/08/2026) — duplicata nova criada manualmente

O "0 duplicados" de 09/07/2026 não é um estado permanente: em 01/08/2026 Jonas cadastrou um cliente novo (Neuzely Justino Barbosa) usando o mesmo telefone de um cliente já existente (Mauro Ribeiro Barbosa Junior, que paga por ela) — recriando o mesmo padrão que o projeto tinha eliminado em massa. Mesclado manualmente em 02/08 seguindo o procedimento padrão, ver [[reference_merge_clientes]] (caso "Neuzely → Mauro").

**Why:** o fluxo de cadastro de cliente novo no js-painel não validava se o telefone informado já pertencia a outro cliente — nada impedia a duplicata voltar a acontecer, o projeto só limpou o passivo existente até aquela data. Reabriu de novo em 10/08 (Valdemar Primaz/Mauro Zimmer), achado ao preparar a constraint abaixo.

**How to apply:** ao ajudar a cadastrar um cliente novo (ou revisar um recém-criado), vale checar se o telefone já existe em `contatos` de outro `id_cliente` antes de seguir — se existir e for uma relação de família/pagador (comum: pai/mãe/filho/cônjuge pagando por outro), o padrão correto é adicionar uma assinatura ao cliente existente com `identificacao` preenchida, não criar cliente novo.

**✅ RESOLVIDO em 10/08/2026** — brecha fechada de vez: `contatos.telefone` agora é único no banco inteiro (índice parcial `ux_contatos_telefone_global`, exclui só o placeholder `0000000000`), com pré-checagem amigável no app antes do INSERT/UPDATE. Ver [[reference_merge_clientes]] pro merge Valdemar→Mauro que motivou o fix e os detalhes técnicos da constraint. Duplicata por telefone não deveria mais conseguir acontecer via UI normal.

## 🐛 Bug encontrado e corrigido: auto-indicação (09/07/2026, pós-commit)

O script migrava `indicacoes.id_parceiro = idMesclado → idTutor` sem checar se o mesclado tinha indicado o **próprio tutor** — nesse caso a migração cria `id_parceiro = id_indicado` (cliente "se indicando"). Jonas identificou 1 caso real (Chaiene de Araujo, id 196, indicada por Denilson de Araujo que foi mesclado nela) e pediu pra excluir todos os casos assim.

**Encontrados e excluídos 10 casos** (todos originados da mesclagem de hoje, `criado_em` anterior à mesclagem — confirma que é reatribuição, não indicação nova): ids 196, 681, 1347, 1428, 2041, 2331, 2283, 2169, 1915, 1297. `DELETE FROM indicacoes WHERE id_parceiro = id_indicado` — 10 linhas, commit confirmado.

**Script corrigido** (`js-painel/scripts/merge-clientes-telefone-duplicado.js`): antes de reatribuir `id_parceiro`, agora checa se existe `indicacoes WHERE id_parceiro = idM AND id_indicado = idTutor` e **exclui** em vez de migrar (evitando o auto-loop). Relevante pros ~87 grupos restantes que ainda serão mesclados no futuro — não precisa reaplicar nos 42 já feitos (já corrigido manualmente).

**Nuance descoberta (09/07/2026, caso Alex Branchi):** o auto-loop pode vir de **duas direções diferentes**, não só a que o fix cobre:
1. Mesclado indicou o tutor (`id_parceiro=idM, id_indicado=idTutor`) → migrar `id_parceiro` cria o self-ref. É o que o fix no script trata.
2. **Tutor já indicou o mesclado** (`id_parceiro=idTutor, id_indicado=idM`, caso do Alex Branchi 1427→2388) → migrar `id_indicado` é que criaria o self-ref, não `id_parceiro`. Esse caso **já era coberto por acidente** pela lógica pré-existente de conflito de `id_indicado` único (se o tutor já tem uma indicação como indicado, a do mesclado é descartada em vez de migrada) — mas só funciona por coincidência quando o tutor TAMBÉM já tem outra indicação como indicado. Se o tutor não tivesse nenhuma, a migração de `id_indicado` teria criado o self-ref sem barreira nenhuma.

**✅ Corrigido no script (09/07/2026):** adicionado check simétrico antes de migrar `id_indicado` — `DELETE FROM indicacoes WHERE id_parceiro = idTutor AND id_indicado = idM` antes da lógica de conflito existente. Agora as duas direções de auto-indicação são tratadas explicitamente, não por coincidência.

## Ferramenta usada

`node -e` com `require('pg')` direto no `DATABASE_URL`, sempre em transação (`BEGIN`/verificação de contagem/`COMMIT` ou `ROLLBACK`) — mesmo padrão de [[reference_merge_clientes]].
