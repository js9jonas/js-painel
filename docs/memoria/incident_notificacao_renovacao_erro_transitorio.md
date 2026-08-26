---
name: incident-notificacao-renovacao-erro-transitorio
description: "25/08/2026 — notificação de renovação caiu no fallback do Telegram mesmo com janela de 24h aberta; causa real era erro transitório da Meta, não falta de conversa — mensagem enganosa corrigida + retry adicionado"
metadata:
  node_type: memory
  type: project
  originSessionId: 2c8ab47b
---

**Incidente (25/08/2026, cliente id 255):** Jonas renovou a assinatura de um cliente com quem tinha acabado de trocar mensagens (minutos antes, bem dentro da janela de 24h). Mesmo assim, o sistema mandou o fallback do Telegram dizendo "Renovação sem conversa ativa", forçando ele a enviar manualmente pelo link `wa.me`.

**Investigação:** a query que checa a janela de 24h em `notificar-renovacao.ts` estava correta (confirmado rodando ela manualmente com os dados reais — achou a conta normalmente). O log do container no horário exato revelou a causa real:

```
[WhatsappEnvio] Erro ao enviar texto: {
  error: { message: '(#2) Service temporarily unavailable', code: 2,
           type: 'OAuthException', is_transient: true, ... }
}
```

A janela estava aberta, a query achou o telefone certo, mas o **envio direto falhou** por instabilidade momentânea do lado da própria Meta (`is_transient: true` — a API já sinaliza "tente de novo"). O código não tinha nenhum retry, então caiu direto no fallback do Telegram como projetado — só que a mensagem do Telegram é fixa e sempre dizia "sem conversa ativa", mesmo quando o motivo real era outro. Isso levou a uma leitura errada do problema até a investigação achar o log real.

**Correção aplicada** (`fix/whatsapp-erro-transitorio-mensagem-precisa`, no `main`):
1. `enviarTextoWhatsapp()` (`whatsapp-envio.ts`) ganhou retry único com 1.5s de delay quando `error.is_transient === true` — resolve sozinho a maioria dos casos como esse, sem precisar de fallback nenhum.
2. `notificarRenovacaoTelegram()` (`notificar-renovacao.ts`) agora recebe `haviaJanelaAberta` e diferencia a mensagem: "sem conversa ativa nas últimas 24h" vs. "⚠️ envio direto falhou (provável instabilidade da Meta), não é falta de conversa ativa".

**How to apply:** se a mensagem do Telegram voltar a aparecer dizendo "sem conversa ativa" quando você tem certeza que acabou de trocar mensagem com o cliente, agora o próprio texto já vai dizer se foi falta de janela ou erro de envio — não precisa investigar do zero. Pra confirmar/depurar de novo no futuro: comparar a última mensagem `origem='cliente'` em `whatsapp_mensagens` (por telefone, não por `id_cliente` — reparei que mensagens recebidas nem sempre têm `id_cliente` preenchido, só `telefone`) contra o horário da tentativa, e checar os logs do container (`docker logs <CID> --since <hora> --until <hora>`) por `[WhatsappEnvio] Erro ao enviar texto`.
