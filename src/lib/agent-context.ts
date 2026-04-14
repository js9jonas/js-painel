// src/lib/agent-context.ts
// Contexto estático de negócio para o agente de dados.
// Edite este arquivo para corrigir/ampliar o significado de tabelas e colunas.
// Aprendizados dinâmicos são armazenados em lab.agente_dados_aprendizados.

export const STATIC_CONTEXT = `
## Sistema JS Painel — Gestão de Clientes IPTV (JS Sistemas)

### Schema PUBLIC — sistema principal de IPTV

**public.clientes** — Cadastro de clientes
- id_cliente, nome, criado_em, observacao
- score_fidelidade: pontuação de fidelidade calculada automaticamente
- Para buscar cliente por telefone: JOIN com public.contatos

**public.assinaturas** — Assinaturas (ciclo de vida de cada cliente)
- status: 'ativo' | 'vencido' | 'pendente' | 'cancelado' | 'cortesia'
- venc_contrato: data de vencimento do contrato comercial
- venc_contas: data de vencimento das contas IPTV — usada nos alertas de renovação
- id_pacote → public.pacote, id_plano → public.planos, id_cliente → public.clientes
- Cliente ativo = assinatura com status = 'ativo'
- Contar clientes ativos: COUNT DISTINCT id_cliente WHERE status = 'ativo'

**public.contas** — Contas no servidor IPTV (credenciais de acesso)
- usuario, senha: login/senha IPTV do cliente
- id_servidor → public.servidores
- status_conta: estado atual da conta no servidor
- vencimento_real_painel: data de expiração registrada no painel do servidor

**public.servidores** — Servidores IPTV utilizados
- id_servidor, nome_interno, codigo_publico, ativo
- Para ver capacidade disponível: JOIN com public.saldo_servidor (saldo_atual = créditos restantes)

**public.saldo_servidor** — Saldo atual de créditos por servidor
- saldo_atual: créditos disponíveis para novas ativações
- Para histórico de movimentação: public.saldo_servidor_historico

**public.pagamentos** — Histórico de pagamentos recebidos
- forma: 'pix' | 'dinheiro' | 'cartao' | 'transferencia'
- tipo: tipo da transação (renovacao, novo, cortesia, etc.)
- data_pgto, valor, id_cliente
- cliente (text): nome do cliente na época (desnormalizado)

**public.contatos** — Telefones e WhatsApp dos clientes
- id_cliente → public.clientes
- telefone: número no formato nacional
- whatsapp_lid: ID interno do WhatsApp Business
- Para achar cliente por telefone: SELECT id_cliente FROM public.contatos WHERE telefone = '...'

**public.planos** — Planos de assinatura disponíveis
- tipo: categoria do plano
- telas: número de telas simultâneas permitidas
- meses: duração em meses
- valor: preço do plano

**public.pacote** — Pacotes de serviço
- contrato: código do pacote (ex: '2M2T' = 2 meses / 2 telas)
- telas: número de telas do pacote

**public.aplicativos** — Registros de apps de TV dos clientes
- status: 'ativo' | 'pendente' | 'vencido'
- validade: data de expiração do app
- id_cliente → public.clientes, id_app → public.apps

**public.apps** — Catálogo de aplicativos suportados
- nome_app, exige_licenca: se precisa de chave de ativação

**public.indicacoes** — Programa de indicações
- id_parceiro → clientes (quem indicou), id_indicado → clientes (quem foi indicado)

### Schema LAB — WhatsApp e agentes IA

**lab.conversations** — Conversas WhatsApp ativas
- jid: identificador único do contato no WhatsApp
- instance: instância Evolution API
- last_message, unread_count, shadow_mode (modo silencioso)

**lab.messages** — Mensagens WhatsApp
- from_me: true = enviada pelo sistema
- content, message_type, status, timestamp

**lab.agentes** — Agentes IA do WhatsApp
- prompt_base, prompt_atual: prompt do agente (versionado em agente_prompt_versoes)
- agente_aprendizados: histórico de aprendizados do agente de atendimento

### Schema GESTAO_COMUNIDADE — sistema separado (igrejas/comunidades)
- Não relacionado ao IPTV
- membros, comunidades, fluxo_caixa, contribuicoes, cultos

## Padrões de query importantes
- Sempre usar aliases para evitar ambiguidade em JOINs
- Para relatórios mensais: usar DATE_TRUNC('month', data_col)
- Datas no banco estão em America/Sao_Paulo (timezone configurado no pool)
- Para clientes ativos com vencimento próximo:
  SELECT c.nome, a.venc_contas FROM public.clientes c
  JOIN public.assinaturas a ON a.id_cliente = c.id_cliente
  WHERE a.status = 'ativo' AND a.venc_contas BETWEEN NOW() AND NOW() + INTERVAL '7 days'
`
