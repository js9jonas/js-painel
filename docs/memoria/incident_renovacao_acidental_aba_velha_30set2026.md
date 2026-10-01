---
name: incident_renovacao_acidental_aba_velha_30set2026
description: 30/09/2026 — cliente 2888 renovado por toque acidental numa aba aberta havia 40 min (celular retomado); renovação não ficava no audit_log. Corrigido com auditoria de renovação/exclusão de pagamento (com usuário/IP) + trava de tela desatualizada no modal
metadata:
  type: project
---

**Caso real (cliente 2888 Egon Ulrich, ass. 3225, 30/09/2026):** cadastrado às 17:13 num aparelho do Jonas (Wi-Fi de casa). Às 17:58:24 o mesmo aparelho, já em outra rede (IP 191.39.77.67, provavelmente dados móveis), disparou `PUT /api/assinaturas/3225/renovar`: pagamento #44996, contrato de 30/09 para 30/10 e "Seja bem-vindo(a)" no WhatsApp do cliente. Esse IP ainda não tinha aparecido naquele dia e já chegou mandando ações pra `/clientes/2888` sem carregar a página, então a aba estava aberta desde o cadastro. Jonas desfez às 18:00 (data corrigida + pagamento excluído, pelo mesmo IP). A Alana não teve participação.

**Como foi investigado:** o `audit_log` não tinha a renovação. A reconstrução só foi possível pelo log de acesso do Traefik (`docker logs` do `easypanel-traefik`: IP + rota + horário), que é rotativo e não diz qual usuário estava logado. A lacuna no ID dos pagamentos (44996 faltando) e o `source='notificacao-boas-vindas'` em `whatsapp_mensagens` ajudaram a fechar o horário.

**Correção:**
1. `audit_log.usuario` (migration `sql/012_audit_log_usuario.sql`): o `registrarAudit` agora grava sozinho o e-mail da sessão em **todos** os tipos (nulo fora de sessão).
2. Tipo `renovacao` gravado na mesma transação da rota `renovar` (nos dois modos): antes/depois de status/venc_contrato/venc_contas, id do pagamento, valor, forma, tela de origem (`telaOrigem`, enviada pelo modal), IP (última entrada do X-Forwarded-For) e navegador.
3. Tipo `exclusao_pagamento` gravado no `DELETE /api/pagamentos/[id]` com os dados do pagamento apagado.
4. Trava no `RenovarAssinatura.tsx`: se a aba ficou ≥5 min em segundo plano ou o modal está aberto há ≥15 min, o 1º clique em salvar não grava. Ele recarrega os dados (`router.refresh` + `onRecarregarDados`, que no /chat recarrega o cliente) e mostra um aviso com o nome do cliente. O botão fica travado 1,5 s pra um toque duplo não passar direto. O modal agora mostra o nome do cliente no cabeçalho.

**Deploy:** commit `4dde184` em produção desde 01/10/2026.
