// Endereços (hosts) de lista de cada servidor IPTV — tabela servidor_hosts (sql/015).
// O PRINCIPAL é espelhado em painel_servidores.host_stream, que é o que o resto do sistema usa para
// montar credenciais e listas. Ver /conexoes → aba "Hosts".
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { chaveHost } from "@/lib/hosts";

export type PapelHost = "principal" | "secundario" | "inativo";

export type HostServidor = { id: number; host: string; papel: PapelHost; observacao: string | null; listas: number };
export type ServidorComHosts = { id: number; nome: string; tipo: string; ativo: boolean; hosts: HostServidor[] };
export type HostDesconhecido = {
  host: string;
  listas: number;
  aparelhos: number;
  exemplos: string[];
  /** servidor mais comum entre as contas ligadas a essas listas (palpite, pode ser null) */
  sugestao_id: number | null;
};

// painéis de app não têm host de lista
const TIPOS_APP = ["funplays", "lazerplay", "coreplayer", "smartone"];

/** Torna `host` o principal do servidor (rebaixa o anterior para secundário) e espelha em host_stream. */
export async function definirPrincipal(client: PoolClient, idPainel: number, host: string): Promise<void> {
  const { rows } = await client.query<{ id: number; id_painel_servidor: number }>(
    `SELECT id, id_painel_servidor FROM public.servidor_hosts WHERE lower(host) = lower($1)`,
    [host]
  );
  const existente = rows[0];
  if (existente && Number(existente.id_painel_servidor) !== idPainel) {
    throw new Error("Esse endereço já está cadastrado em outro servidor.");
  }
  await client.query(
    `UPDATE public.servidor_hosts SET papel = 'secundario', atualizado_em = now()
      WHERE id_painel_servidor = $1 AND papel = 'principal' AND lower(host) <> lower($2)`,
    [idPainel, host]
  );
  if (existente) {
    await client.query(`UPDATE public.servidor_hosts SET papel = 'principal', atualizado_em = now() WHERE id = $1`, [existente.id]);
  } else {
    await client.query(
      `INSERT INTO public.servidor_hosts (id_painel_servidor, host, papel) VALUES ($1, $2, 'principal')`,
      [idPainel, host]
    );
  }
  await client.query(`UPDATE public.painel_servidores SET host_stream = $2 WHERE id = $1`, [idPainel, host]);
}

export async function getHostsServidores(): Promise<{ servidores: ServidorComHosts[]; desconhecidos: HostDesconhecido[] }> {
  const [srv, hosts, listas] = await Promise.all([
    pool.query<{ id: number; nome: string; tipo: string; ativo: boolean }>(
      // só servidores ativos — os desativados (ex.: CLUB antigo) não entram mais na tela
      `SELECT id, nome, tipo, ativo FROM public.painel_servidores
        WHERE tipo <> ALL($1::text[]) AND ativo = true ORDER BY nome`,
      [TIPOS_APP]
    ),
    pool.query<{ id: number; id_painel_servidor: number; host: string; papel: PapelHost; observacao: string | null }>(
      `SELECT id, id_painel_servidor, host, papel, observacao FROM public.servidor_hosts
        ORDER BY CASE papel WHEN 'principal' THEN 0 WHEN 'secundario' THEN 1 ELSE 2 END, host`
    ),
    // listas atuais (aparelho não removido), agrupadas pelo endereço
    pool.query<{ host: string; listas: number; aparelhos: number; exemplos: string[]; paineis: (number | null)[] }>(
      `SELECT substring(ap.url from '^(https?://[^/?#]+)') AS host,
              count(*)::int AS listas,
              count(DISTINCT ap.id_app_registro)::int AS aparelhos,
              (array_agg(DISTINCT cl.nome))[1:3] AS exemplos,
              array_agg(co.id_painel_servidor) AS paineis
         FROM public.aplicativo_playlists ap
         JOIN public.aplicativos a ON a.id_app_registro = ap.id_app_registro AND a.removido_em IS NULL
         LEFT JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
         LEFT JOIN public.contas co ON co.id_conta = ap.id_conta
        WHERE ap.url ~* '^https?://'
        GROUP BY 1`
    ),
  ]);

  const conhecidos = new Set(hosts.rows.map((h) => chaveHost(h.host)));
  const listasPorChave = new Map<string, number>();
  const desconhecidosPorChave = new Map<string, HostDesconhecido & { votos: Map<number, number> }>();

  for (const l of listas.rows) {
    if (!l.host) continue;
    const chave = chaveHost(l.host);
    listasPorChave.set(chave, (listasPorChave.get(chave) ?? 0) + l.listas);
    if (conhecidos.has(chave)) continue;
    const d = desconhecidosPorChave.get(chave) ?? { host: l.host.toLowerCase(), listas: 0, aparelhos: 0, exemplos: [] as string[], sugestao_id: null, votos: new Map<number, number>() };
    d.listas += l.listas;
    d.aparelhos += l.aparelhos;
    for (const e of l.exemplos ?? []) if (e && d.exemplos.length < 3 && !d.exemplos.includes(e)) d.exemplos.push(e);
    for (const p of l.paineis ?? []) if (p != null) d.votos.set(Number(p), (d.votos.get(Number(p)) ?? 0) + 1);
    desconhecidosPorChave.set(chave, d);
  }

  const servidores: ServidorComHosts[] = srv.rows.map((s) => ({
    id: Number(s.id),
    nome: s.nome,
    tipo: s.tipo,
    ativo: s.ativo,
    hosts: hosts.rows
      .filter((h) => Number(h.id_painel_servidor) === Number(s.id))
      .map((h) => ({ id: Number(h.id), host: h.host, papel: h.papel, observacao: h.observacao, listas: listasPorChave.get(chaveHost(h.host)) ?? 0 })),
  }));

  const desconhecidos: HostDesconhecido[] = [...desconhecidosPorChave.values()]
    .map(({ votos, ...d }) => {
      const melhor = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];
      return { ...d, sugestao_id: melhor ? melhor[0] : null };
    })
    .sort((a, b) => b.listas - a.listas);

  return { servidores, desconhecidos };
}
