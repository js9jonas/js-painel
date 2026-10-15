// POP Player (popplayer.pro) no js-painel (15/10/2026). O site inteiro fica atrás do managed challenge do
// Cloudflare (ver docs/memoria/incident_popplayer_cloudflare_bloqueio.md): tudo passa pelo robô de navegador
// (src/lib/robo.ts + robo-navegador/extensao), que entra com o login do painel_servidores tipo 'popplayer'.
//
// No POP cada linha de "Meus Usuários" é UMA lista (id, nome do cliente, MAC); o mesmo MAC aparece uma vez
// por lista. Por isso a lista do js-painel (aplicativo_playlists) usa playlist_id_externo = id da linha no POP.
// Não há licença por aparelho ("Licença MAC" é uma data solta, padrão 2050-01-01): validade não é lida.
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { ID_APP_POPPLAYER } from "@/lib/apps-painel-ids";
import { executarNoRobo } from "@/lib/robo";

/** Uma linha do POP, como o robô devolve (robo-navegador/extensao/popplayer.js). */
export type PopLista = { id: number; mac: string; cliente: string; nome: string; url: string; validade: string | null };

type AppPop = { id_app_registro: number; id_cliente: number | null; mac: string; nome_cliente: string | null; id_painel_servidor: number | null };

async function painelPopAtivo(): Promise<number | null> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id::int FROM public.painel_servidores WHERE tipo = 'popplayer' AND ativo = true ORDER BY id DESC LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

async function carregar(idAppRegistro: number): Promise<AppPop> {
  const { rows } = await pool.query<AppPop & { id_app: number }>(
    `SELECT ap.id_app_registro::int, ap.id_cliente::int, ap.mac, ap.id_app::int, ap.id_painel_servidor::int, cl.nome AS nome_cliente
     FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     WHERE ap.id_app_registro = $1 AND ap.removido_em IS NULL`,
    [idAppRegistro]
  );
  const a = rows[0];
  if (!a) throw new Error("Aplicativo não encontrado.");
  if (a.id_app !== ID_APP_POPPLAYER) throw new Error("Esse aplicativo não é POP Player.");
  if (!a.mac) throw new Error("Aplicativo sem MAC cadastrado.");
  return a;
}

function usuarioDaUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("username");
  } catch {
    return null;
  }
}

/** Espelha as listas do MAC em aplicativo_playlists (some o que não existe mais no POP). */
async function gravarListasPop(idAppRegistro: number, listas: PopLista[]): Promise<void> {
  for (const [i, pl] of listas.entries()) {
    const usuario = usuarioDaUrl(pl.url);
    const { rows } = usuario
      ? await pool.query<{ id_conta: number }>(`SELECT id_conta FROM public.contas WHERE usuario = $1 AND removido_em IS NULL LIMIT 1`, [usuario])
      : { rows: [] as { id_conta: number }[] };
    await pool.query(
      `INSERT INTO public.aplicativo_playlists (id_app_registro, playlist_id_externo, nome, url, is_selected, id_conta, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id_app_registro, playlist_id_externo)
       DO UPDATE SET nome = EXCLUDED.nome, url = EXCLUDED.url, is_selected = EXCLUDED.is_selected, id_conta = EXCLUDED.id_conta, atualizado_em = NOW()`,
      // O POP não marca lista "ativa": a primeira fica marcada só pra coluna Playlists ter destaque
      [idAppRegistro, pl.id, pl.nome || null, pl.url || null, i === 0, rows[0]?.id_conta ?? null]
    );
  }
  await pool.query(
    `DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo != ALL($2::bigint[])`,
    [idAppRegistro, listas.map((l) => l.id)]
  );
}

async function listasDoMac(mac: string, usuario?: string | null): Promise<PopLista[]> {
  return executarNoRobo<PopLista[]>("popplayer", "listas_do_mac", { mac }, { usuario });
}

async function auditar(app: AppPop, descricao: string, antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await registrarAudit(client, { tipo: "alteracao_app", id_cliente: app.id_cliente, id_app_registro: app.id_app_registro, descricao, dados_antes: antes, dados_depois: depois });
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

/** Botão "Atualizar": lê as listas do MAC no POP e liga o aparelho ao painel. Validade não existe no POP. */
export async function atualizarAppPop(idAppRegistro: number, usuario?: string | null): Promise<{ validade: string | null; mudou: boolean; aviso?: string }> {
  const app = await carregar(idAppRegistro);
  const listas = await listasDoMac(app.mac, usuario);
  await gravarListasPop(idAppRegistro, listas);
  const idPainel = await painelPopAtivo();
  const mudou = !!idPainel && app.id_painel_servidor !== idPainel;
  if (mudou) {
    await pool.query(`UPDATE public.aplicativos SET id_painel_servidor = $1, atualizado_em = NOW() WHERE id_app_registro = $2`, [idPainel, idAppRegistro]);
  }
  const { rows } = await pool.query<{ validade: string | null }>(`SELECT validade::text FROM public.aplicativos WHERE id_app_registro = $1`, [idAppRegistro]);
  return {
    validade: rows[0]?.validade ?? null,
    mudou,
    aviso: listas.length ? undefined : "Esse MAC não tem nenhuma lista no POP Player.",
  };
}

/** Cria a lista no POP (o aparelho passa a existir lá com ela) com o nome do cliente, e relê as listas do MAC. */
export async function criarListaAppPop(idAppRegistro: number, nome: string, url: string, usuario?: string | null): Promise<void> {
  const app = await carregar(idAppRegistro);
  const listas = await executarNoRobo<PopLista[]>(
    "popplayer",
    "criar",
    { mac: app.mac, cliente: app.nome_cliente ?? "", nome, url },
    { usuario }
  );
  await gravarListasPop(idAppRegistro, listas);
  await auditar(app, `Lista "${nome}" criada no POP Player`, {}, { nome });
}

export async function editarListaAppPop(
  idAppRegistro: number,
  idExterno: number,
  dados: { nome?: string; url?: string },
  usuario?: string | null
): Promise<void> {
  const app = await carregar(idAppRegistro);
  const listas = await executarNoRobo<PopLista[]>(
    "popplayer",
    "editar",
    { id: idExterno, mac: app.mac, nome: dados.nome, url: dados.url },
    { usuario }
  );
  await gravarListasPop(idAppRegistro, listas);
  await auditar(app, `Lista "${dados.nome ?? idExterno}" editada no POP Player`, { id: idExterno }, { nome: dados.nome ?? null, url_trocada: dados.url != null });
}

export async function apagarListaAppPop(idAppRegistro: number, idExterno: number, usuario?: string | null): Promise<void> {
  const app = await carregar(idAppRegistro);
  const listas = await executarNoRobo<PopLista[]>("popplayer", "apagar", { id: idExterno, mac: app.mac }, { usuario });
  await gravarListasPop(idAppRegistro, listas);
  await auditar(app, `Lista ${idExterno} apagada no POP Player`, { id: idExterno }, {});
}
