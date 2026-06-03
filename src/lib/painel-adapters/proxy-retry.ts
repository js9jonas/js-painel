import type { Impit, HttpMethod, ImpitResponse } from "impit";

export interface FetchOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
}

// pdcapi.io e gesapioffice.com bloqueiam IPs do pool Webshare eventualmente.
// O proxy é rotativo — cada tentativa usa um IP diferente, contornando o bloqueio.
export async function impitFetch(
  client: Impit,
  url: string,
  options: FetchOptions = {},
  maxTentativas = 4
): Promise<ImpitResponse> {
  let ultimoErro: unknown;
  for (let t = 1; t <= maxTentativas; t++) {
    try {
      return await client.fetch(url, options);
    } catch (err: any) {
      ultimoErro = err;
      const eProxyError =
        err?.message?.includes("502") ||
        err?.message?.toLowerCase().includes("proxy") ||
        err?.message?.toLowerCase().includes("connect");
      if (!eProxyError || t === maxTentativas) throw err;
      await new Promise(r => setTimeout(r, 800 * t));
    }
  }
  throw ultimoErro;
}
