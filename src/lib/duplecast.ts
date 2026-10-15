// Duplecast (duplecast.com, revenda Blesta) no js-painel (15/10/2026). O site inteiro tem managed challenge do
// Cloudflare (docs/memoria/reference_duplecast_revenda.md): tudo passa pelo robô de navegador (src/lib/robo.ts +
// robo-navegador/extensao/duplecast.js), com o login do painel_servidores tipo 'duplecast'.
//
// - Validade: lista de códigos de ativação (MAC + vencimento). Ativar gasta 1 CÓDIGO = 1 ano; o robô não gasta se
//   o aparelho já vale por mais de 40 dias (toque duplo, aba velha).
// - Listas: só as playlists cadastradas pela revenda (as que o cliente pôs pelo site dele não aparecem lá).
//   aplicativo_playlists.playlist_id_externo = id da playlist no Duplecast.
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { ID_APP_DUPLECAST } from "@/lib/apps-painel-ids";
import { executarNoRobo } from "@/lib/robo";

type ListaDuplecast = { id: number; mac: string; nome: string; url: string; nota: string; acessada_em: string | null };
type AparelhoDuplecast = { mac: string; validade: string | null; codigos_livres: number };
type AppDuplecast = {
  id_app_registro: number; id_cliente: number | null; mac: string; nome_cliente: string | null;
  validade: string | null; id_painel_servidor: number | null;
};

async function painelDuplecastAtivo(): Promise<{ id: number; nome: string } | null> {
  const { rows } = await pool.query<{ id: number; nome: string }>(
    `SELECT id::int, nome FROM public.painel_servidores WHERE tipo = 'duplecast' AND ativo = true ORDER BY id DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

async function carregar(idAppRegistro: number): Promise<AppDuplecast> {
  const { rows } = await pool.query<AppDuplecast & { id_app: number }>(
    `SELECT ap.id_app_registro::int, ap.id_cliente::int, ap.mac, ap.id_app::int, ap.validade::text, ap.id_painel_servidor::int,
            cl.nome AS nome_cliente
     FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     WHERE ap.id_app_registro = $1 AND ap.removido_em IS NULL`,
    [idAppRegistro]
  );
  const a = rows[0];
  if (!a) throw new Error("Aplicativo não encontrado.");
  if (a.id_app !== ID_APP_DUPLECAST) throw new Error("Esse aplicativo não é Duplecast.");
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

/** Espelha as playlists do MAC em aplicativo_playlists (some o que não existe mais na revenda). */
async function gravarListas(idAppRegistro: number, listas: ListaDuplecast[]): Promise<void> {
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
      // O Duplecast não marca lista "ativa": a primeira fica marcada só pra coluna Playlists ter destaque
      [idAppRegistro, pl.id, pl.nome || null, pl.url || null, i === 0, rows[0]?.id_conta ?? null]
    );
  }
  await pool.query(
    `DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo != ALL($2::bigint[])`,
    [idAppRegistro, listas.map((l) => l.id)]
  );
  // Último acesso da TV à lista (Date Fetched): o mais recente entre as playlists
  const acesso = listas.map((l) => l.acessada_em).filter(Boolean).sort().pop();
  if (acesso) await pool.query(`UPDATE public.aplicativos SET lista_acessada_em = $1::date WHERE id_app_registro = $2`, [acesso, idAppRegistro]);
}

async function gravarValidade(app: AppDuplecast, validade: string | null, idPainel: number | null, descricao: string, status?: "ativa") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.aplicativos
       SET validade = $1::date, id_painel_servidor = COALESCE($2, id_painel_servidor), status = COALESCE($4, status), atualizado_em = NOW()
       WHERE id_app_registro = $3`,
      [validade, idPainel, app.id_app_registro, status ?? null]
    );
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: app.id_cliente,
      id_app_registro: app.id_app_registro,
      descricao,
      dados_antes: { validade: app.validade, id_painel_servidor: app.id_painel_servidor },
      dados_depois: { validade, id_painel_servidor: idPainel },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function auditar(app: AppDuplecast, descricao: string, antes: Record<string, unknown>, depois: Record<string, unknown>) {
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

/** Botão "Atualizar": validade pelos códigos + playlists da revenda. Não gasta código. */
export async function atualizarAppDuplecast(idAppRegistro: number): Promise<{ validade: string | null; mudou: boolean; aviso?: string }> {
  const app = await carregar(idAppRegistro);
  const r = await executarNoRobo<AparelhoDuplecast & { listas: ListaDuplecast[] }>("duplecast", "aparelho", { mac: app.mac });
  await gravarListas(idAppRegistro, r.listas);
  const painel = await painelDuplecastAtivo();
  const mudou = r.validade !== app.validade || (!!painel && app.id_painel_servidor !== painel.id);
  if (mudou) await gravarValidade(app, r.validade, painel?.id ?? null, `Validade atualizada pelo Duplecast (só este aparelho)`);
  return {
    validade: r.validade,
    mudou,
    aviso: r.validade ? undefined : "Nenhum código de ativação usado nesse MAC no Duplecast.",
  };
}

/** Ativa/renova 1 ano (1 CÓDIGO). Já ativo por mais de 40 dias: não gasta, só copia a validade. */
export async function ativarAppDuplecast(idAppRegistro: number): Promise<{ validade: string | null; jaAtivado: boolean }> {
  const app = await carregar(idAppRegistro);
  const r = await executarNoRobo<AparelhoDuplecast & { ja_ativado: boolean; codigo: string | null }>("duplecast", "ativar", { mac: app.mac });
  const painel = await painelDuplecastAtivo();
  await gravarValidade(app, r.validade, painel?.id ?? null, r.ja_ativado
    ? "Ativação no Duplecast não feita: já estava ativado; validade copiada da revenda"
    : `Ativado no Duplecast (código ${r.codigo}, 1 ano)`, "ativa");
  return { validade: r.validade, jaAtivado: r.ja_ativado };
}

export async function criarListaAppDuplecast(idAppRegistro: number, nome: string, url: string): Promise<void> {
  const app = await carregar(idAppRegistro);
  const listas = await executarNoRobo<ListaDuplecast[]>("duplecast", "criar", { mac: app.mac, cliente: app.nome_cliente ?? "", nome, url });
  await gravarListas(idAppRegistro, listas);
  await auditar(app, `Lista "${nome}" criada no Duplecast`, {}, { nome });
}

export async function editarListaAppDuplecast(idAppRegistro: number, idExterno: number, dados: { nome?: string; url?: string }): Promise<void> {
  const app = await carregar(idAppRegistro);
  const listas = await executarNoRobo<ListaDuplecast[]>("duplecast", "editar", { id: idExterno, mac: app.mac, nome: dados.nome, url: dados.url });
  await gravarListas(idAppRegistro, listas);
  await auditar(app, `Lista "${dados.nome ?? idExterno}" editada no Duplecast`, { id: idExterno }, { nome: dados.nome ?? null, url_trocada: dados.url != null });
}

export async function apagarListaAppDuplecast(idAppRegistro: number, idExterno: number): Promise<void> {
  const app = await carregar(idAppRegistro);
  const listas = await executarNoRobo<ListaDuplecast[]>("duplecast", "apagar", { id: idExterno, mac: app.mac });
  await gravarListas(idAppRegistro, listas);
  await auditar(app, `Lista ${idExterno} apagada no Duplecast`, { id: idExterno }, {});
}
