---
name: reference-mensagem-reinicio-suporte
description: Mensagem padrão do WhatsApp para clientes que relatam travamento/app não abre — procedimento de desligar tudo da tomada por 2min e religar na ordem certa
metadata:
  node_type: memory
  type: reference
  originSessionId: 01T3nNbQ1QpZP2jKSnweX3mq
  modified: 2026-09-07
---

Mensagem que Jonas envia no WhatsApp depois que a conversa já foi iniciada pelo cliente (sem saudação — o cliente já mandou a primeira mensagem relatando o problema), pra travamento/demora ao trocar canal/app não abre. Refinada em 07/09/2026 a partir de uma versão mais solta que ele já usava.

**Texto final (copiar e colar):**

```
Antes de mais nada, vamos fazer o procedimento que resolve praticamente todos os problemas — funciona mesmo quando a internet parece estar normal:

1️⃣  Desligue tudo da tomada:
🔌 Roteador, modem, repetidor, etc.
📺 TV ou TV Box (se você usa um)

⏱️  Deixe tudo desligado por no mínimo 2 minutos (conta no relógio — menos tempo que isso não costuma resolver).

2️⃣  Ligue na ordem certa:
🔌 Primeiro o roteador e o modem — espere uns 30 segundos
📺 Só depois ligue a TV/TV Box — espere mais alguns segundos antes de abrir o app

Se mesmo assim continuar algum problema, me chama de novo para investigarmos mais a fundo! 🔎
```

**Decisões de conteúdo (por que ficou assim, pra não perder ao editar de novo no futuro):**

- **Pedir pra desligar a TV sempre, mesmo sem TV Box** — decisão deliberada do Jonas: tecnicamente só o TV Box interfere no sistema (é onde o app roda), mas pedir "desligue a TV *ou* TV Box" deixava brecha pro cliente leigo que não tem TV Box interpretar que não precisa desligar nada. Cobrir os dois casos sem exigir que o cliente saiba distinguir os dois aparelhos.
- **Ordem de religar importa pra dispositivos lentos/obsoletos** — religar roteador/modem primeiro e esperar ~30s antes de ligar TV/TV Box dá tempo da internet subir antes do aparelho tentar conectar; sem isso, aparelhos mais fracos podem tentar carregar o app antes da rede estar pronta e travar de novo.
- **Blocos numerados (1️⃣ desligar / 2️⃣ ligar)** em vez de um texto corrido — ficou explícito que tem uma sequência em cada etapa, não só "desliga tudo e liga tudo".
- **Fechamento** ("Se mesmo assim continuar algum problema, me chama de novo para investigarmos mais a fundo! 🔎") — texto exato pedido pelo Jonas, substituindo uma versão anterior mais genérica.
- Sem saudação de propósito — ele usa isso como segunda mensagem, depois que o cliente já abriu a conversa relatando o problema.
