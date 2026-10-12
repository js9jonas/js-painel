export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { apagarListaNoAparelho, entrarComoAparelho, getPlaylistsDispositivo, listasNoAparelho } from "@/lib/painel-adapters/appacesso";
import { configDoTipo, painelAppPorId, sessaoPainelApp, TIPO_POR_ID_APP } from "@/lib/app-painel";

// Listas que estão de fato no aparelho (Fun Play / Lazer Play / Core Player), vistas pelo site do
// CLIENTE com MAC + chave — inclusive as OCULTAS, que o painel de revenda não mostra (achado de 12/10/2026).
// GET → listas (sem senha) · DELETE { id } → apaga uma lista do aparelho.

type AppDados = {
  id_app: number; mac: string | null; chave: string | null; id_cliente: number | null;
  id_painel_servidor: number | null; id_dispositivo_painel: string | null;
};

async function carregar(idParam: string) {
  const id = parseInt(idParam, 10);
  if (isNaN(id)) throw new ErroUsuario("ID inválido.");
  const { rows } = await pool.query<AppDados>(
    `SELECT id_app, mac, chave, id_cliente, id_painel_servidor, id_dispositivo_painel::text
       FROM public.aplicativos WHERE id_app_registro = $1 AND removido_em IS NULL`,
    [id]
  );
  const app = rows[0];
  if (!app) throw new ErroUsuario("Aplicativo não encontrado.");
  const tipo = TIPO_POR_ID_APP[Number(app.id_app)];
  if (!tipo) throw new ErroUsuario("Só Fun Play, Lazer Play e Core Player mostram as listas do aparelho.");
  if (!app.mac) throw new ErroUsuario("Aplicativo sem MAC cadastrado.");
  if (!app.chave) throw new ErroUsuario("Aplicativo sem chave do dispositivo cadastrada.");
  const cfg = configDoTipo(tipo);
  const tokenAparelho = await entrarComoAparelho(cfg, app.mac, app.chave);
  return { id, app, cfg, tokenAparelho };
}

/** Ids que o painel de revenda mostra (as demais são ocultas). null = não deu pra saber. */
async function idsVisiveisNoPainel(app: AppDados): Promise<Set<number> | null> {
  if (!app.id_painel_servidor || !app.id_dispositivo_painel) return null;
  try {
    const painel = await painelAppPorId(Number(app.id_painel_servidor));
    if (!painel) return null;
    const token = await sessaoPainelApp(painel);
    const listas = await getPlaylistsDispositivo(painel.cfg, token, Number(app.id_dispositivo_painel));
    return new Set(listas.map((p) => Number(p.id)));
  } catch {
    return null;
  }
}

function partesDaUrl(url: string): { host: string; usuario: string | null } {
  try {
    const u = new URL(url);
    return { host: u.host, usuario: u.searchParams.get("username") };
  } catch {
    return { host: url.split("/")[2] ?? "?", usuario: null };
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ idAppRegistro: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    const { app, cfg, tokenAparelho } = await carregar((await params).idAppRegistro);
    const [listas, visiveis] = await Promise.all([listasNoAparelho(cfg, tokenAparelho), idsVisiveisNoPainel(app)]);
    return NextResponse.json({
      listas: listas.map((p) => ({
        id: Number(p.id),
        nome: p.name,
        ...partesDaUrl(p.url),
        ativa: !!p.is_selected,
        oculta: visiveis ? !visiveis.has(Number(p.id)) : null,
        criada_em: p.createdAt ?? null,
      })),
    });
  } catch (e: unknown) {
    const status = e instanceof ErroUsuario ? 400 : 502;
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não deu pra ler as listas do aparelho." }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ idAppRegistro: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const idLista = Number(corpo?.id);
  if (!idLista) return NextResponse.json({ erro: "Lista não informada." }, { status: 400 });
  try {
    const { id, app, cfg, tokenAparelho } = await carregar((await params).idAppRegistro);
    const lista = (await listasNoAparelho(cfg, tokenAparelho)).find((p) => Number(p.id) === idLista);
    if (!lista) return NextResponse.json({ erro: "Essa lista não está mais no aparelho. Recarregue." }, { status: 404 });
    await apagarListaNoAparelho(cfg, tokenAparelho, idLista);

    const { host, usuario } = partesDaUrl(lista.url);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM public.aplicativo_playlists WHERE id_app_registro = $1 AND playlist_id_externo = $2`,
        [id, idLista]
      );
      await registrarAudit(client, {
        tipo: "alteracao_app",
        id_cliente: app.id_cliente,
        id_app_registro: id,
        descricao: `Lista "${lista.name}" (${host}${usuario ? `, ${usuario}` : ""}) apagada do aparelho ${app.mac} pelo site do cliente`,
        dados_antes: { id: idLista, nome: lista.name, host, usuario, ativa: !!lista.is_selected },
        dados_depois: { removida: true },
      });
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      // a lista já saiu do aparelho; falha aqui só deixa de registrar
    } finally {
      client.release();
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const status = e instanceof ErroUsuario ? 400 : 502;
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não deu pra apagar a lista." }, { status });
  }
}

class ErroUsuario extends Error {}
