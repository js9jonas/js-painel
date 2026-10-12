// Endereço de lista IPTV ("http://dominio.com[:porta]"): formato gravado e chave de comparação.
// Sem dependências de servidor — usado também no navegador.

const HOST_RE = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/;

/** Normaliza o que foi digitado ("Dominio.com/", "http://x.com:8080") ou null se não for um endereço. */
export function normalizarHost(entrada: unknown): string | null {
  let h = String(entrada ?? "").trim().replace(/\/+$/, "");
  if (!h) return null;
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`;
  h = h.replace(/^(https?:\/\/)([^/]+)/i, (_m, p: string, d: string) => p.toLowerCase() + d.toLowerCase());
  return HOST_RE.test(h) ? h : null;
}

/** Chave para comparar endereços: minúsculo e sem a porta padrão (http://x.com:80 = http://x.com). */
export function chaveHost(host: string): string {
  return host.trim().toLowerCase().replace(/\/+$/, "").replace(/^(http:\/\/[^/]+):80$/, "$1").replace(/^(https:\/\/[^/]+):443$/, "$1");
}
