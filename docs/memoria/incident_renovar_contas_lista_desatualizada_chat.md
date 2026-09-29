---
name: incident_renovar_contas_lista_desatualizada_chat
description: 29/09/2026 — renovação pelo /chat pulou a renovação da conta no painel porque a lista de contas da tela estava desatualizada; modal passou a buscar as contas no banco na hora
metadata:
  type: project
---

**Caso real (cliente 2884, 29/09/2026):** a assinatura foi criada às 13:35, a conta Uniplay vinculada às 13:36 e a renovação feita pelo `/chat` às 13:50. O pagamento foi lançado e o contrato avançou, mas a conta **não foi renovada no painel**, e mesmo assim o saldo local descontou 1 crédito. Depois a sincronização devolveu o `venc_contas` pra data real do painel.

**Causa:** o `/chat` só carrega as contas (`carregarContasCliente`) quando o cliente da conversa é identificado ou quando uma conta é mexida pelo menu dela. Uma conta vinculada por fora depois disso não entrava na lista, e o `RenovarAssinatura` só renova no painel as contas vencidas da lista recebida por props. Com a lista vazia, pulava sem aviso.

**Correção:** o `RenovarAssinatura.tsx` (`buscarContasAtuais`) busca `/api/clientes/[id]/contas` logo depois de salvar a assinatura e usa essa lista pra decidir o que renovar no painel. Se a busca falhar, cai na lista das props (o comportamento anterior). Vale pro `/chat` e pra `/clientes/[id]`.

**Why:** falha silenciosa. O operador achava que tinha renovado tudo, o cliente ficava com a conta vencendo e o saldo local ficava 1 abaixo do real.

**How to apply:** componente que dispara ação externa (renovar no painel, cobrar, enviar) a partir de uma lista vinda de estado de tela deve reler a lista do banco na hora da ação. O restante do `/chat` (exibição das contas) continua com a lista em memória, que é aceitável só pra exibir.
