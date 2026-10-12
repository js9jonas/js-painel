export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { normalizarHost, chaveHost } from "@/lib/hosts";
import { definirPrincipal, getHostsServidores, type PapelHost } from "@/lib/servidor-hosts";

// Hosts de lista de cada servidor (aba "Hosts" de /conexoes).
// GET → servidores com hosts + hosts desconhecidos achados nas playlists
// POST { acao: "adicionar", id_painel_servidor, host, papel } · { acao: "papel", id, papel } · { acao: "remover", id }

const PAPEIS: PapelHost[] = ["principal", "secundario", "inativo"];
const NOME_PAPEL: Record<PapelHost, string> = { principal: "principal", secundario: "secundário", inativo: "inativo" };

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  try {
    return NextResponse.json(await getHostsServidores());
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não deu pra ler os hosts." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const acao = corpo?.acao;
  const papel = corpo?.papel as PapelHost;
  if ((acao === "adicionar" || acao === "papel") && !PAPEIS.includes(papel)) {
    return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let descricao = "";
    let antes: Record<string, unknown> | null = null;
    let depois: Record<string, unknown> = {};

    if (acao === "adicionar") {
      const idPainel = Number(corpo?.id_painel_servidor);
      const host = normalizarHost(corpo?.host);
      if (!host) throw new ErroUsuario("Endereço inválido. Use o formato http://dominio.com");
      const { rows: ps } = await client.query<{ nome: string }>(`SELECT nome FROM public.painel_servidores WHERE id = $1`, [idPainel]);
      if (!ps[0]) throw new ErroUsuario("Servidor não encontrado.");
      const { rows: dup } = await client.query<{ nome: string }>(
        `SELECT ps.nome FROM public.servidor_hosts h JOIN public.painel_servidores ps ON ps.id = h.id_painel_servidor
          WHERE lower(h.host) = lower($1)`,
        [host]
      );
      if (dup[0]) throw new ErroUsuario(`Esse endereço já está no servidor ${dup[0].nome}.`);
      // mesmo domínio com a porta padrão escrita de outro jeito também conta como repetido
      const { rows: todos } = await client.query<{ host: string }>(`SELECT host FROM public.servidor_hosts`);
      if (todos.some((t) => chaveHost(t.host) === chaveHost(host))) throw new ErroUsuario("Esse endereço já está cadastrado.");

      if (papel === "principal") {
        await definirPrincipal(client, idPainel, host);
      } else {
        await client.query(
          `INSERT INTO public.servidor_hosts (id_painel_servidor, host, papel) VALUES ($1, $2, $3)`,
          [idPainel, host, papel]
        );
      }
      descricao = `Host ${host} adicionado ao servidor ${ps[0].nome} como ${NOME_PAPEL[papel]}`;
      depois = { id_painel_servidor: idPainel, host, papel };
    } else if (acao === "papel" || acao === "remover") {
      const { rows } = await client.query<{ id: number; id_painel_servidor: number; host: string; papel: PapelHost; nome: string }>(
        `SELECT h.id, h.id_painel_servidor, h.host, h.papel, ps.nome
           FROM public.servidor_hosts h JOIN public.painel_servidores ps ON ps.id = h.id_painel_servidor
          WHERE h.id = $1 FOR UPDATE OF h`,
        [Number(corpo?.id)]
      );
      const h = rows[0];
      if (!h) throw new ErroUsuario("Host não encontrado. Recarregue a tela.");
      if (h.papel === "principal") {
        throw new ErroUsuario("Esse é o principal. Escolha outro host como principal antes de mudar ou remover este.");
      }
      antes = { host: h.host, papel: h.papel };
      if (acao === "remover") {
        await client.query(`DELETE FROM public.servidor_hosts WHERE id = $1`, [h.id]);
        descricao = `Host ${h.host} removido do servidor ${h.nome}`;
        depois = { removido: true };
      } else if (papel === "principal") {
        await definirPrincipal(client, Number(h.id_painel_servidor), h.host);
        descricao = `Host ${h.host} virou o principal do servidor ${h.nome} (credenciais e listas novas usam ele)`;
        depois = { host: h.host, papel };
      } else {
        await client.query(`UPDATE public.servidor_hosts SET papel = $2, atualizado_em = now() WHERE id = $1`, [h.id, papel]);
        descricao = `Host ${h.host} do servidor ${h.nome} marcado como ${NOME_PAPEL[papel]}`;
        depois = { host: h.host, papel };
      }
    } else {
      throw new ErroUsuario("Ação inválida.");
    }

    await registrarAudit(client, { tipo: "servidor_host", id_cliente: null, descricao, dados_antes: antes, dados_depois: depois });
    await client.query("COMMIT");
    revalidatePath("/conexoes");
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    const status = e instanceof ErroUsuario ? 400 : 500;
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não deu pra salvar." }, { status });
  } finally {
    client.release();
  }
}

class ErroUsuario extends Error {}
