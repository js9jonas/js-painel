---
name: reference-funplays-licenca-transferencia
description: Regra de transferência de licença FunPlay — só funciona para dispositivos novos sem licença paga anterior
metadata: 
  node_type: memory
  type: reference
  originSessionId: d87346c5-50b4-4899-9589-2e0923f0080e
---

# FunPlay — Transferência de Licença

**Regra:** Licenças FunPlay **não podem ser transferidas** entre dispositivos que já tiveram licença paga. A reutilização só é possível para **novos aplicativos recém-adicionados que nunca tiveram licença paga anteriormente**.

**Por isso:** a lista de 99 MACs com licença válida e assinatura vencida serve como referência de contexto (saber que há licenças ativas em clientes inativos), mas esses MACs não podem ser migrados para dispositivos de outros clientes.

**Caso de uso real:** quando um cliente novo ativa o FunPlay pela primeira vez (device recém-adicionado, `payed: false`), é possível aproveitar o endpoint de ativação para registrar a lista IPTV nesse device.

**Próximo passo:** Jonas irá mostrar o endpoint de cadastro de lista em aplicativos novos no FunPlay (a ser documentado).

**Why:** Confirmado pelo Jonas em 19/06/2026 — a plataforma FunPlay não permite transferência entre devices que já passaram por ativação paga.

**How to apply:** Nunca sugerir "transferir o MAC/licença" de um device existente para outro. O reaproveitamento de crédito só ocorre no momento da ativação de um device novo.

Ver também: [[reference-funplays-api]]

## Teste real 13/10/2026 (tráfego capturado via Playwright, Jonas operando o painel)

- Endpoint: `PUT https://api.funplays.app/reseller/device/transfer` body `{"from_id":<id origem>,"to_id":<id destino>}` (ids internos da FunPlay, não MAC). Antes o painel chama `GET /reseller/validate_mac?mac=...` no destino.
- **Destino já pago (Cleber Splendor `66:64:82:84:b4:10`, id 229853, payed=true, venc. 18/10/2026): 400 três vezes.** Excluir (`DELETE /reseller/devices {"id"}`) e readicionar (`POST /reseller/add_existing_device {"mac","key"}`) **não zera**: volta o mesmo id, payed=true — continua recusado.
- **Destino em teste, nunca pago (Marcos Alecsander Vieira `AC:5A:F0:53:25:1C`, id 3150078, criado 06/10, teste até 13/10): 200.** Ficou payed=true até 15/12/2026 = validade exata da origem (Carlos Emilio `3c:82:b6:27:28:6f`, id 87515) — **não soma**, herda a data da origem.
- A origem **some da lista do revendedor** depois da transferência (o sync vai marcar `removido_em` sozinho).
- Corpo da resposta 400 não foi capturado (página recarregou) — mensagem exata ainda desconhecida.
- Achado extra 13/10: depois de ceder a licença, a origem (Carlos, id 87515) volta a `payed:false` no `validate_mac`. `validate_mac` devolve o número interno até de aparelho fora da lista do revendedor (os "em teste" cadastrados à mão).

## Implementado 13/10/2026 (⚠️ sem commit, teste na tela pendente)
"🎁 Licença sobrando" em /alertas também no Fun Play (`APPS_COM_TRANSFERENCIA_PAINEL = [3]`; Lazer/Core só depois de 1 teste real), nas linhas de aparelho novo ("Precisa ativar" ou cadastrado fora do painel). Pedido do Jonas: transferir **no lugar do add existing**. A rota `transferir-licenca` confere: origem no painel ativo com 30+ dias → destino `payed=false` → `PUT /reseller/device/transfer` direto no id do `validate_mac` (se recusar e o aparelho estiver fora do painel: add existing grátis + 1 nova tentativa — não testado) → confere `payed=true` → comentário com o nome do cliente → grava os dois aparelhos + auditoria (`gravarTransferencia`, compartilhada com o SmartOne).
- Mesmo dia: Jonas liberou Lazer Play e Core Player (`APPS_COM_TRANSFERENCIA_PAINEL = [3, 2, 31]`, sem teste real neles; regra dos 30 dias aplicada igual) e mandou tirar o "+1 ano" de /alertas ("a aplicação manual não vai mais acontecer") — modal de renovação manual removido da tela; a action `renovarAplicativo` continua (usada em `ModalRenovarAplicativo`).
- Mesmo dia: "Ativar no painel" também nas linhas de aparelho novo fora do painel. `ativar-painel` agora, se o aparelho não está no painel, faz `validate_mac` + add existing com a `chave` do banco (grátis) e só então ativa (1 crédito). Sem chave → pede pra preencher.
