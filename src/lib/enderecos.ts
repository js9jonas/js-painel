// src/lib/enderecos.ts — endereços públicos do app (ver src/proxy.ts).
// Fixos no código (não NEXT_PUBLIC_*), como o resto do projeto.

/** Painel de gestão: login, webhooks, links que só o Jonas abre. */
export const URL_PAINEL = "https://painel.jssistemas.online";

/** Páginas públicas do cliente (link de pagamento). Nada do painel responde neste endereço. */
export const HOST_CLIENTE = "cliente.jssistemas.online";
export const URL_CLIENTE = `https://${HOST_CLIENTE}`;
