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
