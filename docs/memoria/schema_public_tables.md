---
name: Schema tabelas public — js-painel
description: Colunas reais das tabelas public.assinaturas, public.clientes, public.pacote e public.pagamentos no banco js
type: reference
originSessionId: 1961eeb1-d262-4607-8d3f-d97afb4f14ce
---
## public.assinaturas
| coluna | tipo |
|---|---|
| id_assinatura | bigint |
| id_cliente | bigint |
| id_pacote | bigint |
| id_plano | bigint |
| venc_contrato | date |
| venc_contas | date |
| identificacao | varchar |
| criado_em | timestamptz |
| atualizado_em | timestamptz |
| status | varchar |
| observacao | text |

## public.clientes
| coluna | tipo |
|---|---|
| id_cliente | bigint |
| nome | text |
| criado_em | timestamptz |
| observacao | text |
| nome_norm | text |
| score_fidelidade | numeric |
| score_calculado_em | timestamp |

## public.pacote
| coluna | tipo |
|---|---|
| id_pacote | bigint |
| contrato | varchar  ← nome do pacote (NÃO é "nome") |
| telas | integer |

## public.pagamentos
| coluna | tipo |
|---|---|
| id | integer |
| id_cliente | bigint |
| cliente | text |
| compra | text |
| data_pgto | date |
| forma | text |
| valor | numeric |
| detalhes | text |
| tipo | text |
| atualizado_em | timestamp |
| tipo_pagamento | text |
| dias_relativo_vencimento | integer |
| id_assinatura | bigint | FK → assinaturas.id_assinatura, nullable (adicionada 06/07/2026). Só populada em lançamentos novos (renovar/cortesia/renovarAplicativo); lançamentos antigos ficam null. Ver [[project_clientes_assinaturas_layout]]. |

**Valores reais de `forma` (mai/2026):** PIX (844/mês · R$34.669), Nu PJ (49/mês · R$1.934), Cortesia (36), Nubank (9), Lotérica (8), Sicredi (5), Caixa (1), Outro (1).

**`public.pagamentos` é onde ficam as receitas IPTV** — não em `privado.entradas`. O schema `privado.entradas` contém finanças pessoais (ajustes de saldo, receitas não-IPTV). Quando Jonas perguntar sobre receita PIX ou Nu PJ, consultar `public.pagamentos` com `GROUP BY forma`.

## public.whatsapp_mensagens (colunas adicionadas progressivamente)
| coluna | tipo | notas |
|---|---|---|
| reply_to_wa_msg_id | text | wa_msg_id da mensagem citada (10/06/2026) |
| reply_to_conteudo | text | snapshot do texto citado (10/06/2026) |
| reply_to_origem | text | 'jonas' ou 'cliente' (10/06/2026) |
| media_mime | text | mime type de áudio/imagem/vídeo/documento (10/06/2026) |
| nome_arquivo | text | filename de documentos (10/06/2026) |
| media_url | text | URL pública no Google Drive (24/06/2026) |
| media_drive_id | text | ID do arquivo no Drive (24/06/2026) |
| media_arquivada_em | timestamptz | quando foi arquivada no Drive (24/06/2026) |
| transcricao | text | transcrição de áudio via Groq Whisper (24/06/2026) |

**Why:** Erros ocorreram ao assumir nomes de colunas sem consultar o schema real (ex.: `public.pacotes` em vez de `public.pacote`, `pc.nome` em vez de `pc.contrato`). Em 29/05/2026, procurei receitas IPTV em `privado.entradas` antes de ser corrigido.

**How to apply:** Sempre consultar este schema (ou rodar a query de information_schema) antes de escrever qualquer JOIN ou SELECT que referencie essas tabelas.
