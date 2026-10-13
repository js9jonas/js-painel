---
name: reference-funplays-licenca-transferencia
description: Transferência de licença Fun Play/Lazer/Core — só para aparelho novo sem licença paga; endpoint, regras do teste real de 13/10/2026 e como está implementado em /alertas
metadata:
  node_type: memory
  type: reference
  originSessionId: d87346c5-50b4-4899-9589-2e0923f0080e
  modified: 2026-10-13
---

# Fun Play (plataforma appacesso) — transferência de licença

## Regras (teste real do Jonas em 13/10/2026, tráfego capturado via Playwright)

- **Só transfere para aparelho SEM licença paga** (`payed=false` no `validate_mac`): aparelho novo, em teste, nunca ativado.
  Destino já pago (Cleber Splendor `66:64:82:84:b4:10`, id 229853, vencia 18/10) → **400 três vezes**.
  Excluir (`DELETE /reseller/devices {id}`) e readicionar (`POST /reseller/add_existing_device {mac,key}`) **não zera**: volta o mesmo id, ainda pago.
- **Não soma**: o destino fica com a data exata da origem (Marcos Alecsander Vieira `AC:5A:F0:53:25:1C` recebeu 15/12/2026, a data do Carlos Emilio `3c:82:b6:27:28:6f`).
- **Origem** sai da lista do revendedor e volta a `payed=false` no `validate_mac` (o sync marca `removido_em` sozinho).
- Origem precisa ter **30+ dias** (regra informada pelo Jonas antes; aplicada igual ao Lazer/Core).
- `validate_mac` devolve o número interno mesmo de aparelho fora da lista do revendedor (os "em teste" cadastrados à mão).
- Corpo da resposta 400 não foi capturado — mensagem exata desconhecida.

Histórico: em 19/06/2026 a regra anotada era "não transfere entre aparelhos já pagos" — continua certa; o que mudou é que agora sabemos que serve para aparelho novo, no lugar de add existing + crédito.

## Endpoint

`PUT https://api.funplays.app/reseller/device/transfer` body `{"from_id":<id origem>,"to_id":<id destino>}` (ids internos, não MAC). O painel chama antes `GET /reseller/validate_mac?mac=` no destino. Função: `transferirLicenca` em `src/lib/painel-adapters/appacesso.ts`.

## Implementado (commits `3e5ed66` + `73d1dbc`, 13/10/2026 — ⚠️ deploy manual e teste na tela pendentes)

- /alertas: "🎁 Licença sobrando" nas linhas de aparelho novo Fun/Lazer/Core ("Precisa ativar" ou cadastrado fora do painel), ao lado de "Ativar no painel" — `APPS_COM_TRANSFERENCIA_PAINEL = [3, 2, 31]` em `src/lib/apps-painel-ids.ts`. **Lazer e Core liberados sem teste real**, a pedido do Jonas (mesma API).
- Pedido do Jonas: transferir **no lugar do add existing**. Rota `transferir-licenca`: origem no painel ativo com 30+ dias → destino `payed=false` → transfere direto no id do `validate_mac` → se recusar e o aparelho estiver fora do painel, add existing (grátis) + 1 nova tentativa (**caminho não testado**) → confere `payed=true` → comentário com o nome do cliente → grava os dois aparelhos + auditoria (`gravarTransferencia`, compartilhada com o SmartOne).
- "Ativar no painel" (`ativar-painel`) traz aparelho de fora do painel pelo add existing com a `chave` do banco antes de ativar (1 crédito). Sem chave → pede pra preencher.
- Botão "+1 ano" (renovação manual) **removido** de /alertas: "a aplicação manual não vai mais acontecer" (Jonas, 13/10). A action `renovarAplicativo` continua (usada em `ModalRenovarAplicativo`). Apps sem painel (ex.: Clouddy) ficam sem botão em /alertas.
- Lista de origens: `getLicencasSobrando(tipo)` em `src/lib/licencas-sobrando.ts` (Fun/Lazer/Core só do painel ativo). Em 13/10: 84 Fun Play sobrando, 78 com 30+ dias.

📋 Primeiro uso real: testar num dos aparelhos em teste fora do painel (Eduarda Cardoso `D1:4B:03:2E:6C:1F`, Marco Aurélio `AC:5A:F0:4D:34:98`, Lucas Vieira `78:DD:12:66:09:FE`, Rafaela `EC:F4:51:41:95:0C`) — tira a dúvida se transfere sem estar no painel.

Ver também: [[reference-funplays-api]], [[project-funplay-licencas-livres]], `project_chat_leitura_imagem_mac.md` (licença sobrando do SmartOne)
- `73d1dbc`: no modal, nome do cliente abre `/clientes/{id}` em nova guia; tabela com colunas de largura fixa (o botão mudava de texto ao confirmar e as linhas pulavam de posição).
